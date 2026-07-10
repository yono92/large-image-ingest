# Public Contract: Resume Integrity Hardening

This draft describes additive 1.2.0 contract changes. Exact helper names may be adjusted during implementation, but behavior and compatibility rules must remain stable.

## Versioned Resume Records

```ts
export type ResumeRecordSchemaVersion =
  | "large-image-ingest.resume.v0.1"
  | "large-image-ingest.resume.v0.2";

export interface ResumeRecordV0_1 extends ResumeRecordBase {
  schemaVersion: "large-image-ingest.resume.v0.1";
}

export interface ResumeRecordV0_2 extends ResumeRecordBase {
  schemaVersion: "large-image-ingest.resume.v0.2";
  receipts: UploadChunkReceipt[];
}

export type ResumeRecord = ResumeRecordV0_1 | ResumeRecordV0_2;
```

Behavior:

- `createResumeRecord` creates v0.2 records with an empty receipt list.
- Each acknowledged chunk checkpoint writes its validated receipt and matching progress atomically from the store contract's perspective.
- The manifest identity and creation timestamp remain stable across resume.
- v0.1 remains a recognized legacy input, not the output of new record creation.

## Record Parsing

```ts
export function parseResumeRecord(value: unknown): ResumeRecord;
export function validateResumeRecord(value: unknown): ResumeRecordValidationResult;
```

Behavior:

- Parsing performs bounded structural validation and returns a detached normalized value.
- Validation never logs or embeds the rejected raw record in errors.
- `WebStorageResumeStore.get` and `list` parse stored JSON through the same contract.
- `LargeImageIngestSession.resume` validates records returned by any custom store before transport calls or range hydration.

## Resume Conflicts

```ts
export type ResumeConflictCode =
  | ExistingResumeConflictCode
  | "resume.record_invalid"
  | "resume.receipt_missing"
  | "resume.receipt_invalid";
```

Behavior:

- Invalid JSON or structural state produces `resume.record_invalid`.
- Missing provider evidence required for safe recovery produces `resume.receipt_missing`.
- Contradictory, duplicated, out-of-range, or malformed receipt evidence produces `resume.receipt_invalid`.
- Conflicts occur before a resumed transport mutates remote state.

## Transport Capabilities

```ts
export interface TransportCapabilities {
  // Existing fields remain unchanged.
  supportsSnapshotResume?: boolean;
  supportsPersistentResume?: boolean;
}
```

Behavior:

- Existing `resumable` remains the aggregate backward-compatible flag.
- Explicit `false` prevents the corresponding resume path before transport mutation.
- Omitted granular fields preserve existing hook-based behavior for custom transports.
- Official S3 and tus adapters advertise both values explicitly.

## S3 Persistent Resume

Behavior:

- S3 restores multipart bucket/key/session state from the persistent transport state.
- S3 uses persisted v0.2 receipts as the authoritative completed-part list.
- A progressed v0.1 S3 record is rejected because it has no authoritative ETags.
- A zero-progress legacy record may resume when its multipart session state is otherwise valid.
- Completion receives persisted and newly acknowledged parts in consecutive part-number order.

## Redaction

Behavior:

- Full v0.2 records remain caller-controlled sensitive persistence objects.
- Default events continue to expose record IDs, range summaries, and typed conflicts only.
- Safe summaries and redacted record helpers omit ETags, locations, opaque evidence, tokens, full manifests, and customer metadata values.
