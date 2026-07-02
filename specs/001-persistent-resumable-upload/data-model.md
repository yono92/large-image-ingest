# Data Model: Persistent Resumable Upload

## ResumeRecord

Versioned operational state for one recoverable ingest session.

Fields:

- `schemaVersion`: literal resume record schema version.
- `id`: stable resume record identifier.
- `manifest`: local manifest snapshot used to preserve ingest identity.
- `file`: `ResumeFileIdentity`.
- `chunking`: `ResumeChunkingIdentity`.
- `transport`: `ResumeTransportState`.
- `progress`: `ResumeProgress`.
- `createdAt`: ISO timestamp.
- `updatedAt`: ISO timestamp.

Validation rules:

- `schemaVersion` must be supported before resume.
- `manifest.id` must remain stable across fresh start and resume.
- Resume records must not contain original file bytes or derivative bytes.
- Sensitive transport fields must not be emitted through default logs.

## ResumeFileIdentity

Observable file attributes used to match a user-selected file to a stored record.

Fields:

- `name`: original file name.
- `sizeBytes`: original file size.
- `mediaType`: MIME type from the file object.
- `lastModified`: optional last modified timestamp.
- `fingerprint`: existing metadata fingerprint.

Validation rules:

- Size and fingerprint must match before resume.
- Media type and name must match unless a later spec defines a safe normalization rule.
- Last modified must match when both sides provide it.

## ResumeChunkingIdentity

Chunk plan identity used to prevent skipping the wrong byte ranges.

Fields:

- `strategy`: `fixed-size`.
- `chunkSizeBytes`: configured chunk size.
- `totalBytes`: original file size.
- `totalChunks`: planned chunk count.

Validation rules:

- Chunk strategy, size, total bytes, and total chunks must match before resume.
- Mismatch produces `resume.chunking_mismatch` before transport upload.

## CompletedChunkRange

Compact representation of completed chunks.

Fields:

- `startIndex`: first completed chunk index.
- `endIndexInclusive`: last completed chunk index in the range.

Validation rules:

- `startIndex` must be less than or equal to `endIndexInclusive`.
- Ranges must not overlap after merge.
- Ranges must stay within `0..totalChunks - 1`.

## ResumeProgress

Progress and lifecycle state for a recoverable record.

Fields:

- `status`: `active`, `paused`, `failed`, `completed`, `canceled`, or `expired`.
- `uploadedBytes`: total confirmed bytes.
- `completedChunkRanges`: compact completed range set.
- `nextChunkIndex`: first incomplete chunk for sequential resume.
- `lastErrorCode`: optional typed error code for failed records.

State transitions:

```text
active -> paused
active -> failed
active -> completed
active -> canceled
paused -> active
paused -> canceled
failed -> active
failed -> canceled
active|paused|failed -> expired
completed -> terminal
canceled -> terminal
expired -> terminal for default recovery
```

## ResumeTransportState

Provider-neutral holder for remote upload recovery information.

Fields:

- `name`: optional transport name.
- `uploadId`: stable remote upload identifier.
- `resumeToken`: optional sensitive resume handle.
- `expiresAt`: optional ISO expiration timestamp.
- `data`: optional adapter-owned metadata.

Validation rules:

- Transport state must be validated or refreshed by the active transport before the core skips completed chunks.
- Expired state produces `resume.expired` before upload.
- Unsupported transport resume produces `resume.transport_unsupported` before upload.

## ResumeConflict

Typed failure that prevents a resumed upload from sending bytes.

Codes:

- `resume.record_not_found`
- `resume.schema_unsupported`
- `resume.file_mismatch`
- `resume.chunking_mismatch`
- `resume.transport_unsupported`
- `resume.transport_mismatch`
- `resume.expired`
- `resume.store_failed`

Validation rules:

- Conflicts are distinct from transient retry and ordinary transport failures.
- Conflicts must be observable through typed events, typed state, or typed errors.
