#!/usr/bin/env node

const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { createHash } = require("node:crypto");
const { access, mkdtemp, open, readFile, rm, writeFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const { cpus, freemem, platform, release, totalmem } = require("node:os");
const { extname, join, normalize, resolve, sep } = require("node:path");
const { tmpdir } = require("node:os");
const { promisify } = require("node:util");
const { chromium } = require("@playwright/test");

const MIB = 1024 * 1024;
const ROOT = resolve(__dirname, "..");
const HTML_PATH = join(__dirname, "browser-checksum.html");
const DIST_ROOT = join(ROOT, "dist", "esm");
const MAX_MAIN_THREAD_BLOCK_MS = 100;
const MAX_MAIN_HEAP_GROWTH_BYTES = 64 * MIB;
const MAX_BROWSER_RSS_GROWTH_BYTES = 512 * MIB;
const execFileAsync = promisify(execFile);

async function main() {
  const options = parseOptions(process.argv.slice(2));
  await access(join(DIST_ROOT, "browser.js"));
  const workRoot = await mkdtemp(join(tmpdir(), "large-image-ingest-browser-checksum-"));
  const fixturePath = join(workRoot, `zero-${options.sizeMib}mib.bin`);
  let server;
  let browserServer;
  let browser;

  try {
    const sourceSizeBytes = options.sizeMib * MIB;
    const chunkSizeBytes = options.chunkMib * MIB;
    const cancelAfterBytes = Math.min(
      sourceSizeBytes,
      Math.max(chunkSizeBytes * 2, Math.min(64 * MIB, Math.floor(sourceSizeBytes / 8)))
    );
    const expectedChecksum = calculateZeroChecksum(sourceSizeBytes, chunkSizeBytes);
    const handle = await open(fixturePath, "w");
    await handle.truncate(sourceSizeBytes);
    await handle.close();

    server = await startServer();
    browserServer = await chromium.launchServer({ headless: true, args: ["--enable-precise-memory-info"] });
    browser = await chromium.connect(browserServer.wsEndpoint());
    const page = await browser.newPage();
    page.setDefaultTimeout(Math.max(120_000, options.sizeMib * 2_000));
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(server.url);
    await page.locator("#source").setInputFiles(fixturePath);

    const cancel = await runMeasuredBrowserOperation(
      page,
      browserServer.process().pid,
      "cancel",
      { chunkSizeBytes, cancelAfterBytes }
    );
    assert.equal(cancel.status, "failed");
    assert.equal(cancel.errorCode, "checksum.canceled");
    assert.equal(cancel.cancelRequested, true);
    assert.equal(cancel.monotonic, true);
    assert.equal(cancel.lateProgressEvents, 0);

    const complete = await runMeasuredBrowserOperation(
      page,
      browserServer.process().pid,
      "complete",
      { chunkSizeBytes, cancelAfterBytes }
    );
    assert.equal(complete.status, "completed");
    assert.equal(complete.checksum, expectedChecksum);
    assert.equal(complete.sourceSizeBytes, sourceSizeBytes);
    assert.equal(complete.resultChunkSizeBytes, chunkSizeBytes);
    assert.equal(complete.maxLoadedBytes, sourceSizeBytes);
    assert.equal(complete.monotonic, true);
    assert.equal(complete.lateProgressEvents, 0);
    assert.equal(pageErrors.length, 0);

    for (const result of [cancel, complete]) {
      assert.ok(result.heartbeatCount > 0, "Browser responsiveness heartbeat did not run.");
      assert.ok(
        result.heartbeatMaxDelayMs < MAX_MAIN_THREAD_BLOCK_MS,
        `Main-thread heartbeat delay ${result.heartbeatMaxDelayMs.toFixed(2)} ms exceeded ${MAX_MAIN_THREAD_BLOCK_MS} ms.`
      );
      assert.ok(
        result.longTaskMaxMs < MAX_MAIN_THREAD_BLOCK_MS,
        `Main-thread long task ${result.longTaskMaxMs.toFixed(2)} ms exceeded ${MAX_MAIN_THREAD_BLOCK_MS} ms.`
      );
      if (result.heapStartBytes !== null && result.heapPeakBytes !== null) {
        assert.ok(
          result.heapPeakBytes - result.heapStartBytes < MAX_MAIN_HEAP_GROWTH_BYTES,
          "Main-thread JavaScript heap growth exceeded the fixed qualification bound."
        );
      }
      if (result.browserRssStartBytes !== null && result.browserRssPeakBytes !== null) {
        assert.ok(
          result.browserRssPeakBytes - result.browserRssStartBytes < MAX_BROWSER_RSS_GROWTH_BYTES,
          "Chromium process-tree RSS growth exceeded the fixed qualification bound."
        );
      }
    }

    const report = {
      schemaVersion: "large-image-ingest.browser-checksum-benchmark.v1",
      recordedAt: new Date().toISOString(),
      libraryVersion: require(join(ROOT, "package.json")).version,
      environment: {
        os: `${platform()} ${release()}`,
        architecture: process.arch,
        nodeVersion: process.version,
        browserVersion: await browser.version(),
        logicalCpuCount: cpus().length,
        totalSystemMemoryBytes: totalmem(),
        freeSystemMemoryBytesAtReport: freemem()
      },
      configuration: {
        sourceSizeBytes,
        chunkSizeBytes,
        cancelAfterBytes,
        maxMainThreadBlockMs: MAX_MAIN_THREAD_BLOCK_MS,
        maxMainHeapGrowthBytes: MAX_MAIN_HEAP_GROWTH_BYTES,
        maxBrowserRssGrowthBytes: MAX_BROWSER_RSS_GROWTH_BYTES,
        validatedWorkerReadSliceBytes: chunkSizeBytes,
        fixture: "sparse deterministic zero-filled File"
      },
      cancellation: sanitizeResult(cancel),
      completion: {
        ...sanitizeResult(complete),
        checksumVerified: true,
        throughputMibPerSecond: sourceSizeBytes / MIB / (complete.durationMs / 1000)
      },
      limitations: [
        "Chromium process-tree RSS includes browser overhead in addition to worker source buffers; its fixed growth gate is intentionally conservative.",
        "A sparse zero-filled fixture reduces fixture creation cost but still requires the browser Worker to read and hash every logical source byte.",
        "This machine-specific qualification does not predict remote upload throughput or every browser/device."
      ]
    };

    if (options.output) {
      const outputPath = resolve(ROOT, options.output);
      await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }
    printSummary(report, options.output);
  } finally {
    if (browser) await browser.close();
    if (browserServer) await browserServer.close();
    if (server) await server.close();
    await rm(workRoot, { recursive: true, force: true });
  }
}

async function runMeasuredBrowserOperation(page, browserPid, mode, input) {
  const memoryMonitor = await createProcessMemoryMonitor(browserPid);
  try {
    const result = await page.evaluate(async ({ selectedMode, selectedInput }) => (
      globalThis.browserChecksumBenchmark.run(selectedMode, selectedInput)
    ), { selectedMode: mode, selectedInput: input });
    return { ...result, ...(await memoryMonitor.stop()) };
  } catch (error) {
    await memoryMonitor.stop();
    throw error;
  }
}

async function createProcessMemoryMonitor(rootPid) {
  if (process.platform === "win32") {
    return { stop: async () => ({ browserRssStartBytes: null, browserRssPeakBytes: null, browserRssEndBytes: null }) };
  }
  let stopped = false;
  let sampleInFlight;
  let peakBytes = 0;
  const sample = async () => {
    if (sampleInFlight) return sampleInFlight;
    sampleInFlight = readProcessTreeRssBytes(rootPid).then((value) => {
      peakBytes = Math.max(peakBytes, value);
      return value;
    }).finally(() => { sampleInFlight = undefined; });
    return sampleInFlight;
  };
  const startBytes = await sample();
  const timer = setInterval(() => { void sample(); }, 250);
  return {
    async stop() {
      if (stopped) {
        return { browserRssStartBytes: startBytes, browserRssPeakBytes: peakBytes, browserRssEndBytes: peakBytes };
      }
      stopped = true;
      clearInterval(timer);
      if (sampleInFlight) await sampleInFlight;
      const endBytes = await sample();
      return { browserRssStartBytes: startBytes, browserRssPeakBytes: peakBytes, browserRssEndBytes: endBytes };
    }
  };
}

async function readProcessTreeRssBytes(rootPid) {
  const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,rss="], { maxBuffer: 4 * MIB });
  const processes = stdout.trim().split("\n").map((line) => {
    const [pid, parentPid, rssKib] = line.trim().split(/\s+/).map(Number);
    return { pid, parentPid, rssKib };
  }).filter((entry) => Number.isFinite(entry.pid));
  const children = new Map();
  for (const entry of processes) {
    const group = children.get(entry.parentPid) ?? [];
    group.push(entry);
    children.set(entry.parentPid, group);
  }
  let totalKib = 0;
  const pending = [rootPid];
  while (pending.length > 0) {
    const pid = pending.pop();
    const processEntry = processes.find((entry) => entry.pid === pid);
    if (processEntry) totalKib += processEntry.rssKib;
    for (const child of children.get(pid) ?? []) pending.push(child.pid);
  }
  return totalKib * 1024;
}

function parseOptions(args) {
  const options = { sizeMib: 64, chunkMib: 4, output: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--size-mib") options.sizeMib = parsePositiveInteger(args[++index], value);
    else if (value === "--chunk-mib") options.chunkMib = parsePositiveInteger(args[++index], value);
    else if (value === "--output") options.output = args[++index];
    else throw new Error(`Unknown option: ${value}`);
  }
  if (options.chunkMib > options.sizeMib) throw new Error("--chunk-mib must not exceed --size-mib.");
  if (options.output && (options.output.startsWith("/") || normalize(options.output).startsWith(`..${sep}`))) {
    throw new Error("--output must stay inside the repository.");
  }
  return options;
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function calculateZeroChecksum(sizeBytes, chunkSizeBytes) {
  const hash = createHash("sha256");
  const zeros = Buffer.alloc(Math.min(chunkSizeBytes, 4 * MIB));
  for (let remaining = sizeBytes; remaining > 0; remaining -= zeros.length) {
    hash.update(remaining >= zeros.length ? zeros : zeros.subarray(0, remaining));
  }
  return hash.digest("hex");
}

async function startServer() {
  const html = await readFile(HTML_PATH);
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, "http://127.0.0.1").pathname;
      if (path === "/") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        response.end(html);
        return;
      }
      if (!path.startsWith("/dist/esm/")) {
        response.writeHead(404).end();
        return;
      }
      const relative = path.slice("/dist/esm/".length);
      const filePath = resolve(DIST_ROOT, relative);
      if (!filePath.startsWith(`${DIST_ROOT}${sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const body = await readFile(filePath);
      const contentType = extname(filePath) === ".js" ? "text/javascript; charset=utf-8" : "application/octet-stream";
      response.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    })
  };
}

function sanitizeResult(result) {
  const { checksum: _checksum, ...safe } = result;
  return safe;
}

function printSummary(report, output) {
  const complete = report.completion;
  const canceled = report.cancellation;
  console.log(`PASS browser checksum qualification: ${report.configuration.sourceSizeBytes / MIB} MiB`);
  console.log(`completion: ${complete.durationMs.toFixed(2)} ms (${complete.throughputMibPerSecond.toFixed(2)} MiB/s)`);
  console.log(`main-thread max delay/long task: ${complete.heartbeatMaxDelayMs.toFixed(2)} ms / ${complete.longTaskMaxMs.toFixed(2)} ms`);
  console.log(`main-thread heap start/peak: ${formatMib(complete.heapStartBytes)} / ${formatMib(complete.heapPeakBytes)}`);
  console.log(`browser RSS start/peak: ${formatMib(complete.browserRssStartBytes)} / ${formatMib(complete.browserRssPeakBytes)}`);
  console.log(`cancellation: ${canceled.errorCode}, late progress events ${canceled.lateProgressEvents}`);
  if (output) console.log(`result: ${output}`);
}

function formatMib(value) {
  return value === null ? "unavailable" : `${(value / MIB).toFixed(2)} MiB`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
