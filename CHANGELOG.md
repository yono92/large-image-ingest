# Changelog

## 1.0.1

- Clarified that Core 1.0 is released as `v1.0.0` rather than pending.
- Clarified snapshot security documentation: event snapshots are redacted, while `onSnapshot` and `getSnapshot()` expose caller-controlled full snapshots.
- Added example typechecking to CI.
- Aligned public ingest errors around `LargeImageIngestError` with typed codes and retryability.
- Updated manifest `library.version` output for the `1.0.1` patch package.

## 1.0.0

- Promoted the core package API to a stable 1.0 release target.
- Added manifest schema `large-image-ingest.manifest.v1`.
- Added default whole-file SHA-256 checksum generation using bounded `Blob.slice` reads.
- Added required metadata and caller-provided image dimension validation.
- Added typed public errors with stable error codes.
- Added explicit upload session states, typed events, pause/resume, snapshots, and resume-from-snapshot support.
- Added optional transport hooks for snapshot resume and remote chunk skipping.
- Added ESM, CommonJS, and TypeScript declaration package entrypoints.
- Expanded tests for checksum, manifest v1, validation, session state, pause/resume, snapshot resume, abort, and package consumption.
