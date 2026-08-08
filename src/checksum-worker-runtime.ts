import { calculateChecksum } from "./checksum.js";
import { CHECKSUM_WORKER_PROTOCOL } from "./checksum-worker.js";
import type {
  ChecksumExecutionOptions,
  ChecksumWorkerEvent,
  ChecksumWorkerRequest,
  ChecksumWorkerResponse,
  ChecksumWorkerRuntimeScope,
  IngestFileLike
} from "./types.js";

export function installChecksumWorkerRuntime(
  scope: ChecksumWorkerRuntimeScope
): () => void {
  const onMessage = (event: ChecksumWorkerEvent): void => {
    if (!isChecksumWorkerRequest(event.data)) return;
    void handleRequest(scope, event.data);
  };
  scope.addEventListener("message", onMessage);
  return () => scope.removeEventListener("message", onMessage);
}

async function handleRequest(
  scope: ChecksumWorkerRuntimeScope,
  request: ChecksumWorkerRequest
): Promise<void> {
  try {
    const options: ChecksumExecutionOptions = {
      algorithm: request.algorithm,
      onProgress(progress) {
        const response: ChecksumWorkerResponse = {
          protocol: CHECKSUM_WORKER_PROTOCOL,
          type: "progress",
          requestId: request.requestId,
          progress
        };
        scope.postMessage(response);
      }
    };
    if (request.chunkSize !== undefined) options.chunkSize = request.chunkSize;
    const checksum = await calculateChecksum(request.file, options);
    const response: ChecksumWorkerResponse = {
      protocol: CHECKSUM_WORKER_PROTOCOL,
      type: "result",
      requestId: request.requestId,
      checksum
    };
    scope.postMessage(response);
  } catch {
    const response: ChecksumWorkerResponse = {
      protocol: CHECKSUM_WORKER_PROTOCOL,
      type: "error",
      requestId: request.requestId,
      code: "checksum.worker_failed",
      message: "Checksum worker execution failed."
    };
    scope.postMessage(response);
  }
}

function isChecksumWorkerRequest(value: unknown): value is ChecksumWorkerRequest {
  return Boolean(
    isRecord(value) &&
    value.protocol === CHECKSUM_WORKER_PROTOCOL &&
    value.type === "calculate" &&
    typeof value.requestId === "string" &&
    value.requestId.length > 0 &&
    isFileLike(value.file) &&
    value.algorithm === "sha256" &&
    (value.chunkSize === undefined || isPositiveSafeInteger(value.chunkSize))
  );
}

function isFileLike(value: unknown): value is IngestFileLike {
  return value instanceof Blob && typeof (value as { name?: unknown }).name === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
