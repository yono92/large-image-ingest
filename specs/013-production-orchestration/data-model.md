# Data Model: Production Orchestration

## Queue Source Identity

- `name`: untrusted filename used only for local source reattachment comparison.
- `size`: source byte count.
- `type`: MIME declaration.
- `lastModified`: source timestamp when present.

## Durable Queue Record v0.1

- `schemaVersion`: `large-image-ingest.queue.v0.1`.
- `id`: stable application-visible item ID.
- `sequence`: non-negative durable FIFO order.
- `status`: pending, needs-source, running, paused, failed, completed, or canceled.
- `source`: metadata identity only.
- `uploadedBytes`, `totalBytes`: operational progress.
- `attempt`: count of session admissions.
- `resumeRecordId`: optional reference into the separately configured session resume store.
- `failure`: optional typed code/retryability; never a raw error/message.
- `createdAt`, `updatedAt`: ISO timestamps.

## Runtime Queue Item

Extends the durable record internally with an optional in-memory source reference and active session. Neither is exposed in durable records or safe diagnostics.

## Queue Snapshot

- queue state: idle, running, paused, or drained.
- aggregate counts by item state.
- `activeItems`, `activeBytes`, `uploadedBytes`, `totalBytes`.
- ordered detached item snapshots with IDs, state, progress, attempt, resume presence, safe failure, and timestamps.

## State Transitions

```text
enqueue -> pending
restore without source -> needs-source
needs-source + attach -> pending|paused|failed (recoverable origin normalized for scheduling)
pending|paused|failed -> running
running -> completed|paused|failed|canceled
pending|needs-source|paused|failed -> canceled
completed|canceled -> removed
```

Unsupported transitions fail with `queue.invalid_transition`.
