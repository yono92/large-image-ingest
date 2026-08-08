import { describe, expect, it } from "vitest";
import {
  INGEST_QUEUE_RECORD_SCHEMA_VERSION,
  createIngestQueue,
  createQueueSourceIdentity
} from "../src/queue";
import type { IngestQueueRecord } from "../src/types";
import { GateTransport, MemoryQueueStore, createQueueFile, waitFor } from "./queue-fixtures";
import { FakeTransport, MemoryResumeStore, createLargeTestFile } from "./resume-fixtures";

describe("durable ingest queue recovery", () => {
  it("normalizes running intent, restores an exact source, and schedules it", async () => {
    const file = createQueueFile("restore.tif", 3);
    const store = new MemoryQueueStore();
    store.records.set("restore", createRecord("restore", file, "running"));
    const transport = new GateTransport("restore");
    let sessionCalls = 0;
    const queue = createIngestQueue({
      store,
      resolveSource(identity) {
        expect(identity).toEqual(createQueueSourceIdentity(file));
        return file;
      },
      createSessionOptions() {
        sessionCalls += 1;
        return { checksum: false, transport };
      }
    });

    await queue.restore();
    expect(queue.getSnapshot().items[0]).toMatchObject({ status: "pending", hasSource: true });
    const drained = queue.start();
    await waitFor(() => transport.waiting.length === 1);
    transport.releaseAll();
    await drained;
    expect(sessionCalls).toBe(1);
  });

  it("keeps missing or mismatched sources blocked with zero session calls", async () => {
    const exact = createQueueFile("exact.tif", 3);
    const store = new MemoryQueueStore();
    store.records.set("missing", createRecord("missing", exact, "pending", 0));
    store.records.set("mismatch", createRecord("mismatch", exact, "pending", 1));
    let sessionCalls = 0;
    const queue = createIngestQueue({
      store,
      resolveSource(_identity, id) {
        return id === "mismatch" ? createQueueFile("other.tif", 3) : undefined;
      },
      createSessionOptions() {
        sessionCalls += 1;
        return { checksum: false, transport: new GateTransport("never") };
      }
    });

    await queue.restore();
    await queue.start();
    expect(queue.getSnapshot().counts["needs-source"]).toBe(2);
    expect(sessionCalls).toBe(0);
    await expect(queue.attachSource("mismatch", createQueueFile("wrong.tif", 3)))
      .rejects.toMatchObject({ code: "queue.source_mismatch" });
  });

  it("schedules a needs-source item only after the exact source is attached", async () => {
    const file = createQueueFile("attach.tif", 3);
    const store = new MemoryQueueStore();
    store.records.set("attach", createRecord("attach", file, "pending"));
    const transport = new GateTransport("attach");
    let sessionCalls = 0;
    const queue = createIngestQueue({
      store,
      createSessionOptions() {
        sessionCalls += 1;
        return { checksum: false, transport };
      }
    });
    await queue.restore();
    expect(queue.getSnapshot().items[0]?.status).toBe("needs-source");
    await queue.start();
    expect(sessionCalls).toBe(0);

    await queue.attachSource("attach", file);
    const drained = queue.start();
    await waitFor(() => transport.waiting.length === 1);
    transport.releaseAll();
    await drained;
    expect(queue.getSnapshot().items[0]?.status).toBe("completed");
    expect(sessionCalls).toBe(1);
  });

  it("persists before admission and preserves remote completion when final persistence fails", async () => {
    const failedEnqueueStore = new MemoryQueueStore();
    failedEnqueueStore.failPutStatus = "pending";
    const blockedQueue = createIngestQueue({
      store: failedEnqueueStore,
      createSessionOptions() {
        throw new Error("must not construct");
      }
    });
    await expect(blockedQueue.enqueue(createQueueFile("blocked.tif", 1), { id: "blocked" }))
      .rejects.toMatchObject({ code: "queue.store_failed" });
    expect(blockedQueue.getSnapshot().items).toEqual([]);

    const completionStore = new MemoryQueueStore();
    completionStore.failPutStatus = "completed";
    const transport = new GateTransport("complete");
    const eventTypes: string[] = [];
    const queue = createIngestQueue({
      store: completionStore,
      createSessionOptions() {
        return { checksum: false, transport };
      },
      onEvent(event) {
        eventTypes.push(event.type);
      }
    });
    await queue.enqueue(createQueueFile("complete.tif", 1), { id: "complete" });
    const drained = queue.start();
    await waitFor(() => transport.waiting.length === 1);
    transport.releaseAll();
    await drained;
    expect(queue.getSnapshot().counts.completed).toBe(1);
    expect(transport.completeCalls).toBe(1);
    expect(eventTypes).toContain("queue:store-failed");
  });

  it("rejects invalid stored records without constructing sessions", async () => {
    const store = new MemoryQueueStore();
    store.records.set("bad", { id: "bad" } as IngestQueueRecord);
    let calls = 0;
    const queue = createIngestQueue({
      store,
      createSessionOptions() {
        calls += 1;
        return { checksum: false, transport: new GateTransport("never") };
      }
    });
    await expect(queue.restore()).rejects.toMatchObject({ code: "queue.record_invalid" });
    expect(calls).toBe(0);
  });

  it("carries a session resume record into a fresh retry session", async () => {
    const file = createLargeTestFile("queue-resume.tif");
    const resumeStore = new MemoryResumeStore();
    const transports = [new FakeTransport({ failChunkIndexes: [0] }), new FakeTransport()];
    const resumeIds: Array<string | undefined> = [];
    let attempt = 0;
    const queue = createIngestQueue({
      createSessionOptions(context) {
        resumeIds.push(context.resumeRecordId);
        return {
          checksum: { required: true },
          chunking: { chunkSize: 256 * 1024 },
          resume: { store: resumeStore },
          retries: 0,
          transport: transports[attempt++]!
        };
      }
    });

    await queue.enqueue(file, { id: "resume-item" });
    await queue.start();
    expect(queue.getSnapshot().items[0]).toMatchObject({ status: "failed", hasResumeRecord: true });
    await queue.retryItem("resume-item");
    await queue.start();

    expect(resumeIds[0]).toBeUndefined();
    expect(resumeIds[1]).toEqual(expect.any(String));
    expect(transports[1]!.resumed).toHaveLength(1);
    expect(queue.getSnapshot().items[0]?.status).toBe("completed");
  });
});

function createRecord(
  id: string,
  file: File,
  status: IngestQueueRecord["status"],
  sequence = 0
): IngestQueueRecord {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: INGEST_QUEUE_RECORD_SCHEMA_VERSION,
    id,
    sequence,
    status,
    source: createQueueSourceIdentity(file),
    uploadedBytes: 0,
    totalBytes: file.size,
    attempt: 1,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
