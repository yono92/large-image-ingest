import { describe, expect, it } from "vitest";
import { createIngestSession } from "../src/session";
import type { UploadChunkReceipt, UploadTransport } from "../src/types";

const chunkSize = 256 * 1024;

describe("parallel opt-in compatibility", () => {
  it("keeps the default path sequential and preserves canonical receipt order", async () => {
    let inFlight = 0;
    let maximumInFlight = 0;
    const completed: UploadChunkReceipt[][] = [];
    const transport: UploadTransport = {
      capabilities: {
        name: "parallel-capable-fake",
        resumable: true,
        abortable: true,
        expires: false,
        supportsParallelChunks: true,
        supportsChunkChecksum: true,
        maxParallelChunks: 8,
        supportsSparseResume: true,
        supportsSafeChunkRepeat: true,
        chunkChecksumAlgorithms: ["sha256"]
      },
      async createSession() { return { uploadId: "sequential-default" }; },
      async uploadChunk({ chunk, integrity, attemptId }) {
        expect(integrity).toBeUndefined();
        expect(attemptId).toBeUndefined();
        inFlight += 1;
        maximumInFlight = Math.max(maximumInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return {
          chunkIndex: chunk.index,
          sizeBytes: chunk.size,
          completedAt: new Date().toISOString(),
          transport: { name: "parallel-capable-fake" }
        };
      },
      async completeSession({ receipts }) { completed.push([...receipts]); }
    };
    await createIngestSession(new File([new Uint8Array(chunkSize * 3)], "sequential.tif"), {
      checksum: false,
      chunking: { chunkSize },
      transport
    }).start();
    expect(maximumInFlight).toBe(1);
    expect(completed[0]?.map((receipt) => receipt.chunkIndex)).toEqual([0, 1, 2]);
  });
});
