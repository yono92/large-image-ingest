import type { ChunkDescriptor, ChunkPlan, ChunkPlanOptions } from "./types";

const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;
const MIN_CHUNK_SIZE = 256 * 1024;

export function planChunks(totalBytes: number, options: ChunkPlanOptions = {}): ChunkPlan {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;

  if (!Number.isSafeInteger(totalBytes) || totalBytes < 0) {
    throw new RangeError("totalBytes must be a non-negative safe integer.");
  }

  if (!Number.isSafeInteger(chunkSize) || chunkSize < MIN_CHUNK_SIZE) {
    throw new RangeError(`chunkSize must be at least ${MIN_CHUNK_SIZE} bytes.`);
  }

  const chunks: ChunkDescriptor[] = [];

  for (let start = 0, index = 0; start < totalBytes; start += chunkSize, index += 1) {
    const end = Math.min(start + chunkSize, totalBytes);
    chunks.push({
      index,
      start,
      end,
      size: end - start
    });
  }

  return {
    chunkSize,
    totalBytes,
    totalChunks: chunks.length,
    chunks
  };
}
