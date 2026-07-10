import { describe, expect, it } from "vitest";
import {
  ResumeConflictError,
  UploadCanceledError,
  UploadPausedError,
  createIngestSession,
  listRecoverableResumeRecords
} from "../src/index";
import type {
  CreateIngestSessionOptions,
  IngestEvent,
  ResumeRecord,
  UploadChunkContext,
  UploadSessionContext,
  UploadSessionResult,
  UploadTransport
} from "../src/types";
import { FakeTransport, MemoryResumeStore, createLargeTestFile } from "./resume-fixtures";

const chunking = { chunkSize: 256 * 1024 };

async function firstRecord(store: MemoryResumeStore): Promise<ResumeRecord> {
  const [record] = await store.list();
  if (!record) {
    throw new Error("Expected a resume record.");
  }
  return record;
}

function createOptions(
  transport: UploadTransport,
  store: MemoryResumeStore,
  events: IngestEvent[] = [],
  extra: Partial<CreateIngestSessionOptions> = {}
): CreateIngestSessionOptions {
  return {
    chunking,
    retries: 0,
    resume: { store },
    transport,
    onEvent(event) {
      events.push(event);
    },
    ...extra
  };
}

describe("persistent session resume", () => {
  it("rejects explicitly unsupported persistent resume before remote session creation", async () => {
    const file = createLargeTestFile();
    const store = new MemoryResumeStore();
    let createCalls = 0;
    const transport: UploadTransport = {
      capabilities: {
        name: "non-persistent",
        resumable: false,
        abortable: false,
        expires: false,
        supportsParallelChunks: false,
        supportsChunkChecksum: false,
        supportsPersistentResume: false
      },
      async createSession(): Promise<UploadSessionResult> {
        createCalls += 1;
        return { uploadId: "unused" };
      },
      async uploadChunk(): Promise<void> {},
      async completeSession(): Promise<void> {}
    };

    await expect(
      createIngestSession(file, createOptions(transport, store)).start()
    ).rejects.toMatchObject({ code: "resume.transport_unsupported" });
    expect(createCalls).toBe(0);
  });

  it("resumes an interrupted upload from the first incomplete chunk", async () => {
    const file = createLargeTestFile();
    const store = new MemoryResumeStore();
    const firstTransport = new FakeTransport({ failChunkIndexes: [2] });

    await expect(
      createIngestSession(file, createOptions(firstTransport, store)).start()
    ).rejects.toThrow("Chunk 2 failed.");

    const interrupted = await firstRecord(store);
    expect(interrupted.progress.status).toBe("failed");
    expect(interrupted.progress.completedChunkRanges).toEqual([
      { startIndex: 0, endIndexInclusive: 1 }
    ]);
    expect(interrupted.progress.nextChunkIndex).toBe(2);
    expect(interrupted).toMatchObject({
      schemaVersion: "large-image-ingest.resume.v0.2",
      receipts: [
        expect.objectContaining({ chunkIndex: 0 }),
        expect.objectContaining({ chunkIndex: 1 })
      ]
    });

    const resumeTransport = new FakeTransport();
    await createIngestSession(file, createOptions(resumeTransport, store)).resume(interrupted.id);

    expect(resumeTransport.resumed).toHaveLength(1);
    expect(resumeTransport.uploadedChunks).toEqual([2, 3]);
    await expect(store.get(interrupted.id)).resolves.toBeUndefined();
  });

  it("preserves manifest identity when a stored upload is resumed", async () => {
    const file = createLargeTestFile();
    const store = new MemoryResumeStore();

    await expect(
      createIngestSession(
        file,
        createOptions(new FakeTransport({ failChunkIndexes: [1] }), store)
      ).start()
    ).rejects.toThrow("Chunk 1 failed.");

    const interrupted = await firstRecord(store);
    const manifest = await createIngestSession(
      file,
      createOptions(new FakeTransport(), store, [], {
        resume: { store, cleanup: "mark-complete" }
      })
    ).resume(interrupted.id);

    const completed = await store.get(interrupted.id);
    expect(manifest.id).toBe(interrupted.manifest.id);
    expect(manifest.createdAt).toBe(interrupted.manifest.createdAt);
    expect(completed?.manifest.id).toBe(interrupted.manifest.id);
    expect(completed?.progress.status).toBe("completed");
  });

  it("deletes completed resume records by default", async () => {
    const file = createLargeTestFile();
    const store = new MemoryResumeStore();

    await createIngestSession(file, createOptions(new FakeTransport(), store)).start();

    await expect(store.list()).resolves.toEqual([]);
  });

  it("persists successful checkpoints after acknowledged chunks", async () => {
    const file = createLargeTestFile();
    const store = new MemoryResumeStore();

    await expect(
      createIngestSession(
        file,
        createOptions(new FakeTransport({ failChunkIndexes: [1] }), store)
      ).start()
    ).rejects.toThrow("Chunk 1 failed.");

    const record = await firstRecord(store);
    expect(record.progress.uploadedBytes).toBe(256 * 1024);
    expect(record.progress.completedChunkRanges).toEqual([
      { startIndex: 0, endIndexInclusive: 0 }
    ]);
    expect(record.progress.nextChunkIndex).toBe(1);
  });

  it("does not advance checkpoints for failed chunks", async () => {
    const file = createLargeTestFile();
    const store = new MemoryResumeStore();

    await expect(
      createIngestSession(
        file,
        createOptions(new FakeTransport({ failChunkIndexes: [0] }), store)
      ).start()
    ).rejects.toThrow("Chunk 0 failed.");

    const record = await firstRecord(store);
    expect(record.progress.uploadedBytes).toBe(0);
    expect(record.progress.completedChunkRanges).toEqual([]);
    expect(record.progress.nextChunkIndex).toBe(0);
  });

  it("pause leaves a recoverable record after the active chunk settles", async () => {
    const file = createLargeTestFile();
    const store = new MemoryResumeStore();
    let session: ReturnType<typeof createIngestSession>;

    class PauseAfterFirstChunkTransport extends FakeTransport {
      override async uploadChunk(context: UploadChunkContext) {
        const result = await super.uploadChunk(context);
        session.pause();
        return result;
      }
    }

    session = createIngestSession(file, createOptions(new PauseAfterFirstChunkTransport(), store));

    await expect(session.start()).rejects.toBeInstanceOf(UploadPausedError);

    const record = await firstRecord(store);
    expect(record.progress.status).toBe("paused");
    expect(record.progress.completedChunkRanges).toEqual([
      { startIndex: 0, endIndexInclusive: 0 }
    ]);
    expect(listRecoverableResumeRecords([record])).toHaveLength(1);
  });

  it("cancel prevents default recovery", async () => {
    const file = createLargeTestFile();
    const store = new MemoryResumeStore();
    let session: ReturnType<typeof createIngestSession>;

    class CancelOnFirstChunkTransport extends FakeTransport {
      override async uploadChunk(context: UploadChunkContext) {
        await session.cancel();
        return super.uploadChunk(context);
      }
    }

    session = createIngestSession(file, createOptions(new CancelOnFirstChunkTransport(), store));

    await expect(session.start()).rejects.toBeInstanceOf(UploadCanceledError);

    const record = await firstRecord(store);
    expect(record.progress.status).toBe("canceled");
    expect(listRecoverableResumeRecords([record])).toEqual([]);
  });

  it("fails before upload when the active transport cannot validate resume state", async () => {
    const file = createLargeTestFile();
    const store = new MemoryResumeStore();

    await expect(
      createIngestSession(
        file,
        createOptions(new FakeTransport({ failChunkIndexes: [1] }), store)
      ).start()
    ).rejects.toThrow("Chunk 1 failed.");

    const interrupted = await firstRecord(store);
    const noResumeTransport: UploadTransport = {
      async createSession(): Promise<UploadSessionResult> {
        return { uploadId: "unused" };
      },
      async uploadChunk(): Promise<void> {
        throw new Error("Should not upload.");
      },
      async completeSession(): Promise<void> {
        throw new Error("Should not complete.");
      }
    };

    await expect(
      createIngestSession(file, createOptions(noResumeTransport, store)).resume(interrupted.id)
    ).rejects.toMatchObject({
      code: "resume.transport_unsupported"
    });
  });

  it("expires stale remote resume handles before uploading", async () => {
    const file = createLargeTestFile();
    const store = new MemoryResumeStore();
    const events: IngestEvent[] = [];

    await expect(
      createIngestSession(
        file,
        createOptions(new FakeTransport({ failChunkIndexes: [1] }), store)
      ).start()
    ).rejects.toThrow("Chunk 1 failed.");

    const interrupted = await firstRecord(store);
    interrupted.transport.expiresAt = "2026-01-01T00:00:00.000Z";
    await store.put(interrupted);

    await expect(
      createIngestSession(file, createOptions(new FakeTransport(), store, events)).resume(interrupted.id)
    ).rejects.toMatchObject({
      code: "resume.expired"
    });

    const expired = await store.get(interrupted.id);
    expect(expired?.progress.status).toBe("expired");
    expect(events.some((event) => event.type === "resume:expired")).toBe(true);
  });

  it("refreshes transport resume metadata after remote validation succeeds", async () => {
    const file = createLargeTestFile();
    const store = new MemoryResumeStore();

    await expect(
      createIngestSession(
        file,
        createOptions(new FakeTransport({ failChunkIndexes: [2] }), store)
      ).start()
    ).rejects.toThrow("Chunk 2 failed.");

    const interrupted = await firstRecord(store);
    const resumeTransport = new FakeTransport({
      resumeResult: {
        resumeToken: "refreshed-token",
        data: { validatedBy: "fake-transport" }
      }
    });

    await createIngestSession(
      file,
      createOptions(resumeTransport, store, [], {
        resume: { store, cleanup: "mark-complete" }
      })
    ).resume(interrupted.id);

    const completed = await store.get(interrupted.id);
    expect(resumeTransport.resumed).toHaveLength(1);
    expect(resumeTransport.uploadedChunks).toEqual([2, 3]);
    expect(completed?.transport.data).toEqual({ validatedBy: "fake-transport" });
  });

  it("emits typed resume conflict errors", async () => {
    const file = createLargeTestFile();
    const store = new MemoryResumeStore();
    const events: IngestEvent[] = [];

    const error = await createIngestSession(
      file,
      createOptions(new FakeTransport(), store, events)
    ).resume("missing-record").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ResumeConflictError);
    expect(error).toMatchObject({ code: "resume.record_not_found" });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "resume:conflict",
        code: "resume.record_not_found"
      })
    );
  });

  it("rejects invalid custom-store state before transport resume", async () => {
    const file = createLargeTestFile();
    const store = new MemoryResumeStore();
    const transport = new FakeTransport();
    const manifest = await createIngestSession(
      file,
      createOptions(new FakeTransport(), store, [], {
        resume: { store, cleanup: "mark-complete" }
      })
    ).start();
    const completed = await firstRecord(store);
    completed.progress.status = "failed";
    completed.progress.completedChunkRanges = [
      { startIndex: 0, endIndexInclusive: Number.MAX_SAFE_INTEGER }
    ];
    store.records.set(completed.id, completed);

    await expect(
      createIngestSession(file, createOptions(transport, store)).resume(completed.id)
    ).rejects.toMatchObject({ code: "resume.record_invalid" });

    expect(manifest.id).toBe(completed.manifest.id);
    expect(transport.resumed).toHaveLength(0);
    expect(transport.uploadedChunks).toHaveLength(0);
  });
});
