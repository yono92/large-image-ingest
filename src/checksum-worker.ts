import { ChecksumExecutionError } from "./checksum.js";
import type {
  ChecksumExecutionOptions,
  ChecksumExecutor,
  ChecksumProgress,
  ChecksumWorkerEvent,
  ChecksumWorkerLike,
  ChecksumWorkerRequest,
  FileChecksum,
  IngestFileLike
} from "./types.js";

export const CHECKSUM_WORKER_PROTOCOL = "large-image-ingest.checksum-worker.v1" as const;

export interface CreateWorkerChecksumExecutorOptions {
  workerFactory(): ChecksumWorkerLike;
}

export function createWorkerChecksumExecutor(
  options: CreateWorkerChecksumExecutorOptions
): ChecksumExecutor {
  return {
    calculate(file, checksumOptions) {
      return calculateWithWorker(options.workerFactory, file, checksumOptions);
    }
  };
}

function calculateWithWorker(
  workerFactory: () => ChecksumWorkerLike,
  file: IngestFileLike,
  options: ChecksumExecutionOptions
): Promise<FileChecksum> {
  if (options.signal?.aborted) {
    return Promise.reject(abortedError());
  }

  let worker: ChecksumWorkerLike;
  try {
    worker = workerFactory();
  } catch {
    return Promise.reject(workerError());
  }

  const requestId = createRequestId();
  return new Promise<FileChecksum>((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onWorkerError);
      worker.removeEventListener("messageerror", onWorkerError);
      options.signal?.removeEventListener("abort", onAbort);
      worker.terminate();
    };
    const settle = (operation: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      operation();
    };
    const onAbort = (): void => settle(() => reject(abortedError()));
    const onWorkerError = (): void => settle(() => reject(workerError()));
    const onMessage = (event: ChecksumWorkerEvent): void => {
      if (settled || !isRecord(event.data)) return;
      const response = event.data;
      if (typeof response.requestId === "string" && response.requestId !== requestId) return;
      if (
        response.protocol !== CHECKSUM_WORKER_PROTOCOL ||
        response.requestId !== requestId ||
        typeof response.type !== "string"
      ) {
        settle(() => reject(workerError()));
        return;
      }

      if (response.type === "progress") {
        if (!isChecksumProgress(response.progress)) {
          settle(() => reject(workerError()));
          return;
        }
        const progress = response.progress as ChecksumProgress;
        options.onProgress?.({ ...progress });
        return;
      }

      if (response.type === "result") {
        if (!isFileChecksum(response.checksum)) {
          settle(() => reject(workerError()));
          return;
        }
        const checksum = response.checksum as FileChecksum;
        settle(() => resolve({ ...checksum }));
        return;
      }

      if (response.type === "error") {
        settle(() => reject(workerError()));
        return;
      }

      settle(() => reject(workerError()));
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onWorkerError);
    worker.addEventListener("messageerror", onWorkerError);
    options.signal?.addEventListener("abort", onAbort, { once: true });

    const request: ChecksumWorkerRequest = {
      protocol: CHECKSUM_WORKER_PROTOCOL,
      type: "calculate",
      requestId,
      file,
      algorithm: options.algorithm ?? "sha256"
    };
    if (options.chunkSize !== undefined) request.chunkSize = options.chunkSize;

    try {
      worker.postMessage(request);
    } catch {
      settle(() => reject(workerError()));
    }
  });
}

function isChecksumProgress(value: unknown): value is ChecksumProgress {
  return Boolean(
    isRecord(value) &&
    isNonNegativeSafeInteger(value.loadedBytes) &&
    isNonNegativeSafeInteger(value.totalBytes) &&
    isNonNegativeSafeInteger(value.chunkIndex) &&
    isNonNegativeSafeInteger(value.totalChunks) &&
    value.loadedBytes <= value.totalBytes &&
    (value.totalChunks === 0 || value.chunkIndex < value.totalChunks)
  );
}

function isFileChecksum(value: unknown): value is FileChecksum {
  return Boolean(
    isRecord(value) &&
    value.algorithm === "sha256" &&
    value.scope === "whole-file" &&
    typeof value.calculatedAt === "string" &&
    Number.isFinite(Date.parse(value.calculatedAt)) &&
    isPositiveSafeInteger(value.chunkSizeBytes) &&
    typeof value.value === "string" &&
    /^[a-f0-9]{64}$/i.test(value.value)
  );
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `checksum_${Date.now()}_${Math.random()}`;
}

function abortedError(): ChecksumExecutionError {
  return new ChecksumExecutionError("checksum.aborted", "Checksum calculation was aborted.");
}

function workerError(): ChecksumExecutionError {
  return new ChecksumExecutionError("checksum.worker_failed", "Checksum worker execution failed.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value > 0;
}
