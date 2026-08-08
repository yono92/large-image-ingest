import type {
  IngestIssueCode,
  IngestQueueEvent,
  IngestQueueItemSnapshot,
  IngestQueueItemStatus,
  IngestQueueRecord,
  IngestQueueSnapshot,
  IngestQueueStatus
} from "./types.js";

export interface SafeQueueItemSummary {
  id: string;
  sequence: number;
  status: IngestQueueItemStatus;
  uploadedBytes: number;
  totalBytes: number;
  attempt: number;
  hasSource: boolean;
  hasResumeRecord: boolean;
  failure?: { code: IngestIssueCode; retryable: boolean } | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface SafeQueueSnapshotSummary {
  status: IngestQueueStatus;
  counts: Record<IngestQueueItemStatus, number>;
  activeItems: number;
  activeBytes: number;
  uploadedBytes: number;
  totalBytes: number;
  items: SafeQueueItemSummary[];
  updatedAt: string;
}

export interface SafeQueueEventSummary {
  type: IngestQueueEvent["type"];
  item?: SafeQueueItemSummary | undefined;
  itemId?: string | undefined;
  operation?: "put" | "delete" | "list" | undefined;
  error?: { code: "queue.store_failed"; retryable: true } | undefined;
  snapshot?: SafeQueueSnapshotSummary | undefined;
  redactions?: { fields: readonly string[] } | undefined;
}

export function createSafeQueueSnapshotSummary(
  snapshot: IngestQueueSnapshot
): SafeQueueSnapshotSummary {
  return {
    status: snapshot.status,
    counts: { ...snapshot.counts },
    activeItems: snapshot.activeItems,
    activeBytes: snapshot.activeBytes,
    uploadedBytes: snapshot.uploadedBytes,
    totalBytes: snapshot.totalBytes,
    items: snapshot.items.map(cloneSafeItem),
    updatedAt: snapshot.updatedAt
  };
}

export function createSafeQueueEventSummary(event: IngestQueueEvent): SafeQueueEventSummary {
  if ("item" in event) {
    return { type: event.type, item: cloneSafeItem(event.item) };
  }
  if (event.type === "item:removed") {
    return { type: event.type, itemId: event.itemId };
  }
  if (event.type === "queue:paused" || event.type === "queue:drained") {
    return { type: event.type, snapshot: createSafeQueueSnapshotSummary(event.snapshot) };
  }
  return {
    type: event.type,
    ...(event.itemId ? { itemId: event.itemId } : {}),
    operation: event.operation,
    error: { code: "queue.store_failed", retryable: true },
    redactions: { fields: ["queue.error"] }
  };
}

export function redactIngestQueueRecord(record: IngestQueueRecord): SafeQueueItemSummary & {
  redactions: { fields: readonly string[] };
} {
  return {
    id: record.id,
    sequence: record.sequence,
    status: record.status,
    uploadedBytes: record.uploadedBytes,
    totalBytes: record.totalBytes,
    attempt: record.attempt,
    hasSource: false,
    hasResumeRecord: record.resumeRecordId !== undefined,
    ...(record.failure ? { failure: { ...record.failure } } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    redactions: {
      fields: [
        "queue.source",
        ...(record.resumeRecordId ? ["queue.resumeRecordId"] : [])
      ]
    }
  };
}

function cloneSafeItem(item: IngestQueueItemSnapshot): SafeQueueItemSummary {
  return {
    ...item,
    ...(item.failure ? { failure: { ...item.failure } } : {})
  };
}
