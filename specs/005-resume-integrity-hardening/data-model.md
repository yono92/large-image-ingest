# Data Model: Resume Integrity Hardening

## ResumeRecordV0_1

Recognized legacy operational state created by releases through 1.1.x.

Fields remain the existing v0.1 fields: manifest, file identity, chunking identity, transport state, progress, and timestamps.

Validation rules:

- All common record fields must pass structural validation before use.
- Completed ranges must be bounded, normalized, and consistent with progress.
- The record has no durable receipt collection and must never be upgraded by inventing receipt fields.
- A transport may accept the record only when its remote validation and completion semantics do not require missing provider evidence.

## ResumeRecordV0_2

Current operational state for one recoverable session.

Fields:

- `schemaVersion`: `large-image-ingest.resume.v0.2`.
- `id`: stable record identifier.
- `manifest`: unchanged ingest manifest snapshot.
- `file`: existing metadata-based source identity.
- `chunking`: fixed-size chunk plan identity.
- `transport`: provider-neutral remote recovery state.
- `receipts`: ordered durable chunk receipts.
- `progress`: lifecycle and compact range summary.
- `createdAt`, `updatedAt`: ISO timestamps.

Validation rules:

- Receipt indexes are unique safe integers within the chunk plan.
- Receipt sizes equal the planned size for their chunk.
- Receipt transport names match the active transport when a name is known.
- Receipt order is normalized by chunk index before persistence and completion.
- Completed ranges describe exactly the same chunk indexes as receipts.
- Uploaded bytes equal the sum of receipt sizes.
- Next chunk index equals the first chunk without a receipt.
- Original bytes, derivative bytes, credentials, and presigned part URLs are never stored as receipts.

## Durable Chunk Receipt

Existing `UploadChunkReceipt` promoted to persisted recovery evidence.

Generic fields:

- chunk index, byte size, completion timestamp
- optional chunk checksum
- transport name
- optional transport-owned part number, ETag, offset, location, or opaque evidence

Provider rules:

- S3 requires consecutive part numbers and non-empty ETags for all completed parts.
- tus validates remote offset and does not require ETags.
- Custom transports validate their own opaque completion evidence in `resumeSession` or `completeSession`.

## Resume Progress

State transitions remain unchanged:

```text
active -> paused | failed | completed | canceled
paused -> active | canceled | expired
failed -> active | canceled | expired
completed | canceled | expired -> terminal
```

Additional invariants for v0.2:

- Checkpoint state is written only after a receipt passes validation.
- Receipt update and derived progress are written as one record value.
- Failed chunks never add or replace a successful receipt.

## Resume Record Validation Result

Typed outcome produced before a record affects session control flow.

New conflict codes:

- `resume.record_invalid`: persisted structure or invariant is invalid.
- `resume.receipt_missing`: required durable recovery evidence is absent.
- `resume.receipt_invalid`: persisted receipt evidence is malformed or inconsistent.

Existing schema, file, chunking, transport, expiration, and store conflict codes remain supported.

## Transport Capabilities

The existing aggregate `resumable` flag remains. Optional granular fields add:

- `supportsSnapshotResume`: caller-managed full snapshot recovery is supported.
- `supportsPersistentResume`: versioned record recovery after restart is supported.

Official S3 and tus transports advertise both as true after this feature. Existing custom transports that omit the new fields retain hook-based compatibility behavior.
