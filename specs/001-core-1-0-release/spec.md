# Feature Specification: Core 1.0 Release

## Status

Released as `v1.0.0`. Formal Spec Kit artifacts now exist in `.specify/`; this release spec records the finalized 1.0 core package contract for regression checks and future compatibility work.

## Goal

Ship `large-image-ingest` as a stable 1.0 core SDK for browser and Node-compatible JavaScript runtimes that need to ingest very large inspection images while preserving the original file and producing verifiable upload manifests.

## User Stories

1. As a frontend engineer, I can validate file size, MIME type, extension, required metadata, optional image dimensions, and expected checksum before upload finalization.
2. As a platform engineer, I can receive a versioned v1 manifest containing original identity, preservation policy, checksum data, chunking summary, upload session details, storage hints, validation results, and derivative placeholders.
3. As an application developer, I can plug in a custom transport adapter without coupling `large-image-ingest/core` to S3, tus, NAS, React, or any cloud provider.
4. As a UI developer, I can observe explicit session statuses and typed events for validation, upload progress, retry, pause, resume, completion, failure, and cancellation.
5. As an application developer, I can persist resume records or redacted session snapshots and resume later through a transport that validates remote resume state.
6. As a JavaScript consumer, I can use either ESM `import` or CommonJS `require` from the published npm package.

## Functional Requirements

- The package MUST preserve the original file by default and MUST NOT decode, resize, recompress, strip EXIF, or mutate the source artifact.
- The core MUST use `Blob.slice` for chunk bodies and checksum reads.
- The core MUST expose standalone helpers for validation, chunk planning, checksum calculation, manifest creation, and session creation.
- The manifest schema version MUST be `large-image-ingest.manifest.v1`.
- The manifest MUST include a SHA-256 checksum for the original file by default.
- The checksum helper MUST process the file in bounded chunks and MUST NOT require loading the full file into memory at once.
- Validation MUST return stable typed issue codes and MUST support required metadata keys.
- Dimension validation MUST be supported when callers provide image metadata; if dimension rules are configured without image metadata, validation MUST report that dimensions are unavailable.
- Upload sessions MUST expose an explicit status model: `idle`, `validating`, `creating`, `uploading`, `paused`, `resuming`, `completing`, `completed`, `failed`, and `canceled`.
- Upload sessions MUST support pause, cancel, and persistent resume through explicit lifecycle methods and typed events.
- Upload sessions MUST provide serializable, redacted snapshots containing manifest ID, transport session data when safe, chunk plan, completed chunk receipts, uploaded bytes, status, timestamps, and safe error summaries.
- Persistent resume MUST use versioned resume records that preserve manifest identity, file identity, chunking identity, transport state, progress, and lifecycle status.
- Transport adapters MUST validate or refresh remote resume state before local completed chunks are skipped.
- Transport adapters MUST return durable chunk receipts, and the core MUST validate receipt chunk index and size before checkpointing progress.
- Retry behavior MUST remain configurable and MUST emit typed retry events.
- Public errors thrown by the core MUST use typed error codes.
- The core module MUST keep runtime dependencies empty.
- The npm package MUST publish ESM, CommonJS, and TypeScript declarations for the root entrypoint and supported subpath exports.
- The npm package MUST expose `large-image-ingest/core`, `large-image-ingest/transport-tus`, `large-image-ingest/transport-s3`, and `large-image-ingest/node`.

## Non-Goals

- Protocol-specific implementation inside the core module.
- Browser-direct NAS, SMB, NFS, WebDAV, SFTP, or filesystem writes.
- React hooks or UI components.
- Thumbnail, preview, or tile generation.
- Image decoding from binary formats.
- Parallel chunk upload.
- Cloud or NAS integration tests in the default test suite.

## Acceptance Criteria

- `npm run typecheck`, `npm test`, `npm run build`, and `npm pack --dry-run` pass.
- ESM and CommonJS package consumption both work from the package entrypoint.
- Manifest creation produces `large-image-ingest.manifest.v1`.
- Manifest creation includes a SHA-256 checksum for the original file.
- Validation failures are embedded in `manifest.validation` and prevent upload from starting.
- Required metadata validation reports missing keys.
- Dimension validation reports unavailable dimensions when configured without provided image metadata.
- Chunk ranges are deterministic.
- Session events expose lifecycle progress, checkpoints, pause, cancellation, completion, and failure.
- Pause leaves a recoverable record after the current chunk settles.
- A recoverable resume record can resume without re-uploading completed chunks when the transport validates the remote session.
- Cancel prevents the record from being offered for default recovery.
- README examples match the public API.

## Release Criteria

- `package.json` version is `1.0.0`.
- `CHANGELOG.md` includes the 1.0.0 release notes.
- CI includes package dry-run verification.
- Security policy no longer describes the project as pre-1.0.
