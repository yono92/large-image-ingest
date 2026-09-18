import { describe, expect, it } from "vitest";
import { createIngestSession } from "../src/session";
import type { TransportCapabilities, TransportSession, UploadChunkReceipt, UploadTransport } from "../src/types";

const chunkSize = 256 * 1024;

function capabilities(overrides: Partial<TransportCapabilities> = {}): TransportCapabilities {
  return {
    name: "parallel-fake",
    resumable: true,
    abortable: true,
    expires: false,
    supportsParallelChunks: true,
    supportsChunkChecksum: true,
    maxParallelChunks: 4,
    supportsSparseResume: true,
    supportsSafeChunkRepeat: true,
    chunkChecksumAlgorithms: ["sha256"],
    attestsChunkChecksum: false,
    ...overrides
  };
}

describe("parallel ingest session", () => {
  it("bounds concurrency, commits unique progress, and completes with canonical receipts", async () => {
    const file = new File([new Uint8Array(chunkSize * 6)], "parallel.tif", { type: "image/tiff" });
    let inFlight = 0;
    let maximumInFlight = 0;
    const completionOrder: number[] = [];
    let finalReceipts: readonly UploadChunkReceipt[] = [];
    const progress: number[] = [];
    const transport: UploadTransport = {
      capabilities: capabilities(),
      async createSession(): Promise<TransportSession> {
        return { uploadId: "parallel-1", transportName: "parallel-fake", createdAt: new Date().toISOString() };
      },
      async uploadChunk({ chunk, integrity }) {
        expect(integrity?.local.algorithm).toBe("sha256");
        expect(integrity?.local.encoding).toBe("base64");
        inFlight += 1;
        maximumInFlight = Math.max(maximumInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, (6 - chunk.index) * 2));
        inFlight -= 1;
        completionOrder.push(chunk.index);
        return {
          chunkIndex: chunk.index,
          sizeBytes: chunk.size,
          completedAt: new Date().toISOString(),
          transport: { name: "parallel-fake", partNumber: chunk.index + 1 }
        };
      },
      async completeSession({ receipts }) {
        finalReceipts = receipts;
      }
    };

    await createIngestSession(file, {
      checksum: false,
      chunking: { chunkSize },
      parallel: { concurrency: 16 },
      onEvent(event) {
        if (event.type === "chunk:completed") progress.push(event.uploadedBytes);
      },
      transport
    }).start();

    expect(maximumInFlight).toBe(4);
    expect(completionOrder).not.toEqual([0, 1, 2, 3, 4, 5]);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(finalReceipts.map((receipt) => receipt.chunkIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(finalReceipts.every((receipt) => receipt.integrity?.local.algorithm === "sha256")).toBe(true);
  });

  it("rejects unsupported parallel mode before session creation", async () => {
    let creates = 0;
    const transport: UploadTransport = {
      capabilities: capabilities({ supportsParallelChunks: false }),
      async createSession() {
        creates += 1;
        throw new Error("should not create");
      },
      async uploadChunk() {},
      async completeSession() {}
    };
    await expect(createIngestSession(new File([new Uint8Array(chunkSize)], "x.tif"), {
      checksum: false,
      parallel: { concurrency: 2 },
      chunking: { chunkSize },
      transport
    }).start()).rejects.toMatchObject({ code: "session.invalid_state" });
    expect(creates).toBe(0);
  });

  it("rejects a mismatched required remote checksum", async () => {
    const transport: UploadTransport = {
      capabilities: capabilities({ attestsChunkChecksum: true }),
      async createSession() {
        return { uploadId: "parallel-bad", transportName: "parallel-fake", createdAt: new Date().toISOString() };
      },
      async uploadChunk({ chunk }) {
        return {
          chunkIndex: chunk.index,
          sizeBytes: chunk.size,
          completedAt: new Date().toISOString(),
          checksum: { algorithm: "sha256" as const, value: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
          transport: { name: "parallel-fake" }
        };
      },
      async completeSession() {}
    };
    await expect(createIngestSession(new File([new Uint8Array(chunkSize)], "x.tif"), {
      checksum: false,
      parallel: { concurrency: 2 },
      chunking: { chunkSize },
      transport
    }).start()).rejects.toMatchObject({ code: "checksum.chunk_mismatch" });
  });

  it("retries only the failed chunk with a new attempt identity", async () => {
    const attempts = new Map<number, string[]>();
    const transport: UploadTransport = {
      capabilities: capabilities(),
      async createSession() {
        return { uploadId: "parallel-retry", transportName: "parallel-fake", createdAt: new Date().toISOString() };
      },
      async uploadChunk({ chunk, attemptId }) {
        const ids = attempts.get(chunk.index) ?? [];
        ids.push(attemptId ?? "missing");
        attempts.set(chunk.index, ids);
        if (chunk.index === 0 && ids.length === 1) throw new Error("transient");
      },
      async completeSession() {}
    };
    await createIngestSession(new File([new Uint8Array(chunkSize * 3)], "retry.tif"), {
      checksum: false,
      chunking: { chunkSize },
      parallel: { concurrency: 3 },
      retryPolicy: { maxAttempts: 2, delayMs: 0 },
      transport
    }).start();
    expect(attempts.get(0)).toHaveLength(2);
    expect(new Set(attempts.get(0)).size).toBe(2);
    expect(attempts.get(1)).toHaveLength(1);
    expect(attempts.get(2)).toHaveLength(1);
  });
});
