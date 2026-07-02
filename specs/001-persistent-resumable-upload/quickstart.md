# Quickstart: Persistent Resumable Upload Validation

This guide describes the validation flow for the feature. It is not an implementation guide.

## Prerequisites

- Dependencies installed with `npm ci`.
- Existing package scripts available:
  - `npm run typecheck`
  - `npm test`
  - `npm run build`

## Scenario 1: Resume After Interruption

1. Create a synthetic multi-chunk `File` or `Blob` fixture.
2. Configure a fake transport that records uploaded chunk indexes and supports remote resume validation.
3. Configure a durable fake resume store.
4. Start an ingest session and allow two chunks to complete.
5. Stop the session before completion.
6. Create a new ingest session with the same file and the same resume store.
7. Resume using the stored record ID.

Expected outcome:

- The resumed session does not upload completed chunks again.
- Upload continues at the first incomplete chunk.
- The final manifest identity matches the stored resume record.
- The completed record is deleted by default.

## Scenario 2: Checkpoint Safety

1. Configure a fake transport that throws before acknowledging a target chunk.
2. Start an ingest session with resume persistence enabled.
3. Let the failing chunk attempt run.
4. Read the stored resume record.

Expected outcome:

- The failed chunk is not included in completed chunk ranges.
- `nextChunkIndex` still points to the failed chunk.
- The failure is visible through typed session output.

## Scenario 3: Conflict Before Upload

1. Seed a resume store with a valid record.
2. Try to resume with a different file.
3. Try to resume with the same file but a different chunk size.
4. Try to resume with a transport that lacks remote resume validation.

Expected outcome:

- Each resume attempt fails before upload bytes are sent.
- Each failure has a resume-specific conflict code.
- Transient retry events are not emitted for these conflicts.

## Scenario 4: Pause And Cancel

1. Start an ingest session with resume persistence enabled.
2. Request pause while a chunk is active.
3. Verify the stored record becomes recoverable after the in-flight chunk settles.
4. Resume or start another session and request cancel.

Expected outcome:

- Paused records are offered for recovery by default.
- Canceled records are not offered for recovery by default.
- Sensitive transport state is not printed through default logs.

## Required Checks

Run these before considering implementation complete:

```bash
npm run typecheck
npm test
npm run build
```

Expected outcome:

- TypeScript succeeds without emit errors.
- Unit tests cover resume record helpers, store adapter, session resume flow, conflict handling, pause/cancel behavior, and existing manifest/validation/chunk behavior.
- Build emits package output successfully.
