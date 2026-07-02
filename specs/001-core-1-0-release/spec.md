# Feature Specification: Core 1.0 Release

## Status

Implemented release candidate. Spec Kit CLI initialization was attempted first, but the `specify` command is not installed in this environment. This artifact follows the project SDD structure until formal `.specify/` artifacts can be generated.

## Goal

Ship `large-image-ingest` as a stable 1.0 core SDK for browser and Node-compatible JavaScript runtimes that need to ingest very large inspection images while preserving the original file and producing verifiable upload manifests.

## User Stories

1. As a frontend engineer, I can validate file size, MIME type, extension, required metadata, optional image dimensions, and expected checksum before upload finalization.
2. As a platform engineer, I can receive a versioned v1 manifest containing original identity, preservation policy, checksum data, chunking summary, upload session details, storage hints, validation results, and derivative placeholders.
3. As an application developer, I can plug in a transport adapter without coupling the core package to S3, tus, NAS, React, or any cloud provider.
4. As a UI developer, I can observe explicit session states and typed events for validation, checksum progress, upload progress, retry, pause, resume, completion, failure, and abort.
5. As an application developer, I can pause an upload between chunks, persist a session snapshot, and resume later through the same transport contract.
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
- Upload sessions MUST expose an explicit state model: `idle`, `validating`, `ready`, `uploading`, `paused`, `completed`, `failed`, and `aborted`.
- Upload sessions MUST support pause and resume between chunks.
- Upload sessions MUST provide a serializable snapshot containing manifest, upload ID when established, uploaded chunks, uploaded bytes, next chunk index, state, and timestamps.
- A new session MUST be able to resume from a compatible snapshot.
- Transport adapters MUST be able to skip already-uploaded chunks when resuming by implementing an optional `shouldUploadChunk` hook.
- Retry behavior MUST remain configurable and MUST emit typed retry events.
- Public errors thrown by the core MUST use typed error codes.
- The package MUST keep runtime dependencies empty for the 1.0 core.
- The npm package MUST publish ESM, CommonJS, and TypeScript declarations.

## Non-Goals

- Built-in S3 multipart upload implementation.
- Built-in tus upload implementation.
- Built-in NAS, SMB, NFS, WebDAV, SFTP, or filesystem upload implementation.
- React hooks or UI components.
- Thumbnail, preview, or tile generation.
- Image decoding from binary formats.
- Parallel chunk upload.
- Persistent browser storage such as IndexedDB.

## Acceptance Criteria

- `npm run typecheck`, `npm test`, `npm run build`, and `npm pack --dry-run` pass.
- ESM and CommonJS package consumption both work from the package entrypoint.
- Manifest creation produces `large-image-ingest.manifest.v1`.
- Manifest creation includes a SHA-256 checksum for the original file.
- Validation failures are embedded in `manifest.validation` and prevent upload from starting.
- Required metadata validation reports missing keys.
- Dimension validation reports unavailable dimensions when configured without provided image metadata.
- Chunk ranges are deterministic.
- Session events expose state transitions and progress.
- Pause prevents the next chunk from starting until resume is called.
- A snapshot from a paused or interrupted session can resume without re-uploading completed chunks when the transport supports chunk skipping.
- Abort emits an aborted event and throws a typed aborted error.
- README examples match the public API.

## Release Criteria

- `package.json` version is `1.0.0`.
- `CHANGELOG.md` includes the 1.0.0 release notes.
- CI includes package dry-run verification.
- Security policy no longer describes the project as pre-1.0.
