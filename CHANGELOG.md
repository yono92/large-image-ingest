# Changelog

## 1.1.0

- Added operational safety planning and roadmap documentation.
- Added safe diagnostics helper contracts for events, snapshots, resume records, and verification reports.
- Added retry policy planning for transient upload failures.
- Added opt-in integration test harness planning for real TUS, S3-compatible, and NAS-backed paths.
- Added derivative manifest foundations for previews, thumbnails, tiles, metadata enrichments, and custom derivative references.
- Added browser-safe preview and thumbnail descriptor planning that does not read, decode, rewrite, or embed original bytes by default.
- Added metadata enrichment and tile pyramid contract planning for server-side or caller-owned image inspection outputs.
- Preserved the single-package subpath model while keeping derivative processing, storage, UI, and provider behavior adapter-owned.

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
