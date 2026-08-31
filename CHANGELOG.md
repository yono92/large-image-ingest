# Changelog

## Unreleased

## 1.5.0

- Bind new durable resume records to mandatory whole-file SHA-256 source identity in `large-image-ingest.resume.v0.3`, rejecting metadata-equal altered sources before remote recovery.
- Preserve validated v0.1/v0.2 readers with deterministic resumable, upgradeable, restart-only, expired, and incompatible outcomes and checkpoint-only safe promotion.
- Add cancelable checksum executors, monotonic bounded progress, isolated observers, and the ESM-only `large-image-ingest/browser` Worker executor with explicit inline fallback.
- Keep strong persistent identity when manifest checksum output is disabled and reuse one traversal when manifest checksum evidence is available.
- Report manifest producer version 1.5.0 independently from manifest schema v1 and enforce package/source version synchronization during build.
- Interpret snapshot and persistent recovery capabilities conservatively while preserving ordinary upload compatibility for custom transports without detailed flags.
- Redact v0.3 content identity, full recovery state, receipts, and provider evidence from safe diagnostics and first-party UI projections.

## 1.4.0

- Classify preflight policy rejection with the existing `validation.failed` error code.
- Add controller preparation phases and bounded checksum progress while preserving existing callbacks and upload authority.
- Add the optional `large-image-ingest/react-ui` panel, provider, hook, composable primitives, safe recovery and verification adapters, and opt-in prefixed stylesheet.
- Add a credential-free first-party React reference app and provider-neutral local infrastructure while retaining Uppy as an optional selection-only recipe.
- Add DOM accessibility, 320px/200%-zoom/reduced-motion browser, CSS boundary, package export, and stale async result regression gates.

## 1.3.1

- Prevent concurrent NAS chunk staging from losing acknowledged chunk records across gateway instances.
- Serialize same-session staging, finalization, cancellation, and expired cleanup through the existing shared lock contract without changing public types or error codes.
- Persist NAS session metadata through collision-resistant same-directory candidates and atomic promotion so failed updates preserve the previous committed state.
- Keep same-index replacement bytes and checksum metadata consistent and clean abandoned metadata and chunk candidates during later coordinated mutations.
- Preserve `large-image-ingest.nas-session.v0.1`, `large-image-ingest.nas-lock.v0.1`, and all existing NAS API signatures.

## 1.3.0

- Preserve successful remote completion when local resume cleanup fails.
- Isolate caller event and snapshot observer failures from upload control flow.
- Add typed non-fatal cleanup warnings and observer failure reporting.
- Add an optional React headless controller, provider, progress hook, and upload control hook.
- Add optional bounded TIFF and BigTIFF structural metadata probing without raster decoding.
- Add a credential-free HTTP interruption, durable resume, and stored-file verification release gate.
- Publish reproducible 1 GiB and 3 GiB benchmarks with timing, memory, retransmission, and integrity evidence.
- Clarify that React support is headless and TIFF support is metadata-only.

## 1.2.0

- Added versioned resume record integrity hardening for durable multipart recovery.
- Added persistent provider receipt storage and safe legacy resume handling.
- Added bounded runtime validation for untrusted resume records.
- Added granular transport capability reporting for snapshot and persistent resume support.
- Hardened NAS session creation and target handling against collisions and unsafe replacement.

## 1.1.1

- Polished README, changelog, and roadmap wording after the 1.1.0 release.
- Added project guidance requiring documentation/version alignment checks before npm publish.

## 1.1.0

- Added operational safety documentation and roadmap updates.
- Added safe diagnostics helpers for events, snapshots, resume records, and verification reports.
- Added configurable retry policy support for transient upload failures.
- Added an opt-in integration test harness for real TUS, S3-compatible, and NAS-backed paths.
- Added derivative manifest helpers for previews, thumbnails, tiles, metadata enrichments, and custom derivative references.
- Added browser-safe preview and thumbnail descriptor helpers that do not read, decode, rewrite, or embed original bytes by default.
- Added metadata enrichment and tile pyramid helpers for server-side or caller-owned image inspection outputs.
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
