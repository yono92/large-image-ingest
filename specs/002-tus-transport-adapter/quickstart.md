# Quickstart: TUS Transport Adapter Validation

This guide describes validation scenarios for the feature. It is not an implementation guide.

## Prerequisites

- Dependencies installed with `npm ci`.
- Existing package scripts available:
  - `npm run typecheck`
  - `npm test`
  - `npm run build`

## Scenario 1: Fresh TUS Upload

1. Create a synthetic multi-chunk image file.
2. Configure a local protocol simulator that supports upload creation, offset inspection, chunk acceptance, and completion.
3. Create a TUS transport with safe metadata mapping.
4. Start an ingest session with the transport and a resume store.

Expected outcome:

- A remote upload resource is created.
- Each planned chunk is accepted in order.
- Progress events are emitted through the existing session event model.
- The final manifest still represents the unmodified original file.

## Scenario 2: Resume With Matching Remote Offset

1. Start a synthetic upload with persistent resume enabled.
2. Stop after multiple chunks are accepted and checkpointed.
3. Create a new ingest session with the same file, same resume store, and same transport configuration.
4. Resume using the stored record ID.

Expected outcome:

- The adapter validates the remote offset before skipped chunks continue.
- This applies to both redacted snapshot resume and persistent `resume(recordId)` records.
- Already completed chunks are not uploaded again.
- Upload continues from the first incomplete chunk.
- Completion cleanup follows the existing resume policy.

## Scenario 3: Remote Offset Conflict

1. Seed a recoverable record whose local checkpoint implies a specific byte offset.
2. Configure the simulator to report a lower or higher remote offset.
3. Attempt resume.

Expected outcome:

- Resume fails before sending additional upload bytes.
- The failure uses a typed TUS transport conflict.
- Sensitive upload URLs or headers are not included in events or errors.

## Scenario 4: Remote Session Missing Or Expired

1. Seed a recoverable record with remote resume state.
2. Configure the simulator to report a missing or expired upload resource.
3. Attempt resume.

Expected outcome:

- Resume fails before upload.
- The record is not offered as safely recoverable without user or application intervention.
- The application receives a typed failure suitable for recovery UI.

## Scenario 5: Retryable Chunk Failure

1. Configure the simulator to fail one chunk transiently before acknowledgement.
2. Start upload with retry enabled.
3. Let the retry path complete.

Expected outcome:

- The failed attempt does not advance the persistent checkpoint.
- The retried successful attempt advances the checkpoint once.
- Retry outcomes remain distinguishable from persistent resume conflicts.

## Required Checks

Run these before considering implementation complete:

```bash
npm run typecheck
npm test
npm run build
```

Expected outcome:

- TypeScript succeeds for both ESM and CJS outputs.
- Unit tests cover fresh upload, resume validation, offset conflicts, missing/expired remote sessions, retryable failures, and sensitive-data redaction.
- Build emits package output successfully.
