import assert = require("node:assert/strict");
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
  const browser = await import("large-image-ingest/browser");
  assert.equal(typeof browser.createBrowserWorkerChecksumExecutor, "function");

  const runtimePath = join(__dirname, "..", "dist", "esm", "checksum-worker-runtime.js");
  await access(runtimePath);
  const runtime = await readFile(runtimePath, "utf8");
  assert.match(runtime, /calculateChecksum/);

  let terminated = false;
  const worker = {
    onerror: null,
    onmessage: null as ((event: { data: unknown }) => void) | null,
    onmessageerror: null,
    postMessage() {
      queueMicrotask(() => this.onmessage?.({
        data: {
          type: "complete",
          checksum: {
            algorithm: "sha256",
            calculatedAt: new Date().toISOString(),
            chunkSizeBytes: 64 * 1024,
            scope: "whole-file",
            value: "a".repeat(64)
          }
        }
      }));
    },
    terminate() {
      terminated = true;
    }
  };
  const executor = browser.createBrowserWorkerChecksumExecutor({
    // This fake exercises only the Worker messages used by the executor.
    workerFactory: () => worker as unknown as Worker
  });
  const source = Object.assign(new Blob(["packed-browser-check"]), { name: "packed-browser-check.bin" });
  Object.defineProperty(source, "name", { value: "packed-browser-check.bin" });
  const result = await executor.calculate(source, {
    algorithm: "sha256",
    chunkSize: 64 * 1024
  });
  assert.equal(result.value, "a".repeat(64));
  assert.equal(terminated, true);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
