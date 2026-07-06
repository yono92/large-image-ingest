# Implementation Plan: Node Verification & Integrity

## Architecture

Add verification in two layers:

1. Core verification helpers for manifest and upload receipt consistency.
2. Node-only checksum and stored-file verification helpers exported from `large-image-ingest/node`.

The core layer stays browser-safe and provider-agnostic. It can work with `Blob`-compatible file objects because the existing checksum helper already slices file-like objects. The Node layer owns filesystem streaming and NAS-friendly stored-file checks.

## Package Layout

Keep the single-package layout and extend existing subpaths:

```text
large-image-ingest/core   -> manifest, receipt, and file-like verification
large-image-ingest/node   -> NAS gateway plus Node file checksum/verification helpers
```

`large-image-ingest/node` should become a Node API barrel instead of pointing directly to `nas.ts`. It should re-export NAS gateway APIs and add Node verification helpers. The root export remains browser-safe and should not import `node:fs` or `node:crypto`.

## Core Verification Plan

- Add `VerificationIssueCode`, `VerificationResult`, and verification option types.
- Add `verifyManifest(manifest, options)`.
- Add `verifyUploadReceipts(manifest, receipts, options)`.
- Add `verifyIngestIntegrity(options)` to combine manifest, optional file-like checksum, and optional receipt verification in one report.
- Reuse existing `calculateChecksum` and `planChunks` instead of duplicating hashing or chunk sizing logic.
- Use `IngestIssue` shape for typed verification issues so application UI can display them consistently.
- Keep sensitive values out of `details`; include only counts, sizes, chunk indexes, algorithms, and expected/actual checksum values.

## Node Verification Plan

- Add `calculateNodeFileChecksum(filePath, options)` using `node:fs` streams and `node:crypto`.
- Add `verifyNodeFileManifest(filePath, manifest, options)` for stored files.
- Check that the target exists and is a file before checksum verification.
- Compare file size before hashing so obvious mismatches fail cheaply.
- Support `checksum: "required" | "when-present" | false`, defaulting to `"when-present"`.
- Reuse core verification issue codes and result shape.

## Error Model

Typed verification issue codes:

- `verification.manifest_schema_unsupported`
- `verification.manifest_invalid`
- `verification.original_mismatch`
- `verification.checksum_missing`
- `verification.checksum_unsupported`
- `verification.checksum_mismatch`
- `verification.receipt_missing`
- `verification.receipt_duplicate`
- `verification.receipt_invalid`
- `verification.receipt_incomplete`
- `verification.transport_mismatch`
- `verification.file_not_found`
- `verification.file_unreadable`

Verification helpers should return reports rather than throwing for expected verification failures. They may throw only for programmer errors such as unsupported option values.

## Constitution Check

- Original preservation: verification reads only and never mutates source files.
- Recoverability: receipt verification supports complete and partial checks for resumable workflows.
- Adapter boundaries: core verification is provider-agnostic; Node filesystem helpers are isolated behind `large-image-ingest/node`.
- TypeScript contracts: public result and issue code types are exported from core and Node subpaths.
- Sensitive data: reports avoid presigned URLs, credentials, raw metadata, and full manifest echoes.
- Tests: focused unit tests cover manifest, receipt, and Node file verification with local fakes/temp files.

## Verification

Run:

```bash
npm run typecheck
npm run typecheck:examples
npm test
npm run build
```
