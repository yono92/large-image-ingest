import { ChecksumCanceledError, ChecksumExecutionError } from "./errors.js";
import type {
  ChecksumExecutionOptions,
  ChecksumExecutor,
  ChecksumProgress,
  FileChecksum,
  IngestFileLike
} from "./types.js";

export interface BrowserWorkerChecksumExecutorOptions {
  workerFactory?: (url: URL, options: WorkerOptions) => Worker;
}

type WorkerResponse =
  | { type: "progress"; progress: ChecksumProgress }
  | { type: "complete"; checksum: FileChecksum }
  | { type: "failed" };

export function createBrowserWorkerChecksumExecutor(
  options: BrowserWorkerChecksumExecutorOptions = {}
): ChecksumExecutor {
  const workerFactory = options.workerFactory ?? ((url, workerOptions) => new Worker(url, workerOptions));

  return {
    calculate(file: IngestFileLike, execution: ChecksumExecutionOptions): Promise<FileChecksum> {
      if (execution.signal?.aborted) {
        return Promise.reject(new ChecksumCanceledError());
      }

      return new Promise<FileChecksum>((resolve, reject) => {
        let worker: Worker;
        try {
          worker = workerFactory(
            new URL("./checksum-worker-runtime.js", import.meta.url),
            { type: "module", name: "large-image-ingest-checksum" }
          );
        } catch {
          reject(new ChecksumExecutionError("Checksum Worker could not start."));
          return;
        }

        let settled = false;
        const finish = (action: () => void) => {
          if (settled) return;
          settled = true;
          execution.signal?.removeEventListener("abort", handleAbort);
          worker.terminate();
          action();
        };
        const handleAbort = () => finish(() => reject(new ChecksumCanceledError()));

        execution.signal?.addEventListener("abort", handleAbort, { once: true });
        worker.onerror = () => finish(() => reject(new ChecksumExecutionError()));
        worker.onmessageerror = () => finish(() => reject(new ChecksumExecutionError()));
        worker.onmessage = (event: MessageEvent<unknown>) => {
          if (!isWorkerResponse(event.data)) {
            finish(() => reject(new ChecksumExecutionError("Checksum Worker returned malformed output.")));
            return;
          }
          const message = event.data;
          if (message.type === "progress") {
            if (!settled) execution.onProgress?.(message.progress);
          } else if (message.type === "complete") {
            finish(() => resolve(message.checksum));
          } else {
            finish(() => reject(new ChecksumExecutionError()));
          }
        };

        try {
          worker.postMessage({
            type: "calculate",
            file,
            algorithm: execution.algorithm,
            chunkSize: execution.chunkSize
          });
        } catch {
          finish(() => reject(new ChecksumExecutionError("Checksum Worker request could not be sent.")));
        }
      });
    }
  };
}

function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  if (value.type === "failed") return true;
  if (value.type === "progress") return "progress" in value && Boolean(value.progress);
  return value.type === "complete" && "checksum" in value && Boolean(value.checksum);
}
