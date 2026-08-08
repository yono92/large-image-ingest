# Public Contract: Extreme-File Execution

```ts
export interface ChecksumExecutionOptions {
  algorithm?: FileChecksumAlgorithm;
  chunkSize?: number;
  signal?: AbortSignal;
  onProgress?: (progress: ChecksumProgress) => void;
}

export interface ChecksumExecutor {
  calculate(file: IngestFileLike, options: ChecksumExecutionOptions): Promise<FileChecksum>;
}

export interface ChecksumOptions extends ChecksumExecutionOptions {
  executor?: ChecksumExecutor;
  expected?: string;
  required?: boolean;
}

export interface ChecksumWorkerLike {
  postMessage(value: unknown): void;
  addEventListener(
    type: "message" | "error" | "messageerror",
    listener: ChecksumWorkerEventListener
  ): void;
  removeEventListener(
    type: "message" | "error" | "messageerror",
    listener: ChecksumWorkerEventListener
  ): void;
  terminate(): void;
}

export function createWorkerChecksumExecutor(options: {
  workerFactory(): ChecksumWorkerLike;
}): ChecksumExecutor;

export function installChecksumWorkerRuntime(scope: ChecksumWorkerRuntimeScope): () => void;

export interface UploadExecutionOptions {
  maxParallelChunks?: number;
}

export interface CreateIngestSessionOptions {
  execution?: UploadExecutionOptions;
}
```

New typed issue codes:

```ts
"checksum.aborted"
"checksum.worker_failed"
"execution.invalid_concurrency"
"execution.parallel_unsupported"
```
