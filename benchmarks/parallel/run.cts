import { performance } from "node:perf_hooks";
import type { UploadTransport, UploadChunkReceipt } from "../../src/types.js";

const chunkSize = 256 * 1024;
const chunkCount = 32;
const latencyMs = 20;

async function main() {
  const { createIngestSession } = await import("large-image-ingest/core");
  const sequential = await run(createIngestSession, undefined);
  const parallel = await run(createIngestSession, { concurrency: 4 });
  const speedup = sequential.elapsedMs / parallel.elapsedMs;
  const result = {
    schemaVersion: "large-image-ingest.parallel-benchmark.v1",
    chunkCount,
    chunkSizeBytes: chunkSize,
    latencyMs,
    sequential,
    parallel,
    speedup: Number(speedup.toFixed(2))
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (parallel.maximumInFlight > 4 || parallel.receiptCount !== chunkCount || speedup < 2) {
    process.exitCode = 1;
  }
}

async function run(createIngestSession: typeof import("../../src/core.js").createIngestSession, parallel: { concurrency: number; }|undefined) {
  const file = new FixtureFile([new Uint8Array(chunkSize * chunkCount)], "parallel-benchmark.tif", {
    type: "image/tiff",
    lastModified: Date.UTC(2026, 8, 18)
  });
  let inFlight = 0;
  let maximumInFlight = 0;
  let receipts: UploadChunkReceipt[] = [];
  const transport: UploadTransport = {
    capabilities: {
      name: "parallel-benchmark",
      resumable: true,
      abortable: true,
      expires: false,
      supportsParallelChunks: true,
      supportsChunkChecksum: true,
      maxParallelChunks: 4,
      supportsSparseResume: true,
      supportsSafeChunkRepeat: true,
      chunkChecksumAlgorithms: ["sha256"],
      chunkChecksumEncodings: ["base64"],
      attestsChunkChecksum: false
    },
    async createSession() { return { uploadId: "benchmark-upload", transportName: "parallel-benchmark", createdAt: "2026-09-18T00:00:00.000Z" }; },
    async uploadChunk({ chunk }) {
      inFlight += 1;
      maximumInFlight = Math.max(maximumInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
      inFlight -= 1;
      return {
        chunkIndex: chunk.index,
        sizeBytes: chunk.size,
        completedAt: "2026-09-18T00:00:00.000Z",
        transport: { name: "parallel-benchmark" }
      };
    },
    async completeSession({ receipts: completed }) { receipts = [...completed]; }
  };
  const started = performance.now();
  await createIngestSession(file, {
    checksum: false,
    chunking: { chunkSize },
    ...(parallel ? { parallel } : {}),
    transport
  }).start();
  return {
    elapsedMs: Number((performance.now() - started).toFixed(2)),
    maximumInFlight,
    receiptCount: receipts.length,
    canonicalOrder: receipts.every((receipt, index) => receipt.chunkIndex === index)
  };
}

class FixtureFile extends Blob {
  name: string;
  lastModified: number;
  constructor(parts: BlobPart[]|undefined, name: string, options: BlobPropertyBag & { lastModified: number }) {
    super(parts, options);
    this.name = name;
    this.lastModified = options.lastModified;
  }
}

void main();
