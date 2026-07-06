# Feature Specification: Node Verification & Integrity

## Status

Draft. This feature adds the first verification layer after official transports and NAS gateway support.

## Goal

Allow application and platform teams to prove that an uploaded original inspection image still matches its manifest, chunk receipts, and stored server-side file before treating the upload as a source-of-truth artifact.

## Background

The SDK can now create manifests, upload chunks through custom, tus, S3 multipart, and NAS gateway paths, and capture receipt-aware upload session state. The next gap is verification after completion. A successful transport completion is not enough for inspection workflows unless the stored bytes, manifest identity, and receipt set can be checked independently.

Verification must stay adapter-based and safe by default:

- Browser/core verification can validate manifests, chunk plans, and receipt completeness.
- Node verification can calculate whole-file checksums from stored files or streams.
- Transport-specific remote reads and real storage credentials remain application-owned or opt-in integration work.

## User Stories

1. As a server-side ingestion service, I can verify that a finalized file matches the manifest size and checksum before marking the upload complete in my application database.
2. As a platform engineer, I can verify that all chunk receipts required for completion are present, unique, ordered by chunk index, and size-consistent.
3. As a security reviewer, I can receive typed verification failure codes without exposing presigned URLs, credentials, raw customer metadata, or full manifests in default errors.
4. As an application developer, I can use verification helpers with tus, S3, NAS, or custom transports without importing provider SDKs into core.

## Functional Requirements

- The SDK must expose a public verification result type with `ok` and typed issues.
- The SDK must expose manifest verification that checks schema version, original preservation rules, chunking consistency, and existing validation state.
- Manifest verification must optionally compare a provided file-like object against manifest identity fields such as name, size, media type, last-modified timestamp, and checksum.
- Checksum verification must support SHA-256 whole-file checksums and must report missing, mismatched, or unsupported checksum algorithms with typed codes.
- Receipt verification must check that each expected chunk has exactly one successful receipt when complete verification is requested.
- Receipt verification must reject duplicate, out-of-range, wrong-size, or transport-mismatched receipts.
- Receipt verification must support partial receipt checks for resumable workflows without requiring every chunk to be complete.
- Node helpers must calculate SHA-256 checksums from files using streaming I/O instead of reading entire files into memory.
- Node helpers must verify a stored file against a manifest without mutating the file.
- Verification errors and reports must not include credentials, presigned URLs, raw customer metadata, or full manifests by default.
- Default tests must use synthetic files and temporary directories only.

## Non-Goals

- Fetching remote S3, tus, WebDAV, SMB, NFS, or NAS objects from real services.
- Requiring whole-file checksum generation for every browser upload.
- Image decoding, preview generation, thumbnailing, or tile generation.
- Provider-specific audit APIs such as S3 `ListParts` or tus server metadata inspection.
- React UI for displaying verification reports.

## Acceptance Criteria

- A caller can verify a manifest and receive typed issues for schema, validation, chunking, preservation, size, media type, and checksum problems.
- A caller can verify upload receipts and receive typed issues for missing, duplicate, invalid, incomplete, and transport-mismatched receipts.
- A Node caller can calculate a SHA-256 checksum for a stored file through the `large-image-ingest/node` subpath.
- A Node caller can verify a stored file against a manifest without loading the whole file into memory.
- The package exports verification helpers from stable subpaths and keeps Node-only helpers out of the browser-safe root export.
- Unit tests cover success and failure cases without real network or storage credentials.
