import { createIngestSession, type LargeImageIngestSession } from "./session.js";
import type {
  CreateIngestQueueOptions,
  EnqueueIngestOptions,
  IngestEvent,
  IngestFileLike,
  IngestIssueCode,
  IngestQueueEvent,
  IngestQueueFailure,
  IngestQueueItemSnapshot,
  IngestQueueItemStatus,
  IngestQueueObserverFailure,
  IngestQueueRecord,
  IngestQueueSnapshot,
  IngestQueueSourceIdentity,
  IngestQueueStatus,
  UploadSessionSnapshot
} from "./types.js";

export const INGEST_QUEUE_RECORD_SCHEMA_VERSION = "large-image-ingest.queue.v0.1" as const;
export const DEFAULT_MAX_ACTIVE_QUEUE_ITEMS = 2;
export const DEFAULT_MAX_ACTIVE_QUEUE_BYTES = 8 * 1024 ** 3;
export const DEFAULT_MAX_QUEUED_ITEMS = 1_000;
export const MAX_ACTIVE_QUEUE_ITEMS = 32;
export const MAX_QUEUED_ITEMS = 100_000;

const KNOWN_INGEST_ISSUE_CODES = new Set<IngestIssueCode>([
  "file.empty", "file.too_large", "file.too_small", "file.mime_not_allowed",
  "file.extension_not_allowed", "metadata.required_missing", "checksum.mismatch",
  "checksum.aborted", "checksum.worker_failed", "image.dimensions_unavailable",
  "image.width_too_small", "image.width_too_large", "image.height_too_small",
  "image.height_too_large", "chunk.invalid_size", "execution.invalid_concurrency",
  "execution.parallel_unsupported", "queue.invalid_options", "queue.capacity_exceeded",
  "queue.duplicate_item", "queue.item_not_found", "queue.invalid_transition",
  "queue.store_failed", "queue.record_invalid", "queue.source_mismatch",
  "transport.failed", "transport.aborted", "transport.paused", "transport.canceled",
  "transport.session_expired", "transport.offset_mismatch", "transport.part_rejected",
  "transport.receipt_missing", "transport.receipt_invalid", "transport.complete_failed",
  "transport.abort_failed", "transport.resume_failed", "transport.unsafe_path",
  "transport.unrecoverable", "derivative.id.missing", "derivative.id.duplicate",
  "derivative.kind.unsupported", "derivative.status.invalid", "derivative.source.missing",
  "derivative.source.mismatch", "derivative.storage.unsafe", "derivative.payload.embedded",
  "derivative.failure.unsafe", "derivative.tile.invalid", "derivative.required.missing",
  "completion.evidence_invalid", "completion.schema_unsupported",
  "completion.integrity_mismatch", "verification.manifest_schema_unsupported",
  "verification.manifest_invalid", "verification.original_mismatch",
  "verification.checksum_missing", "verification.checksum_unsupported",
  "verification.checksum_mismatch", "verification.receipt_missing",
  "verification.receipt_duplicate", "verification.receipt_invalid",
  "verification.receipt_incomplete", "verification.transport_mismatch",
  "verification.file_not_found", "verification.file_unreadable",
  "resume.record_not_found", "resume.record_invalid", "resume.schema_unsupported",
  "resume.receipt_missing", "resume.receipt_invalid", "resume.content_identity_missing",
  "resume.content_mismatch", "resume.file_mismatch", "resume.chunking_mismatch",
  "resume.transport_unsupported", "resume.transport_mismatch", "resume.expired",
  "resume.store_failed", "profile.invalid", "profile.field_missing", "profile.field_type",
  "profile.field_min_length", "profile.field_max_length", "profile.field_min_value",
  "profile.field_max_value", "profile.field_enum", "profile.field_pattern", "policy.invalid",
  "policy.metadata_invalid", "policy.original_not_preserved", "policy.checksum_missing",
  "policy.checksum_algorithm", "policy.completion_missing", "policy.completion_invalid",
  "policy.completion_unverified", "policy.stored_checksum_missing", "policy.source_too_large",
  "policy.media_type_disallowed", "evidence.bundle_invalid", "evidence.bundle_mismatch",
  "evidence.canonicalization_failed", "evidence.signature_failed", "evidence.signature_invalid"
]);

type QueueIssueCode = Extract<IngestIssueCode, `queue.${string}`>;

interface RuntimeQueueItem {
  record: IngestQueueRecord;
  source?: IngestFileLike | undefined;
}

interface ActiveQueueItem {
  session: LargeImageIngestSession;
  sourceSize: number;
}

interface NormalizedQueuePolicy {
  maxActiveItems: number;
  maxActiveBytes: number;
  maxQueuedItems: number;
}

export class IngestQueueError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly code: QueueIssueCode,
    message: string,
    retryable = false
  ) {
    super(message);
    this.name = "IngestQueueError";
    this.retryable = retryable;
  }
}

export class LargeImageIngestQueue {
  private readonly active = new Map<string, ActiveQueueItem>();
  private readonly items = new Map<string, RuntimeQueueItem>();
  private readonly policy: NormalizedQueuePolicy;
  private readonly storeWrites = new Map<string, Promise<void>>();
  private readonly waiters: Array<(snapshot: IngestQueueSnapshot) => void> = [];
  private queueStatus: IngestQueueStatus = "idle";
  private scheduling = false;
  private lastUpdatedAt = nowIso();

  constructor(private readonly options: CreateIngestQueueOptions) {
    this.policy = normalizeQueuePolicy(options);
  }

  async enqueue(file: IngestFileLike, options: EnqueueIngestOptions = {}): Promise<string> {
    if (this.items.size >= this.policy.maxQueuedItems) {
      throw queueError("queue.capacity_exceeded", "The ingest queue has reached its item limit.");
    }

    const id = options.id ?? createQueueItemId();
    let storedDuplicate: IngestQueueRecord | undefined;
    try {
      storedDuplicate = await this.options.store?.get(id);
    } catch {
      throw queueError("queue.store_failed", "The queue store could not check the item ID.", true);
    }
    if (!id || this.items.has(id) || storedDuplicate) {
      throw queueError("queue.duplicate_item", "The ingest queue item ID already exists.");
    }

    const timestamp = nowIso();
    const record: IngestQueueRecord = {
      schemaVersion: INGEST_QUEUE_RECORD_SCHEMA_VERSION,
      id,
      sequence: this.nextSequence(),
      status: "pending",
      source: createQueueSourceIdentity(file),
      uploadedBytes: 0,
      totalBytes: file.size,
      attempt: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    if (this.options.store) {
      try {
        await this.options.store.put(cloneQueueRecord(record));
      } catch {
        throw queueError("queue.store_failed", "The queue item could not be persisted before admission.", true);
      }
    }

    const item: RuntimeQueueItem = { record, source: file };
    this.items.set(id, item);
    this.touch();
    this.emit({ type: "item:enqueued", item: toItemSnapshot(item) });
    this.publishSnapshot();
    if (this.queueStatus === "running") void this.schedule();
    return id;
  }

  async restore(): Promise<IngestQueueSnapshot> {
    if (!this.options.store) return this.getSnapshot();

    let records: IngestQueueRecord[];
    try {
      records = (await this.options.store.list()).map(parseIngestQueueRecord);
    } catch (error: unknown) {
      if (error instanceof IngestQueueError && error.code === "queue.record_invalid") {
        throw error;
      }
      this.emit({ type: "queue:store-failed", operation: "list", error });
      throw queueError("queue.store_failed", "Queue records could not be restored.", true);
    }

    for (const record of records.sort(compareQueueRecords)) {
      if (this.items.has(record.id)) {
        throw queueError("queue.duplicate_item", "A restored queue item ID already exists.");
      }
      if (this.items.size >= this.policy.maxQueuedItems) {
        throw queueError("queue.capacity_exceeded", "Restored queue records exceed the item limit.");
      }

      const restored = cloneQueueRecord(record);
      if (restored.status === "running") restored.status = "pending";
      const item: RuntimeQueueItem = { record: restored };

      if (!isTerminal(restored.status)) {
        const source = await this.resolveRestoredSource(restored);
        if (source) {
          item.source = source;
          if (restored.status === "needs-source") restored.status = "pending";
          restored.failure = undefined;
        } else {
          restored.status = "needs-source";
        }
      }

      restored.updatedAt = nowIso();
      this.items.set(restored.id, item);
      await this.persist(item, true);
      this.emit({ type: "item:restored", item: toItemSnapshot(item) });
      if (restored.status === "needs-source") {
        this.emit({ type: "item:source-needed", item: toItemSnapshot(item) });
      }
    }

    this.touch();
    this.publishSnapshot();
    return this.getSnapshot();
  }

  start(): Promise<IngestQueueSnapshot> {
    if (this.queueStatus !== "running") {
      this.queueStatus = "running";
      this.touch();
      this.publishSnapshot();
    }
    void this.schedule();
    return this.waitForSettled();
  }

  async pause(reason?: unknown): Promise<void> {
    this.queueStatus = "paused";
    this.touch();
    for (const active of this.active.values()) active.session.pause(reason);
    const snapshot = this.getSnapshot();
    this.emit({ type: "queue:paused", snapshot });
    this.publishSnapshot();
    this.settleWaiters();
  }

  async resume(): Promise<IngestQueueSnapshot> {
    for (const item of this.items.values()) {
      if (item.record.status !== "paused" || !item.source) continue;
      item.record.status = "pending";
      item.record.failure = undefined;
      item.record.updatedAt = nowIso();
      await this.persist(item, true);
    }
    return this.start();
  }

  async retryItem(id: string): Promise<void> {
    const item = this.requireItem(id);
    if (item.record.status !== "failed" || !item.source) {
      throw queueError("queue.invalid_transition", "Only a failed item with an attached source can be retried.");
    }
    item.record.status = "pending";
    item.record.failure = undefined;
    item.record.updatedAt = nowIso();
    await this.persist(item, true);
    this.touch();
    this.publishSnapshot();
    if (this.queueStatus === "running") void this.schedule();
  }

  async cancelItem(id: string, reason?: unknown): Promise<void> {
    const item = this.requireItem(id);
    if (item.record.status === "completed" || item.record.status === "canceled") {
      throw queueError("queue.invalid_transition", "The queue item is already terminal.");
    }

    item.record.status = "canceled";
    item.record.failure = undefined;
    item.record.updatedAt = nowIso();
    await this.persist(item, true);
    const active = this.active.get(id);
    if (active) await active.session.cancel(reason);
    this.touch();
    this.emit({ type: "item:canceled", item: toItemSnapshot(item) });
    this.publishSnapshot();
    void this.schedule();
  }

  async attachSource(id: string, file: IngestFileLike): Promise<void> {
    const item = this.requireItem(id);
    if (item.record.status !== "needs-source") {
      throw queueError("queue.invalid_transition", "A source can only be attached to an item that needs one.");
    }
    if (!queueSourceIdentityMatches(item.record.source, file)) {
      throw queueError("queue.source_mismatch", "The selected source metadata does not match the queue record.");
    }

    item.source = file;
    item.record.status = "pending";
    item.record.failure = undefined;
    item.record.updatedAt = nowIso();
    await this.persist(item, true);
    this.touch();
    this.emit({ type: "item:source-attached", item: toItemSnapshot(item) });
    this.publishSnapshot();
    if (this.queueStatus === "running") void this.schedule();
  }

  async removeItem(id: string): Promise<void> {
    const item = this.requireItem(id);
    if (!isTerminal(item.record.status)) {
      throw queueError("queue.invalid_transition", "Only completed or canceled queue items can be removed.");
    }

    await this.storeWrites.get(id);
    if (this.options.store) {
      try {
        await this.options.store.delete(id);
      } catch (error: unknown) {
        this.emit({ type: "queue:store-failed", itemId: id, operation: "delete", error });
        throw queueError("queue.store_failed", "The terminal queue item could not be removed.", true);
      }
    }
    this.items.delete(id);
    this.storeWrites.delete(id);
    this.touch();
    this.emit({ type: "item:removed", itemId: id });
    this.publishSnapshot();
  }

  getSnapshot(): IngestQueueSnapshot {
    const orderedItems = [...this.items.values()].sort((a, b) => compareQueueRecords(a.record, b.record));
    const counts = emptyCounts();
    let uploadedBytes = 0;
    let totalBytes = 0;
    for (const item of orderedItems) {
      counts[item.record.status] += 1;
      uploadedBytes += item.record.uploadedBytes;
      totalBytes += item.record.totalBytes;
    }

    let activeBytes = 0;
    for (const active of this.active.values()) activeBytes += active.sourceSize;
    return {
      status: this.queueStatus,
      counts,
      activeItems: this.active.size,
      activeBytes,
      uploadedBytes,
      totalBytes,
      items: orderedItems.map(toItemSnapshot),
      updatedAt: this.lastUpdatedAt
    };
  }

  private async schedule(): Promise<void> {
    if (this.scheduling) return;
    this.scheduling = true;
    try {
      while (this.queueStatus === "running" && this.active.size < this.policy.maxActiveItems) {
        const next = this.nextPendingItem();
        if (!next) break;
        if (!this.canAdmit(next)) break;

        next.record.status = "running";
        next.record.attempt += 1;
        next.record.updatedAt = nowIso();
        try {
          await this.persist(next, true);
        } catch {
          next.record.status = "failed";
          next.record.failure = { code: "queue.store_failed", retryable: true };
          next.record.updatedAt = nowIso();
          this.emit({ type: "item:failed", item: toItemSnapshot(next) });
          continue;
        }

        if (this.queueStatus !== "running") {
          next.record.status = "pending";
          next.record.updatedAt = nowIso();
          await this.persist(next, false);
          break;
        }

        const source = next.source;
        if (!source) {
          next.record.status = "needs-source";
          next.record.updatedAt = nowIso();
          await this.persist(next, false);
          this.emit({ type: "item:source-needed", item: toItemSnapshot(next) });
          continue;
        }

        let session: LargeImageIngestSession;
        try {
          session = this.createSession(next, source);
        } catch (error: unknown) {
          next.record.status = "failed";
          next.record.failure = toSafeFailure(error);
          next.record.updatedAt = nowIso();
          await this.persist(next, false);
          this.emit({ type: "item:failed", item: toItemSnapshot(next) });
          continue;
        }

        this.active.set(next.record.id, { session, sourceSize: source.size });
        this.touch();
        this.emit({ type: "item:started", item: toItemSnapshot(next) });
        this.publishSnapshot();
        void this.executeItem(next, session);
      }
    } finally {
      this.scheduling = false;
      this.finishRunIfSettled();
    }
  }

  private createSession(item: RuntimeQueueItem, source: IngestFileLike): LargeImageIngestSession {
    const context = {
      itemId: item.record.id,
      attempt: item.record.attempt,
      source: cloneSourceIdentity(item.record.source),
      ...(item.record.resumeRecordId ? { resumeRecordId: item.record.resumeRecordId } : {})
    };
    const sessionOptions = this.options.createSessionOptions(context);
    const userOnEvent = sessionOptions.onEvent;
    const userOnSnapshot = sessionOptions.onSnapshot;
    return createIngestSession(source, {
      ...sessionOptions,
      onEvent: (event) => {
        this.handleSessionEvent(item, event);
        userOnEvent?.(event);
      },
      onSnapshot: (snapshot) => {
        this.handleSessionSnapshot(item, snapshot);
        userOnSnapshot?.(snapshot);
      }
    });
  }

  private async executeItem(
    item: RuntimeQueueItem,
    session: LargeImageIngestSession
  ): Promise<void> {
    try {
      if (item.record.resumeRecordId) await session.resume(item.record.resumeRecordId);
      else await session.start();
      if (item.record.status !== "canceled") {
        item.record.status = "completed";
        item.record.uploadedBytes = item.record.totalBytes;
        item.record.failure = undefined;
        item.record.updatedAt = nowIso();
        await this.persist(item, false);
        this.emit({ type: "item:completed", item: toItemSnapshot(item) });
      }
    } catch (error: unknown) {
      if (item.record.status !== "canceled") {
        const status = session.getSnapshot()?.status;
        if (status === "paused" || errorCode(error) === "transport.paused") {
          item.record.status = "paused";
          item.record.failure = undefined;
          this.emit({ type: "item:paused", item: toItemSnapshot(item) });
        } else if (status === "canceled" || errorCode(error) === "transport.canceled") {
          item.record.status = "canceled";
          item.record.failure = undefined;
          this.emit({ type: "item:canceled", item: toItemSnapshot(item) });
        } else {
          item.record.status = "failed";
          item.record.failure = toSafeFailure(error);
          this.emit({ type: "item:failed", item: toItemSnapshot(item) });
        }
        item.record.updatedAt = nowIso();
        await this.persist(item, false);
      }
    } finally {
      this.active.delete(item.record.id);
      this.touch();
      this.publishSnapshot();
      void this.schedule();
    }
  }

  private handleSessionEvent(item: RuntimeQueueItem, event: IngestEvent): void {
    if (
      event.type === "resume:available" ||
      event.type === "resume:started" ||
      event.type === "resume:checkpoint"
    ) {
      item.record.resumeRecordId = event.recordId;
      item.record.updatedAt = nowIso();
      void this.persist(item, false);
    }
  }

  private handleSessionSnapshot(item: RuntimeQueueItem, snapshot: UploadSessionSnapshot): void {
    item.record.uploadedBytes = Math.min(snapshot.uploadedBytes, item.record.totalBytes);
    item.record.updatedAt = nowIso();
    void this.persist(item, false);
    this.touch();
    this.emit({ type: "item:progress", item: toItemSnapshot(item) });
    this.publishSnapshot();
  }

  private async resolveRestoredSource(record: IngestQueueRecord): Promise<IngestFileLike | undefined> {
    if (!this.options.resolveSource) return undefined;
    let source: IngestFileLike | undefined;
    try {
      source = await this.options.resolveSource(cloneSourceIdentity(record.source), record.id);
    } catch {
      return undefined;
    }
    if (!source) return undefined;
    if (!queueSourceIdentityMatches(record.source, source)) {
      record.failure = { code: "queue.source_mismatch", retryable: false };
      return undefined;
    }
    return source;
  }

  private nextPendingItem(): RuntimeQueueItem | undefined {
    return [...this.items.values()]
      .filter((item) => item.record.status === "pending")
      .sort((a, b) => compareQueueRecords(a.record, b.record))[0];
  }

  private canAdmit(item: RuntimeQueueItem): boolean {
    const activeBytes = [...this.active.values()]
      .reduce((total, active) => total + active.sourceSize, 0);
    if (activeBytes + item.record.totalBytes <= this.policy.maxActiveBytes) return true;
    return this.active.size === 0;
  }

  private async persist(item: RuntimeQueueItem, required: boolean): Promise<void> {
    if (!this.options.store) return;
    const record = cloneQueueRecord(item.record);
    const previous = this.storeWrites.get(record.id) ?? Promise.resolve();
    const write = previous.then(() => this.options.store?.put(record));
    const handled = write.catch((error: unknown) => {
      this.emit({ type: "queue:store-failed", itemId: record.id, operation: "put", error });
      if (required) {
        throw queueError("queue.store_failed", "Queue state could not be persisted.", true);
      }
    });
    this.storeWrites.set(record.id, handled.catch(() => undefined));
    await handled;
  }

  private requireItem(id: string): RuntimeQueueItem {
    const item = this.items.get(id);
    if (!item) throw queueError("queue.item_not_found", "The queue item does not exist.");
    return item;
  }

  private nextSequence(): number {
    let highest = -1;
    for (const item of this.items.values()) highest = Math.max(highest, item.record.sequence);
    return highest + 1;
  }

  private waitForSettled(): Promise<IngestQueueSnapshot> {
    if (this.isSettled()) return Promise.resolve(this.finishRunIfSettled());
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private isSettled(): boolean {
    return this.queueStatus === "paused" || (
      !this.scheduling &&
      this.active.size === 0 &&
      ![...this.items.values()].some((item) =>
        item.record.status === "pending" || item.record.status === "running"
      )
    );
  }

  private finishRunIfSettled(): IngestQueueSnapshot {
    const hasRunningIntent = [...this.items.values()]
      .some((item) => item.record.status === "running");
    if (
      this.queueStatus === "running" &&
      !this.scheduling &&
      this.active.size === 0 &&
      !this.nextPendingItem() &&
      !hasRunningIntent
    ) {
      this.queueStatus = "drained";
      this.touch();
      const snapshot = this.getSnapshot();
      this.emit({ type: "queue:drained", snapshot });
      this.publishSnapshot();
    }
    const snapshot = this.getSnapshot();
    this.settleWaiters();
    return snapshot;
  }

  private settleWaiters(): void {
    if (!this.isSettled()) return;
    const snapshot = this.getSnapshot();
    for (const resolve of this.waiters.splice(0)) resolve(structuredClone(snapshot));
  }

  private emit(event: IngestQueueEvent): void {
    try {
      this.options.onEvent?.(cloneQueueEvent(event));
    } catch (error: unknown) {
      this.notifyObserverFailure({ observer: "event", eventType: event.type, error });
    }
  }

  private publishSnapshot(): void {
    try {
      this.options.onSnapshot?.(this.getSnapshot());
    } catch (error: unknown) {
      this.notifyObserverFailure({ observer: "snapshot", error });
    }
  }

  private notifyObserverFailure(failure: IngestQueueObserverFailure): void {
    try {
      this.options.onObserverError?.({ ...failure });
    } catch {
      // Observer failure reporting is non-fatal by contract.
    }
  }

  private touch(): void {
    this.lastUpdatedAt = nowIso();
  }
}

export function createIngestQueue(options: CreateIngestQueueOptions): LargeImageIngestQueue {
  return new LargeImageIngestQueue(options);
}

export function createQueueSourceIdentity(file: IngestFileLike): IngestQueueSourceIdentity {
  const identity: IngestQueueSourceIdentity = {
    name: file.name,
    size: file.size,
    type: file.type
  };
  if (file.lastModified !== undefined) identity.lastModified = file.lastModified;
  return identity;
}

export function queueSourceIdentityMatches(
  identity: IngestQueueSourceIdentity,
  file: IngestFileLike
): boolean {
  return identity.name === file.name &&
    identity.size === file.size &&
    identity.type === file.type &&
    identity.lastModified === file.lastModified;
}

export function parseIngestQueueRecord(value: unknown): IngestQueueRecord {
  if (!isRecord(value) || value.schemaVersion !== INGEST_QUEUE_RECORD_SCHEMA_VERSION) {
    throw queueError("queue.record_invalid", "The queue record schema is unsupported or invalid.");
  }
  const source = value.source;
  const failure = value.failure;
  if (
    !hasOnlyKeys(value, [
      "schemaVersion", "id", "sequence", "status", "source", "uploadedBytes",
      "totalBytes", "attempt", "resumeRecordId", "failure", "createdAt", "updatedAt"
    ]) ||
    !isNonEmptyString(value.id) ||
    !isNonNegativeSafeInteger(value.sequence) ||
    !isQueueItemStatus(value.status) ||
    !isRecord(source) ||
    !hasOnlyKeys(source, ["name", "size", "type", "lastModified"]) ||
    typeof source.name !== "string" ||
    !isNonNegativeSafeInteger(source.size) ||
    typeof source.type !== "string" ||
    (source.lastModified !== undefined && !isNonNegativeSafeInteger(source.lastModified)) ||
    !isNonNegativeSafeInteger(value.uploadedBytes) ||
    !isNonNegativeSafeInteger(value.totalBytes) ||
    value.uploadedBytes > value.totalBytes ||
    value.totalBytes !== source.size ||
    !isNonNegativeSafeInteger(value.attempt) ||
    (value.resumeRecordId !== undefined && !isNonEmptyString(value.resumeRecordId)) ||
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.updatedAt) ||
    (failure !== undefined && (
      !isQueueFailure(failure) || !hasOnlyKeys(failure, ["code", "retryable"])
    ))
  ) {
    throw queueError("queue.record_invalid", "The queue record is structurally invalid.");
  }
  return structuredClone(value) as unknown as IngestQueueRecord;
}

function normalizeQueuePolicy(options: CreateIngestQueueOptions): NormalizedQueuePolicy {
  const maxActiveItems = options.maxActiveItems ?? DEFAULT_MAX_ACTIVE_QUEUE_ITEMS;
  const maxActiveBytes = options.maxActiveBytes ?? DEFAULT_MAX_ACTIVE_QUEUE_BYTES;
  const maxQueuedItems = options.maxQueuedItems ?? DEFAULT_MAX_QUEUED_ITEMS;
  if (
    !isPositiveSafeInteger(maxActiveItems) || maxActiveItems > MAX_ACTIVE_QUEUE_ITEMS ||
    !isPositiveSafeInteger(maxActiveBytes) ||
    !isPositiveSafeInteger(maxQueuedItems) || maxQueuedItems > MAX_QUEUED_ITEMS
  ) {
    throw queueError("queue.invalid_options", "Queue resource limits are invalid.");
  }
  return { maxActiveItems, maxActiveBytes, maxQueuedItems };
}

function toItemSnapshot(item: RuntimeQueueItem): IngestQueueItemSnapshot {
  return {
    id: item.record.id,
    sequence: item.record.sequence,
    status: item.record.status,
    uploadedBytes: item.record.uploadedBytes,
    totalBytes: item.record.totalBytes,
    attempt: item.record.attempt,
    hasSource: item.source !== undefined,
    hasResumeRecord: item.record.resumeRecordId !== undefined,
    ...(item.record.failure ? { failure: { ...item.record.failure } } : {}),
    createdAt: item.record.createdAt,
    updatedAt: item.record.updatedAt
  };
}

function emptyCounts(): Record<IngestQueueItemStatus, number> {
  return {
    pending: 0,
    "needs-source": 0,
    running: 0,
    paused: 0,
    failed: 0,
    completed: 0,
    canceled: 0
  };
}

function compareQueueRecords(left: IngestQueueRecord, right: IngestQueueRecord): number {
  return left.sequence - right.sequence || left.id.localeCompare(right.id);
}

function isTerminal(status: IngestQueueItemStatus): boolean {
  return status === "completed" || status === "canceled";
}

function toSafeFailure(error: unknown): IngestQueueFailure {
  const code = errorCode(error);
  return {
    code: code ?? "transport.failed",
    retryable: Boolean(isRecord(error) && error.retryable === true)
  };
}

function errorCode(error: unknown): IngestIssueCode | undefined {
  if (!isRecord(error) || typeof error.code !== "string") {
    return undefined;
  }
  return KNOWN_INGEST_ISSUE_CODES.has(error.code as IngestIssueCode)
    ? error.code as IngestIssueCode
    : undefined;
}

function cloneQueueRecord(record: IngestQueueRecord): IngestQueueRecord {
  return structuredClone(record);
}

function cloneSourceIdentity(identity: IngestQueueSourceIdentity): IngestQueueSourceIdentity {
  return { ...identity };
}

function cloneQueueEvent(event: IngestQueueEvent): IngestQueueEvent {
  try {
    return structuredClone(event);
  } catch {
    return event.type === "queue:store-failed"
      ? { ...event, error: undefined }
      : structuredClone({ ...event });
  }
}

function queueError(code: QueueIssueCode, message: string, retryable = false): IngestQueueError {
  return new IngestQueueError(code, message, retryable);
}

function createQueueItemId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `queue_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isQueueItemStatus(value: unknown): value is IngestQueueItemStatus {
  return value === "pending" || value === "needs-source" || value === "running" ||
    value === "paused" || value === "failed" || value === "completed" || value === "canceled";
}

function isQueueFailure(value: unknown): value is IngestQueueFailure {
  return isRecord(value) &&
    typeof value.code === "string" &&
    KNOWN_INGEST_ISSUE_CODES.has(value.code as IngestIssueCode) &&
    typeof value.retryable === "boolean";
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value > 0;
}

function nowIso(): string {
  return new Date().toISOString();
}
