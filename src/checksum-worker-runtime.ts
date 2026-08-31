import { calculateChecksum } from "./checksum.js";
import type { IngestFileLike } from "./types.js";

interface CalculateRequest {
  type: "calculate";
  file: IngestFileLike;
  algorithm: "sha256";
  chunkSize: number;
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
}

const workerScope = globalThis as unknown as WorkerScope;

workerScope.onmessage = (event) => {
  if (!isCalculateRequest(event.data)) {
    workerScope.postMessage({ type: "failed" });
    return;
  }
  const request = event.data;
  void calculateChecksum(request.file, {
    algorithm: request.algorithm,
    chunkSize: request.chunkSize,
    onProgress(progress) {
      workerScope.postMessage({ type: "progress", progress });
    }
  }).then((checksum) => {
    workerScope.postMessage({ type: "complete", checksum });
  }).catch(() => {
    workerScope.postMessage({ type: "failed" });
  });
};

function isCalculateRequest(value: unknown): value is CalculateRequest {
  return Boolean(
    value &&
    typeof value === "object" &&
    "type" in value &&
    value.type === "calculate" &&
    "file" in value &&
    value.file instanceof Blob &&
    "algorithm" in value &&
    value.algorithm === "sha256" &&
    "chunkSize" in value &&
    typeof value.chunkSize === "number"
  );
}
