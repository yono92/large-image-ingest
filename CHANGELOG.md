# Changelog

## 1.7.0

- Add strict, versioned inspection metadata profiles with frozen semiconductor-wafer and industrial-inspection defaults.
- Add serializable policy packs and an evidence-grade semiconductor policy for preservation, source checksum, verified completion, stored checksum, size, media type, and metadata rules.
- Add deterministic policy reports with field paths and typed issues that never copy rejected metadata values.
- Add immutable evidence bundles with recursively key-sorted canonical UTF-8 JSON and SHA-256 payload identity.
- Add application-owned signing and verification callbacks, strict base64url envelopes, digest-first tamper rejection, and no key/provider ownership in core.
- Publish four new JSON Schemas, safe inspection/evidence summaries, custom policy and WebCrypto examples, and migration guidance.

## 1.6.0

- Add framework-neutral `createIngestQueue()` orchestration with deterministic FIFO admission and validated item, byte, and queue limits.
- Add typed queue/item lifecycle, detached aggregate snapshots, observer isolation, and safe event/snapshot/record summaries.
- Add versioned queue v0.1 records, a published JSON Schema, provider-neutral `IngestQueueStore`, and browser `WebStorageQueueStore`.
- Restore durable intent through application-owned source resolution and session-options factories without serializing source bytes, credentials, transports, manifests, receipts, checksums, or raw errors.
- Normalize restored running intent safely and ensure unresolved or mismatched sources cause no session or transport call.
- Carry session resume record IDs into fresh queue retry sessions so v0.3 exact-content resume remains authoritative.
- Preserve remote completion when the final queue-store write fails and emit a typed operational event.

## 1.5.0

- Add an injectable Web Worker-compatible checksum executor with a versioned validated protocol, bounded slicing, progress parity, and prompt abort termination.
- Add `execution.maxParallelChunks` with a sequential default, a hard 1..32 limit, and explicit transport capability enforcement before remote creation.
- Settle parallel chunks in bounded batches, validate and checkpoint successful siblings by index, and preserve them across mixed failure, pause, cancel, and exact-source resume.
- Keep completion receipts and evidence digests deterministic across out-of-order network completion.
- Keep official tus and S3 helpers sequential until their adapter-specific protocols explicitly support parallel work.

## 1.4.0

- Bind new persistent resume v0.3 records to whole-file SHA-256 content identity and reject same-metadata replacement files before transport access.
- Preserve safe v0.1/v0.2 inspection and resume paths while rejecting legacy progress without trustworthy source identity.
- Add immutable `large-image-ingest.completion.v1` evidence with truthful `verified` and `completed-unverified` outcomes.
- Allow custom, S3 multipart, tus, and Node/NAS integrations to return normalized stored-object size and checksum facts without provider logic in core.
- Add packaged JSON Schema Draft 2020-12 contracts for manifest v1, resume v0.3, and completion v1.
- Centralize producer version attribution, add package-version drift gates, and expose safe allowlisted completion summaries.
- Keep existing custom transports returning `void` source-compatible and keep checksum-disabled non-resumable uploads available as unverified completions.

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
