import { describe, expect, it } from "vitest";
import { INGEST_QUEUE_RECORD_SCHEMA_VERSION } from "../src/queue";
import { WebStorageQueueStore } from "../src/web-storage-queue-store";
import type { IngestQueueRecord } from "../src/types";
import type { ResumeStorageLike } from "../src/web-storage-resume-store";

class MemoryStorage implements ResumeStorageLike {
  readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe("WebStorageQueueStore", () => {
  it("round-trips detached records and ignores unrelated keys", async () => {
    const storage = new MemoryStorage();
    storage.setItem("other", "{}");
    const store = new WebStorageQueueStore(storage);
    const record = createRecord();
    await store.put(record);
    record.status = "canceled";

    const restored = await store.get("item-1");
    expect(restored?.status).toBe("pending");
    if (restored) restored.status = "failed";
    await expect(store.get("item-1")).resolves.toMatchObject({ status: "pending" });
    await expect(store.list()).resolves.toHaveLength(1);
    await store.delete("item-1");
    await expect(store.list()).resolves.toEqual([]);
  });

  it("rejects malformed JSON and structurally invalid records", async () => {
    const storage = new MemoryStorage();
    const store = new WebStorageQueueStore(storage);
    storage.setItem("large-image-ingest.queue.bad", "{");
    await expect(store.get("bad")).rejects.toMatchObject({ code: "queue.record_invalid" });
    storage.setItem("large-image-ingest.queue.bad", JSON.stringify({ id: "bad" }));
    await expect(store.list()).rejects.toMatchObject({ code: "queue.record_invalid" });
    await expect(store.put({ id: "bad" } as IngestQueueRecord))
      .rejects.toMatchObject({ code: "queue.record_invalid" });
  });
});

function createRecord(): IngestQueueRecord {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: INGEST_QUEUE_RECORD_SCHEMA_VERSION,
    id: "item-1",
    sequence: 0,
    status: "pending",
    source: { name: "secret.tif", size: 10, type: "image/tiff", lastModified: 1 },
    uploadedBytes: 0,
    totalBytes: 10,
    attempt: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
