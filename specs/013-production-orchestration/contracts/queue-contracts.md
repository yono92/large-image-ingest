# Public Contract: Production Orchestration

```ts
export type IngestQueueItemStatus =
  | "pending" | "needs-source" | "running" | "paused"
  | "failed" | "completed" | "canceled";

export type IngestQueueStatus = "idle" | "running" | "paused" | "drained";

export interface IngestQueueSourceIdentity {
  name: string;
  size: number;
  type: string;
  lastModified?: number;
}

export interface IngestQueueRecord {
  schemaVersion: "large-image-ingest.queue.v0.1";
  id: string;
  sequence: number;
  status: IngestQueueItemStatus;
  source: IngestQueueSourceIdentity;
  uploadedBytes: number;
  totalBytes: number;
  attempt: number;
  resumeRecordId?: string;
  failure?: { code: IngestIssueCode; retryable: boolean };
  createdAt: string;
  updatedAt: string;
}

export interface IngestQueueStore {
  get(id: string): Promise<IngestQueueRecord | undefined>;
  put(record: IngestQueueRecord): Promise<void>;
  list(): Promise<IngestQueueRecord[]>;
  delete(id: string): Promise<void>;
}

export interface IngestQueueSessionFactoryContext {
  itemId: string;
  attempt: number;
  source: IngestQueueSourceIdentity;
  resumeRecordId?: string;
}

export interface CreateIngestQueueOptions {
  createSessionOptions(context: IngestQueueSessionFactoryContext): CreateIngestSessionOptions;
  maxActiveItems?: number;
  maxActiveBytes?: number;
  maxQueuedItems?: number;
  store?: IngestQueueStore;
  resolveSource?(identity: IngestQueueSourceIdentity, itemId: string): Promise<IngestFileLike | undefined>;
  onEvent?(event: IngestQueueEvent): void;
  onSnapshot?(snapshot: IngestQueueSnapshot): void;
  onObserverError?(failure: IngestQueueObserverFailure): void;
}

export function createIngestQueue(options: CreateIngestQueueOptions): LargeImageIngestQueue;

export class LargeImageIngestQueue {
  enqueue(file: IngestFileLike, options?: { id?: string }): Promise<string>;
  restore(): Promise<IngestQueueSnapshot>;
  start(): Promise<IngestQueueSnapshot>;
  pause(reason?: unknown): Promise<void>;
  resume(): Promise<IngestQueueSnapshot>;
  retryItem(id: string): Promise<void>;
  cancelItem(id: string, reason?: unknown): Promise<void>;
  attachSource(id: string, file: IngestFileLike): Promise<void>;
  removeItem(id: string): Promise<void>;
  getSnapshot(): IngestQueueSnapshot;
}
```

`start()` and `resume()` resolve with the latest detached snapshot when the queue is paused or no active/pending schedulable item remains. Enqueueing while the queue is running joins the same admission cycle. `maxQueuedItems` counts terminal items until `removeItem()` deletes them.

New typed issue codes:

```ts
"queue.invalid_options"
"queue.capacity_exceeded"
"queue.duplicate_item"
"queue.item_not_found"
"queue.invalid_transition"
"queue.store_failed"
"queue.record_invalid"
"queue.source_mismatch"
```
