import { describe, expect, it } from "vitest";
import {
  createSafeQueueEventSummary,
  createSafeQueueSnapshotSummary,
  redactIngestQueueRecord
} from "../src/queue-diagnostics";
import { INGEST_QUEUE_RECORD_SCHEMA_VERSION, createIngestQueue } from "../src/queue";
import type { IngestQueueEvent, IngestQueueRecord } from "../src/types";
import { GateTransport, createQueueFile, waitFor } from "./queue-fixtures";

describe("queue telemetry and diagnostics", () => {
  it("isolates event and snapshot mutation and observer failures", async () => {
    const failures: string[] = [];
    const transport = new GateTransport("safe");
    const queue = createIngestQueue({
      createSessionOptions() {
        return { checksum: false, transport };
      },
      onEvent(event) {
        if ("item" in event) event.item.status = "canceled";
        throw new Error("observer secret");
      },
      onSnapshot(snapshot) {
        snapshot.items.splice(0);
        throw new Error("snapshot secret");
      },
      onObserverError(failure) {
        failures.push(failure.observer);
      }
    });

    await queue.enqueue(createQueueFile("private-wafer.tif", 2), { id: "safe" });
    const drained = queue.start();
    await waitFor(() => transport.waiting.length === 1);
    expect(queue.getSnapshot().items[0]?.status).toBe("running");
    transport.releaseAll();
    await drained;
    expect(queue.getSnapshot().items[0]?.status).toBe("completed");
    expect(failures).toContain("event");
    expect(failures).toContain("snapshot");
  });

  it("allowlists queue events, snapshots, and records without sensitive values", () => {
    const record = createSensitiveRecord();
    const item = {
      id: record.id,
      sequence: record.sequence,
      status: record.status,
      uploadedBytes: record.uploadedBytes,
      totalBytes: record.totalBytes,
      attempt: record.attempt,
      hasSource: true,
      hasResumeRecord: true,
      failure: record.failure,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
    const snapshot = {
      status: "paused" as const,
      counts: {
        pending: 0, "needs-source": 0, running: 0, paused: 1,
        failed: 0, completed: 0, canceled: 0
      },
      activeItems: 0,
      activeBytes: 0,
      uploadedBytes: 4,
      totalBytes: 10,
      items: [item],
      updatedAt: record.updatedAt
    };
    const event: IngestQueueEvent = {
      type: "queue:store-failed",
      itemId: record.id,
      operation: "put",
      error: new Error("https://secret.invalid/token checksum=" + "a".repeat(64))
    };

    const serialized = JSON.stringify({
      event: createSafeQueueEventSummary(event),
      snapshot: createSafeQueueSnapshotSummary(snapshot),
      record: redactIngestQueueRecord(record)
    });
    expect(serialized).not.toContain("private-wafer");
    expect(serialized).not.toContain("resume-secret");
    expect(serialized).not.toContain("secret.invalid");
    expect(serialized).not.toContain("a".repeat(64));
    expect(serialized).toContain("queue.store_failed");
  });
});

function createSensitiveRecord(): IngestQueueRecord {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: INGEST_QUEUE_RECORD_SCHEMA_VERSION,
    id: "item-safe",
    sequence: 0,
    status: "paused",
    source: {
      name: "private-wafer.tif",
      size: 10,
      type: "image/tiff",
      lastModified: 1
    },
    uploadedBytes: 4,
    totalBytes: 10,
    attempt: 1,
    resumeRecordId: "resume-secret",
    failure: { code: "transport.failed", retryable: true },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
