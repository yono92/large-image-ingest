import type { ResumeRecord, ResumeStore } from "./types.js";
import { ResumeConflictError, parseResumeRecord } from "./resume.js";

export interface ResumeStorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class WebStorageResumeStore implements ResumeStore {
  constructor(
    private readonly storage: ResumeStorageLike,
    private readonly keyPrefix = "large-image-ingest.resume."
  ) {}

  async get(recordId: string): Promise<ResumeRecord | undefined> {
    const raw = this.storage.getItem(this.toKey(recordId));
    return raw ? parseStoredRecord(raw, recordId) : undefined;
  }

  async put(record: ResumeRecord): Promise<void> {
    const normalized = parseResumeRecord(record);
    this.storage.setItem(this.toKey(normalized.id), JSON.stringify(normalized));
  }

  async list(): Promise<ResumeRecord[]> {
    const records: ResumeRecord[] = [];

    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);

      if (!key?.startsWith(this.keyPrefix)) {
        continue;
      }

      const raw = this.storage.getItem(key);
      if (raw) {
        records.push(parseStoredRecord(raw, key.slice(this.keyPrefix.length)));
      }
    }

    return records;
  }

  async delete(recordId: string): Promise<void> {
    this.storage.removeItem(this.toKey(recordId));
  }

  private toKey(recordId: string): string {
    return `${this.keyPrefix}${recordId}`;
  }
}

function parseStoredRecord(raw: string, recordId: string): ResumeRecord {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ResumeConflictError(
      "resume.record_invalid",
      "Stored resume record is not valid JSON.",
      recordId
    );
  }

  return parseResumeRecord(value);
}
