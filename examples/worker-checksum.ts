import {
  calculateChecksum,
  createWorkerChecksumExecutor
} from "large-image-ingest/core";

export async function calculateChecksumOffMainThread(
  file: File,
  signal?: AbortSignal
) {
  const executor = createWorkerChecksumExecutor({
    workerFactory() {
      // The application bundler owns this URL and CSP-compatible module-worker setup.
      return new Worker(new URL("./worker-checksum-runtime.js", import.meta.url), {
        type: "module"
      });
    }
  });

  return calculateChecksum(file, {
    executor,
    ...(signal ? { signal } : {}),
    chunkSize: 4 * 1024 * 1024,
    onProgress(progress) {
      console.log(progress.loadedBytes, progress.totalBytes);
    }
  });
}
