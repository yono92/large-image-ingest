import { IngestQueueError, parseIngestQueueRecord } from "./queue.js";
import type { IngestQueueRecord, IngestQueueStore } from "./types.js";
import type { ResumeStorageLike } from "./web-storage-resume-store.js";

export class WebStorageQueueStore implements IngestQueueStore {
  constructor(
    private readonly storage: ResumeStorageLike,
    private readonly keyPrefix = "large-image-ingest.queue."
  ) {}

  async get(id: string): Promise<IngestQueueRecord | undefined> {
    const raw = this.storage.getItem(this.toKey(id));
    return raw ? parseStoredQueueRecord(raw) : undefined;
  }

  async put(record: IngestQueueRecord): Promise<void> {
    const normalized = parseIngestQueueRecord(record);
    this.storage.setItem(this.toKey(normalized.id), JSON.stringify(normalized));
  }

  async list(): Promise<IngestQueueRecord[]> {
    const records: IngestQueueRecord[] = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key?.startsWith(this.keyPrefix)) continue;
      const raw = this.storage.getItem(key);
      if (raw) records.push(parseStoredQueueRecord(raw));
    }
    return records;
  }

  async delete(id: string): Promise<void> {
    this.storage.removeItem(this.toKey(id));
  }

  private toKey(id: string): string {
    return `${this.keyPrefix}${id}`;
  }
}

function parseStoredQueueRecord(raw: string): IngestQueueRecord {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new IngestQueueError("queue.record_invalid", "Stored queue state is not valid JSON.");
  }
  return parseIngestQueueRecord(value);
}
