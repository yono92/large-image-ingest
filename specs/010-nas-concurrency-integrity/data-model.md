# Data Model: NAS Concurrency Integrity

## NAS Session State

The committed `large-image-ingest.nas-session.v0.1` document remains unchanged.

### Existing fields

- `schemaVersion`: fixed session schema identifier.
- `sessionId`: validated session identity and coordination key.
- `status`: `staging`, `finalized`, `canceled`, or `expired`.
- `createdAt`, `updatedAt`, optional `expiresAt`, `finalizedAt`, `canceledAt`.
- `targetRelativePath`: validated path below the configured target root.
- `totalBytes`, `expectedChunks`: completion constraints.
- `metadata`: caller-owned untrusted metadata.
- `chunks`: records keyed by chunk index with path, size, staging time, and optional checksum.

### Invariants

- `metadata.json` is the only committed session document.
- Readers observe either the previous complete document or the next complete document.
- Each recorded chunk points to the bytes committed by the same serialized mutation.
- At most one record exists for each chunk index.
- Terminal sessions reject later staging mutations.
- The schema version and JSON shape do not change in 1.3.1.

## Session Mutation

A session mutation is identified by `sessionId` and ordered through the existing shared lock scope.

### Kinds

- Stage a chunk.
- Finalize the target.
- Cancel and remove staging state.
- Remove an expired or canceled session during cleanup.

### Ordering rules

- Mutations for different session IDs may proceed concurrently.
- Stage and cancel wait for a contended session lock within the internal bound.
- Finalize retains fail-fast contention behavior.
- Cleanup skips a session whose lock is held.
- The lock is released after the primary operation completes or fails.

## Committed Metadata

`metadata.json` represents the last successful metadata promotion.

### State transitions

```text
absent -> staging
staging -> staging        chunk committed or replaced
staging -> finalized      complete verified target promoted
staging -> canceled       cancellation committed before directory removal
staging -> expired        recognized by cleanup policy
```

No transition leaves a partially serialized committed document.

## Temporary Metadata Artifact

A temporary artifact is an uncommitted complete candidate stored beside `metadata.json`.

### Identity and lifecycle

- Filename uses a fixed private prefix plus a collision-resistant identifier.
- Created only while holding the session lock.
- Promoted by same-directory rename.
- Removed after failure when the process remains alive.
- Abandoned candidates are removed by a later lock holder.
- Never parsed as committed session state.

## Session Coordination Artifact

The existing lock directory and `large-image-ingest.nas-lock.v0.1` owner metadata remain unchanged.

### Invariants

- The exported lock scope remains the literal `"finalize"` for compatibility.
- The default provider uses a shared lock root below the staging root.
- Only the recorded owner may remove its live lock.
- Existing stale-lock replacement behavior remains authoritative.
