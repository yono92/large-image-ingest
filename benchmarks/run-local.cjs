#!/usr/bin/env node

const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { createWriteStream, openAsBlob } = require("node:fs");
const {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");
const { pathToFileURL } = require("node:url");
const { createReferenceServer } = require("./reference-server.cjs");

const MIB = 1024 * 1024;
const DEFAULT_SIZE_MIB = 64;
const DEFAULT_CHUNK_MIB = 8;
const MAX_NODE_FILE_BLOB_BYTES = 0xffff_ffff;
const RESULT_SCHEMA = "large-image-ingest.benchmark.v1";

async function main(argv = process.argv.slice(2)) {
  const configuration = parseArguments(argv);
  const packageRoot = path.resolve(__dirname, "..");
  const packageMetadata = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8")
  );
  const core = await import(pathToFileURL(path.join(packageRoot, "dist/esm/core.js")).href);
  const nodeHelpers = await import(pathToFileURL(path.join(packageRoot, "dist/esm/node.js")).href);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "large-image-ingest-benchmark-"));
  const sourcePath = path.join(temporaryRoot, "source.bin");
  const resumePath = path.join(temporaryRoot, "resume-records.json");
  const storageRoot = path.join(temporaryRoot, "storage");
  const memory = createMemorySampler();
  let server;
  let result;

  memory.start();
  const totalStartedAt = performance.now();

  try {
    const generationStartedAt = performance.now();
    const expectedChecksum = await generateFixture(sourcePath, configuration.sizeBytes);
    const generationMs = performance.now() - generationStartedAt;
    const sourceStat = await stat(sourcePath);
    assert(sourceStat.size === configuration.sizeBytes, "Generated fixture size is incorrect.");

    const file = await createFileLike(sourcePath, configuration.sizeBytes);
    const manifestStartedAt = performance.now();
    const manifest = await core.createManifest(file, {
      checksum: { chunkSize: configuration.checksumChunkSizeBytes },
      chunking: { chunkSize: configuration.chunkSizeBytes },
      validation: {
        acceptedExtensions: ["bin"],
        acceptedMimeTypes: ["application/octet-stream"],
        maxBytes: configuration.sizeBytes
      }
    });
    const manifestMs = performance.now() - manifestStartedAt;
    assert(
      manifest.original.checksum?.value === expectedChecksum,
      "Manifest checksum does not match independently generated fixture checksum."
    );

    server = await createReferenceServer({
      root: storageRoot,
      verifyStoredFile: (filePath, storedManifest) => nodeHelpers.verifyNodeFileManifest(
        filePath,
        storedManifest,
        { checksum: "required" }
      )
    });

    const store = new JsonFileResumeStore(resumePath);
    let recordId;
    let uploadId;
    let interruptionObserved = false;
    const firstTransport = createReferenceTransport(server.baseUrl, {
      failAfterChunks: configuration.failAfterChunks
    });
    const firstSession = core.createIngestSession(file, {
      manifest,
      chunking: { chunkSize: configuration.chunkSizeBytes },
      retries: 0,
      retryPolicy: { maxAttempts: 1 },
      resume: { store, cleanup: "mark-complete" },
      transport: firstTransport,
      onEvent(event) {
        if (event.type === "resume:available") {
          recordId = event.recordId;
        }
        if (event.type === "started") {
          uploadId = event.uploadId;
        }
      }
    });

    const interruptedStartedAt = performance.now();
    try {
      await firstSession.start();
    } catch (error) {
      interruptionObserved = error instanceof Error && error.message.includes("forced reference interruption");
      if (!interruptionObserved) {
        throw error;
      }
    }
    const interruptedUploadMs = performance.now() - interruptedStartedAt;
    assert(interruptionObserved, "Reference upload did not observe the forced interruption.");

    const records = await store.list();
    const failedRecord = recordId
      ? records.find((record) => record.id === recordId)
      : records.find((record) => record.progress.status === "failed");
    assert(failedRecord, "Durable resume record was not persisted after interruption.");
    recordId = failedRecord.id;
    uploadId = failedRecord.transport.uploadId;
    const acknowledgedBytesBeforeResume = failedRecord.progress.uploadedBytes;
    assert(
      acknowledgedBytesBeforeResume > 0,
      "Interruption occurred before durable acknowledged progress."
    );

    const resumedSession = core.createIngestSession(file, {
      chunking: { chunkSize: configuration.chunkSizeBytes },
      retries: 0,
      retryPolicy: { maxAttempts: 1 },
      resume: { store, cleanup: "mark-complete" },
      transport: createReferenceTransport(server.baseUrl)
    });
    const resumeStartedAt = performance.now();
    await resumedSession.resume(recordId);
    const resumedUploadMs = performance.now() - resumeStartedAt;

    const serverState = server.getUpload(uploadId);
    const finalVerification = await nodeHelpers.verifyNodeFileManifest(
      serverState.targetPath,
      manifest,
      { checksum: "required" }
    );
    const finalStat = await stat(serverState.targetPath);
    const finalRecords = await store.list();
    const completedRecord = finalRecords.find((record) => record.id === recordId);

    assert(serverState.completed, "Reference target did not complete the upload.");
    assert(serverState.integrityVerified, "Reference target did not verify stored integrity.");
    assert(finalVerification.ok, "Independent final stored-file verification failed.");
    assert(finalStat.size === configuration.sizeBytes, "Stored file size does not match the source.");
    assert(serverState.duplicateBytes === 0, "Resume retransmitted acknowledged bytes.");
    assert(serverState.completeCalls === 1, "Remote completion was not called exactly once.");
    assert(completedRecord?.progress.status === "completed", "Resume record was not marked completed.");

    const totalMs = performance.now() - totalStartedAt;
    const transferMs = interruptedUploadMs + resumedUploadMs;
    const peaks = memory.sample();
    result = {
      schemaVersion: RESULT_SCHEMA,
      createdAt: new Date().toISOString(),
      packageVersion: packageMetadata.version,
      sourceCommit: readSourceCommit(packageRoot),
      environment: readEnvironment(),
      configuration: {
        sizeBytes: configuration.sizeBytes,
        sizeMiB: configuration.sizeBytes / MIB,
        chunkSizeBytes: configuration.chunkSizeBytes,
        chunkSizeMiB: configuration.chunkSizeBytes / MIB,
        checksumChunkSizeBytes: configuration.checksumChunkSizeBytes,
        failAfterChunks: configuration.failAfterChunks
      },
      timingsMs: roundRecord({
        fixtureGeneration: generationMs,
        checksumAndManifest: manifestMs,
        interruptedUpload: interruptedUploadMs,
        resumedUpload: resumedUploadMs,
        transferTotal: transferMs,
        total: totalMs
      }),
      throughputMiBPerSecond: roundRecord({
        checksumAndManifest: toThroughput(configuration.sizeBytes, manifestMs),
        transfer: toThroughput(configuration.sizeBytes, transferMs),
        endToEnd: toThroughput(configuration.sizeBytes, totalMs)
      }),
      memoryPeakBytes: peaks,
      recovery: {
        interruptionObserved,
        durableRecordStatusAfterFailure: failedRecord.progress.status,
        acknowledgedBytesBeforeResume,
        acknowledgedChunksBeforeResume: failedRecord.receipts?.length ?? 0,
        totalReceivedBytes: serverState.receivedBytes,
        duplicateReceivedBytes: serverState.duplicateBytes,
        completeCalls: serverState.completeCalls,
        finalRecordStatus: completedRecord?.progress.status ?? "missing"
      },
      integrity: {
        generatedChecksumMatchedManifest: manifest.original.checksum?.value === expectedChecksum,
        targetVerifiedBeforePromotion: serverState.integrityVerified,
        targetVerifiedAfterPromotion: finalVerification.ok,
        sourceAndTargetSizeMatched: finalStat.size === sourceStat.size
      },
      reproduction: `npm run benchmark:local -- --size-mib ${configuration.sizeBytes / MIB} --chunk-mib ${configuration.chunkSizeBytes / MIB}`,
      limitations: [
        "Measurements use a local loopback HTTP target and local filesystem, not a remote provider.",
        "Process memory includes the benchmark client and reference server in one Node.js process.",
        "The local Node file-backed Blob harness rejects sizes of 4 GiB or larger because current runtime sizes and offsets are truncated.",
        "Throughput varies by CPU, filesystem, runtime, power policy, and other system load."
      ]
    };

    validateResult(result);
    if (configuration.outputPath) {
      await writeResult(configuration.outputPath, result);
    }
    printSummary(result, configuration.outputPath);
    return result;
  } finally {
    memory.stop();
    if (server) {
      await server.close().catch(() => {});
    }
    if (configuration.keepArtifacts) {
      process.stdout.write(`Artifacts retained at ${temporaryRoot}\n`);
    } else {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
}

class JsonFileResumeStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async get(recordId) {
    const records = await this.list();
    return records.find((record) => record.id === recordId);
  }

  async put(record) {
    const records = await this.list();
    const index = records.findIndex((candidate) => candidate.id === record.id);
    if (index >= 0) {
      records[index] = record;
    } else {
      records.push(record);
    }
    await this.write(records);
  }

  async list() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async delete(recordId) {
    const records = await this.list();
    await this.write(records.filter((record) => record.id !== recordId));
  }

  async write(records) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
    await rm(this.filePath, { force: true });
    await rename(temporaryPath, this.filePath);
  }
}

function createReferenceTransport(baseUrl, options = {}) {
  let acknowledgedChunks = 0;
  let interrupted = false;

  return {
    capabilities: {
      name: "local-http-reference",
      resumable: true,
      abortable: false,
      expires: false,
      supportsParallelChunks: false,
      supportsChunkChecksum: false,
      supportsSnapshotResume: true,
      supportsPersistentResume: true
    },
    async createSession({ manifest }) {
      const response = await fetch(`${baseUrl}/uploads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manifest, totalBytes: manifest.original.sizeBytes })
      });
      const body = await requireJsonResponse(response, "create upload");
      return {
        uploadId: body.uploadId,
        transportName: "local-http-reference",
        createdAt: new Date().toISOString()
      };
    },
    async resumeSession({ record }) {
      const response = await fetch(`${baseUrl}/uploads/${record.transport.uploadId}`);
      await requireJsonResponse(response, "resume upload");
      return {
        uploadId: record.transport.uploadId,
        transportName: "local-http-reference",
        createdAt: record.createdAt
      };
    },
    async uploadChunk({ body, chunk, session }) {
      if (
        options.failAfterChunks !== undefined &&
        acknowledgedChunks >= options.failAfterChunks &&
        !interrupted
      ) {
        interrupted = true;
        throw new Error("forced reference interruption");
      }

      const response = await fetch(
        `${baseUrl}/uploads/${session.uploadId}/chunks/${chunk.index}`,
        {
          method: "PUT",
          headers: {
            "x-chunk-start": String(chunk.start),
            "x-chunk-size": String(chunk.size)
          },
          body
        }
      );
      await requireJsonResponse(response, "upload chunk");
      acknowledgedChunks += 1;
      return {
        chunkIndex: chunk.index,
        sizeBytes: chunk.size,
        completedAt: new Date().toISOString(),
        transport: {
          name: "local-http-reference",
          etag: response.headers.get("etag") ?? undefined,
          offset: chunk.end
        }
      };
    },
    async completeSession({ session }) {
      const response = await fetch(`${baseUrl}/uploads/${session.uploadId}/complete`, {
        method: "POST"
      });
      await requireJsonResponse(response, "complete upload");
    }
  };
}

async function generateFixture(filePath, sizeBytes) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const blockSize = Math.min(4 * MIB, sizeBytes || 1);
  const block = Buffer.allocUnsafe(blockSize);
  for (let index = 0; index < block.length; index += 1) {
    block[index] = (index * 31 + 17) % 251;
  }
  const hash = createHash("sha256");

  async function* blocks() {
    let remaining = sizeBytes;
    while (remaining > 0) {
      const current = remaining >= block.length ? block : block.subarray(0, remaining);
      hash.update(current);
      yield current;
      remaining -= current.length;
    }
  }

  await pipeline(Readable.from(blocks()), createWriteStream(filePath, { flags: "wx" }));
  return hash.digest("hex");
}

async function createFileLike(filePath, sizeBytes) {
  if (typeof openAsBlob !== "function") {
    throw new Error("This Node.js runtime does not provide fs.openAsBlob().");
  }
  const blob = await openAsBlob(filePath, { type: "application/octet-stream" });
  Object.defineProperty(blob, "name", { value: "benchmark-source.bin" });
  Object.defineProperty(blob, "lastModified", { value: 1_700_000_000_000 });
  assert(blob.size === sizeBytes, "File-backed Blob size does not match the fixture.");
  return blob;
}

function createMemorySampler() {
  const peaks = {
    rss: 0,
    heapUsed: 0,
    external: 0,
    arrayBuffers: 0
  };
  let timer;

  function sample() {
    const current = process.memoryUsage();
    for (const key of Object.keys(peaks)) {
      peaks[key] = Math.max(peaks[key], current[key] ?? 0);
    }
    return { ...peaks };
  }

  return {
    start() {
      sample();
      timer = setInterval(sample, 20);
      timer.unref();
    },
    sample,
    stop() {
      if (timer) {
        clearInterval(timer);
      }
      sample();
    }
  };
}

function parseArguments(argv) {
  const values = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--keep-artifacts") {
      flags.add(argument);
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new RangeError(`Unexpected argument: ${argument}`);
    }
    const [name, inlineValue] = argument.split("=", 2);
    const value = inlineValue ?? argv[++index];
    if (value === undefined || value.startsWith("--")) {
      throw new RangeError(`${name} requires a value.`);
    }
    values.set(name, value);
  }

  const sizeMiB = readPositiveNumber(values.get("--size-mib") ?? DEFAULT_SIZE_MIB, "--size-mib");
  const chunkMiB = readPositiveNumber(values.get("--chunk-mib") ?? DEFAULT_CHUNK_MIB, "--chunk-mib");
  const failAfterChunks = readPositiveInteger(
    values.get("--fail-after-chunks") ?? 2,
    "--fail-after-chunks"
  );
  const sizeBytes = toSafeBytes(sizeMiB, "--size-mib");
  const chunkSizeBytes = toSafeBytes(chunkMiB, "--chunk-mib");
  if (sizeBytes > MAX_NODE_FILE_BLOB_BYTES) {
    throw new RangeError(
      "The local Node file-backed Blob harness is limited to less than 4 GiB; use a real browser or provider integration for larger files."
    );
  }
  if (sizeBytes <= chunkSizeBytes * failAfterChunks) {
    throw new RangeError("Fixture size must leave at least one chunk after the forced interruption.");
  }

  return {
    sizeBytes,
    chunkSizeBytes,
    checksumChunkSizeBytes: Math.min(4 * MIB, chunkSizeBytes),
    failAfterChunks,
    keepArtifacts: flags.has("--keep-artifacts"),
    outputPath: resolveOutputPath(values.get("--output"))
  };
}

function resolveOutputPath(value) {
  if (!value) {
    return undefined;
  }
  const resultsRoot = path.resolve(__dirname, "results");
  const outputPath = path.resolve(process.cwd(), value);
  const relative = path.relative(resultsRoot, outputPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new RangeError("Benchmark output must stay under benchmarks/results/.");
  }
  return outputPath;
}

function readEnvironment() {
  const cpus = os.cpus();
  return {
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    nodeVersion: process.version,
    cpuModel: cpus[0]?.model ?? "unknown",
    logicalCpuCount: cpus.length,
    totalMemoryBytes: os.totalmem()
  };
}

function readSourceCommit(packageRoot) {
  const declaredCommit = process.env.LII_BENCHMARK_SOURCE_COMMIT ?? process.env.GITHUB_SHA;
  if (declaredCommit) {
    return declaredCommit.slice(0, 64);
  }

  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: packageRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "unknown";
  }
}

function validateResult(result) {
  assert(result.schemaVersion === RESULT_SCHEMA, "Benchmark result schema is invalid.");
  assert(result.integrity.targetVerifiedAfterPromotion, "Final integrity evidence is missing.");
  assert(result.recovery.interruptionObserved, "Interruption evidence is missing.");
  assert(result.recovery.duplicateReceivedBytes === 0, "Duplicate-byte evidence is invalid.");
  for (const key of ["rss", "heapUsed", "external", "arrayBuffers"]) {
    assert(Number.isFinite(result.memoryPeakBytes[key]), `Memory metric ${key} is invalid.`);
  }
}

async function writeResult(outputPath, result) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

function printSummary(result, outputPath) {
  const sizeMiB = result.configuration.sizeMiB;
  const heapMiB = result.memoryPeakBytes.heapUsed / MIB;
  const rssMiB = result.memoryPeakBytes.rss / MIB;
  process.stdout.write(
    [
      `PASS reference benchmark: ${sizeMiB} MiB`,
      `checksum+manifest: ${result.timingsMs.checksumAndManifest} ms (${result.throughputMiBPerSecond.checksumAndManifest} MiB/s)`,
      `HTTP transfer+resume: ${result.timingsMs.transferTotal} ms (${result.throughputMiBPerSecond.transfer} MiB/s)`,
      `peak heap/RSS: ${heapMiB.toFixed(2)} MiB / ${rssMiB.toFixed(2)} MiB`,
      `duplicate acknowledged bytes: ${result.recovery.duplicateReceivedBytes}`,
      `stored integrity: verified${outputPath ? `\nresult: ${path.relative(process.cwd(), outputPath)}` : ""}`
    ].join("\n") + "\n"
  );
}

async function requireJsonResponse(response, operation) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${operation} failed with status ${response.status}.`);
  }
  return body;
}

function toThroughput(sizeBytes, durationMs) {
  return durationMs <= 0 ? 0 : (sizeBytes / MIB) / (durationMs / 1000);
}

function roundRecord(record) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, Number(value.toFixed(2))])
  );
}

function readPositiveNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new RangeError(`${name} must be a positive number.`);
  }
  return parsed;
}

function readPositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
  return parsed;
}

function toSafeBytes(mib, name) {
  const bytes = mib * MIB;
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    throw new RangeError(`${name} does not produce a safe positive byte count.`);
  }
  return bytes;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`FAIL reference benchmark: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  JsonFileResumeStore,
  createReferenceTransport,
  generateFixture,
  main,
  parseArguments,
  validateResult
};
