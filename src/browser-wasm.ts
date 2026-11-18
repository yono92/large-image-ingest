import { createSHA256 } from "hash-wasm";
import { ChecksumCanceledError } from "./errors.js";
import type {
  ChecksumExecutionOptions,
  ChecksumExecutor,
  FileChecksum,
  IngestFileLike
} from "./types.js";

/**
 * Whole-file SHA-256 using the optional `hash-wasm` peer. Reads one
 * `Blob.slice` per chunk and yields between chunks, so only one chunk is held
 * in memory and the page stays responsive. Produces the same `FileChecksum`
 * evidence as the built-in executor.
 *
 * @experimental
 */
export function createBrowserWasmChecksumExecutor(): ChecksumExecutor {
  return {
    async calculate(file: IngestFileLike, execution: ChecksumExecutionOptions): Promise<FileChecksum> {
      const { chunkSize, signal } = execution;
      const totalChunks = file.size === 0 ? 0 : Math.ceil(file.size / chunkSize);
      const hasher = await createSHA256();
      hasher.init();
      let loadedBytes = 0;

      if (file.size === 0) {
        execution.onProgress?.({ loadedBytes: 0, totalBytes: 0, chunkIndex: 0, totalChunks: 0 });
      }

      for (let start = 0, chunkIndex = 0; start < file.size; start += chunkSize, chunkIndex += 1) {
        if (signal?.aborted) throw new ChecksumCanceledError();
        const end = Math.min(start + chunkSize, file.size);
        const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());
        hasher.update(bytes);
        loadedBytes += bytes.byteLength;
        execution.onProgress?.({ loadedBytes, totalBytes: file.size, chunkIndex, totalChunks });
      }

      if (signal?.aborted) throw new ChecksumCanceledError();
      return {
        algorithm: execution.algorithm,
        calculatedAt: new Date().toISOString(),
        chunkSizeBytes: chunkSize,
        scope: "whole-file",
        value: hasher.digest("hex")
      };
    }
  };
}
