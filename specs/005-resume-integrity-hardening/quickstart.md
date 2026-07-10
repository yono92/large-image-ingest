# Validation Guide: Resume Integrity Hardening

## Prerequisites

```bash
npm ci
```

No cloud credentials or network services are required for default validation.

## Persistent Multipart Recovery

1. Start an S3-compatible multipart session using the local fake broker and fetch implementation.
2. Acknowledge at least one part and force a later part to fail.
3. Read the generated v0.2 record and confirm the acknowledged part number and ETag are persisted.
4. Create a new ingest session with no in-memory snapshot.
5. Resume by record ID.
6. Confirm acknowledged parts are skipped and completion receives all old and new receipts in order.

Expected result: the new session completes the original multipart upload without recreating the session or re-uploading acknowledged parts.

## Invalid And Legacy Records

Validate fixtures for malformed JSON, unsupported schemas, invalid ranges, duplicate receipts, out-of-range receipts, wrong sizes, transport mismatches, and inconsistent uploaded byte totals.

Expected result: every fixture produces a typed resume conflict before `resumeSession`, `uploadChunk`, or `completeSession` changes remote state.

Validate a progressed v0.1 S3 record.

Expected result: resume stops with `resume.receipt_missing`; no ETag or part number is fabricated.

Validate a v0.1 tus record and a zero-progress v0.1 S3 record.

Expected result: existing safe legacy recovery behavior remains available after remote validation.

## Sensitive State

Create a v0.2 record containing transport tokens, ETags, locations, opaque receipt fields, and manifest metadata. Produce default events and diagnostic summaries.

Expected result: stable IDs, progress, and typed codes remain; sensitive values do not appear.

## Required Checks

```bash
npm run typecheck
npm run typecheck:examples
npm test
npm run build
npm pack --dry-run
```

All commands must pass before the 1.2.0 release work is considered complete.
