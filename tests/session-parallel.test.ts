import { describe, expect, it } from "vitest";
import { createIngestSession } from "../src/session";
import type {
  IngestFileLike,
  TransportCapabilities,
  UploadChunkContext,
  UploadChunkReceipt,
  UploadCompletionContext,
  UploadSessionContext,
  UploadSessionResult,
  UploadTransport
} from "../src/types";
import { MemoryResumeStore } from "./resume-fixtures";

const chunkSize = 256 * 1024;

describe("bounded parallel upload execution", () => {
  it("defaults to sequential and honors an explicit bounded concurrency", async () => {
    const sequential = new ConcurrencyTransport({ delays: [20, 1, 10, 1] });
    await createIngestSession(createFile(), { chunking: { chunkSize }, transport: sequential }).start();
    expect(sequential.maxActive).toBe(1);

    const parallel = new ConcurrencyTransport({ delays: [20, 1, 10, 1] });
    const session = createIngestSession(createFile(), {
      chunking: { chunkSize },
      execution: { maxParallelChunks: 2 },
      transport: parallel
    });
    await session.start();

    expect(parallel.maxActive).toBe(2);
    expect(parallel.completionOrder).not.toEqual([0, 1, 2, 3]);
    expect(parallel.completedReceiptIndexes).toEqual([0, 1, 2, 3]);
    expect(session.getSnapshot()?.completedChunks.map((receipt) => receipt.chunkIndex))
      .toEqual([0, 1, 2, 3]);
  });

  it("rejects invalid and unsupported concurrency before remote creation", async () => {
    for (const maxParallelChunks of [0, 33, 1.5]) {
      const transport = new ConcurrencyTransport();
      await expect(createIngestSession(createFile(), {
        chunking: { chunkSize },
        execution: { maxParallelChunks },
        transport
      }).start()).rejects.toMatchObject({ code: "execution.invalid_concurrency" });
      expect(transport.createCalls).toBe(0);
    }

    const unsupported = new ConcurrencyTransport({ supportsParallel: false });
    await expect(createIngestSession(createFile(), {
      chunking: { chunkSize },
      execution: { maxParallelChunks: 2 },
      transport: unsupported
    }).start()).rejects.toMatchObject({ code: "execution.parallel_unsupported" });
    expect(unsupported.createCalls).toBe(0);
  });

  it("produces deterministic ordered completion evidence across completion schedules", async () => {
    const first = new ConcurrencyTransport({ delays: [30, 1, 20, 5] });
    const second = new ConcurrencyTransport({ delays: [1, 30, 5, 20] });
    const firstSession = createIngestSession(createFile(), {
      chunking: { chunkSize },
      execution: { maxParallelChunks: 4 },
      transport: first
    });
    const secondSession = createIngestSession(createFile(), {
      chunking: { chunkSize },
      execution: { maxParallelChunks: 4 },
      transport: second
    });

    await firstSession.start();
    await secondSession.start();

    expect(first.completionOrder).not.toEqual(second.completionOrder);
    expect(first.completedReceiptIndexes).toEqual([0, 1, 2, 3]);
    expect(second.completedReceiptIndexes).toEqual([0, 1, 2, 3]);
    expect(firstSession.getCompletionEvidence()?.upload.receiptDigest)
      .toEqual(secondSession.getCompletionEvidence()?.upload.receiptDigest);
  });

  it("checkpoints successful siblings before failure and skips them on exact-source resume", async () => {
    const file = createFile();
    const before = new Uint8Array(await file.arrayBuffer());
    const store = new MemoryResumeStore();
    const interruptedTransport = new ConcurrencyTransport({ failChunkIndexes: [1] });
    await expect(createIngestSession(file, {
      chunking: { chunkSize },
      execution: { maxParallelChunks: 3 },
      retries: 0,
      resume: { store },
      transport: interruptedTransport
    }).start()).rejects.toThrow("Chunk 1 failed.");

    const [record] = await store.list();
    if (!record || record.schemaVersion === "large-image-ingest.resume.v0.1") {
      throw new Error("Expected a receipt-bearing resume record.");
    }
    expect(record.receipts.map((receipt) => receipt.chunkIndex)).toEqual([0, 2]);
    expect(record.progress.completedChunkRanges).toEqual([
      { startIndex: 0, endIndexInclusive: 0 },
      { startIndex: 2, endIndexInclusive: 2 }
    ]);

    const resumedTransport = new ConcurrencyTransport();
    await createIngestSession(file, {
      chunking: { chunkSize },
      execution: { maxParallelChunks: 3 },
      resume: { store },
      transport: resumedTransport
    }).resume(record.id);

    expect(resumedTransport.startedIndexes).toEqual([1, 3]);
    expect(resumedTransport.completedReceiptIndexes).toEqual([0, 1, 2, 3]);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(before);
  });

  it("starts no new batch after pause or cancel while retaining settled acknowledgements", async () => {
    for (const action of ["pause", "cancel"] as const) {
      const file = createFile();
      const store = new MemoryResumeStore();
      let session: ReturnType<typeof createIngestSession>;
      const transport = new ConcurrencyTransport({
        onFirstChunk() {
          queueMicrotask(() => {
            if (action === "pause") session.pause();
            else void session.cancel();
          });
        }
      });
      session = createIngestSession(file, {
        chunking: { chunkSize },
        execution: { maxParallelChunks: 2 },
        resume: { store },
        transport
      });

      await expect(session.start()).rejects.toMatchObject({
        code: action === "pause" ? "transport.paused" : "transport.canceled"
      });
      expect(transport.startedIndexes).toEqual([0, 1]);
      const [record] = await store.list();
      expect(record?.progress.completedChunkRanges).toEqual([
        { startIndex: 0, endIndexInclusive: 1 }
      ]);
    }
  });
});

interface ConcurrencyTransportOptions {
  delays?: readonly number[];
  failChunkIndexes?: readonly number[];
  supportsParallel?: boolean;
  onFirstChunk?: () => void;
}

class ConcurrencyTransport implements UploadTransport {
  readonly capabilities: TransportCapabilities;
  readonly startedIndexes: number[] = [];
  readonly completionOrder: number[] = [];
  completedReceiptIndexes: number[] = [];
  createCalls = 0;
  maxActive = 0;
  private active = 0;

  constructor(private readonly options: ConcurrencyTransportOptions = {}) {
    this.capabilities = {
      name: "parallel-fake",
      resumable: true,
      abortable: false,
      expires: false,
      supportsParallelChunks: options.supportsParallel ?? true,
      supportsChunkChecksum: false,
      supportsPersistentResume: true,
      supportsSnapshotResume: true
    };
  }

  async createSession(context: UploadSessionContext): Promise<UploadSessionResult> {
    this.createCalls += 1;
    return { uploadId: `parallel-${context.manifest.id}` };
  }

  async resumeSession({ record }: Parameters<NonNullable<UploadTransport["resumeSession"]>>[0]) {
    return { uploadId: record.transport.uploadId };
  }

  async uploadChunk(context: UploadChunkContext): Promise<UploadChunkReceipt> {
    this.startedIndexes.push(context.chunk.index);
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    if (context.chunk.index === 0) this.options.onFirstChunk?.();
    await delay(this.options.delays?.[context.chunk.index] ?? 5);
    this.active -= 1;
    if (this.options.failChunkIndexes?.includes(context.chunk.index)) {
      throw new Error(`Chunk ${context.chunk.index} failed.`);
    }
    this.completionOrder.push(context.chunk.index);
    return {
      chunkIndex: context.chunk.index,
      sizeBytes: context.body.size,
      completedAt: "2026-08-07T00:00:00.000Z",
      transport: { name: "parallel-fake", partNumber: context.chunk.index + 1 }
    };
  }

  async completeSession(context: UploadCompletionContext): Promise<void> {
    this.completedReceiptIndexes = context.receipts.map((receipt) => receipt.chunkIndex);
  }
}

function createFile(): IngestFileLike {
  return new File([new Uint8Array(chunkSize * 4)], "parallel-wafer.tif", {
    type: "image/tiff",
    lastModified: Date.UTC(2026, 7, 7)
  });
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}
