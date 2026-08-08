# Roadmap

This roadmap captures minor-release work after 1.0.0. Items here are not committed implementation scope until they have their own Spec Kit artifacts.

The commercial-readiness roadmap through 1.7.0 is implemented. Future items below are optional follow-on work, not incomplete 1.7 scope.

## 1.7.0 Included - Inspection Ecosystem

Spec Kit artifacts:

- [Inspection ecosystem](../specs/014-inspection-ecosystem/spec.md)

- [x] Add versioned custom and built-in inspection metadata profiles.
- [x] Add provider-neutral reusable policy packs and deterministic reports.
- [x] Add canonical SHA-256 evidence bundles and application-owned signing/verification boundaries.
- [x] Add four JSON Schemas, safe summaries, and custom/WebCrypto reference integrations.

## 1.6.0 Included - Production Orchestration

Spec Kit artifacts:

- [Production orchestration](../specs/013-production-orchestration/spec.md)

- [x] Add deterministic multi-file FIFO scheduling with active item, byte, and queue limits.
- [x] Add queue/item pause, resume, retry, cancel, source attachment, and terminal removal lifecycle.
- [x] Add versioned durable queue intent and browser Web Storage recovery without serializing sources or credentials.
- [x] Add detached aggregate telemetry, observer isolation, and allowlisted safe diagnostics.

## 1.5.0 Included - Extreme-File Execution

Spec Kit artifacts:

- [Extreme-file execution](../specs/012-extreme-file-execution/spec.md)

- [x] Add cancelable Worker-compatible whole-file checksum execution.
- [x] Add opt-in bounded parallel chunk scheduling with an explicit transport capability boundary.
- [x] Persist successful siblings before reporting mixed parallel failure.
- [x] Preserve deterministic receipt ordering, completion evidence, and exact-source resume.

## 1.4.0 Included - Evidence-Grade Ingest Integrity

Spec Kit artifacts:

- [Evidence-grade ingest integrity](../specs/011-evidence-grade-ingest-integrity/spec.md)

- [x] Bind persistent resume to whole-file content identity before transport access.
- [x] Add immutable verified/unverified completion evidence without mutating manifest v1.
- [x] Normalize S3, tus, custom, and Node/NAS stored-object integrity facts through provider-neutral contracts.
- [x] Ship current manifest, resume, and completion JSON Schemas with exact producer attribution.
- [x] Add allowlisted completion diagnostics and migration guidance.

## 1.3.1 Included - NAS Concurrency Integrity

Spec Kit artifacts:

- [NAS concurrency integrity](../specs/010-nas-concurrency-integrity/spec.md)

- [x] Serialize same-session NAS staging, finalization, cancellation, and expired cleanup across gateway instances.
- [x] Atomically promote collision-resistant metadata candidates while preserving the last committed session state.
- [x] Keep same-index replacement bytes and metadata consistent and clean abandoned candidates safely.
- [x] Preserve existing NAS public APIs, error codes, and v0.1 session and lock schemas.

## 1.1.0 Included - Operational Safety And Derivative Foundations

Spec Kit artifacts:

- [Operational safety](../specs/003-operational-safety/spec.md)
- [Derivatives and preview foundations](../specs/004-derivatives-preview-foundations/spec.md)

- [x] Add safe summaries for events, snapshots, resume records, and verification reports.
- [x] Add configurable retry policy support for transient upload failures.
- [x] Add opt-in integration harness for real TUS, S3-compatible, and NAS-backed paths.
- [x] Specify browser-safe derivative manifest entries for previews, thumbnails, and tile metadata without mutating the original.
- [x] Add preview/thumbnail/tile package boundaries under the adapter model.
- [x] Define image metadata enrichment boundaries for formats where dimensions are caller-provided or server-derived.
- [x] Decide whether preview generation belongs in browser helpers, Node helpers, or both.
- [x] Add tests proving derivatives are separately referenced and never replace original manifest identity.
- [x] Update README examples for derivative references once the public contract is specified.

## 1.2.0 Included - Resume Integrity Hardening

Spec Kit artifacts:

- [Resume integrity hardening](../specs/005-resume-integrity-hardening/spec.md)

- [x] Persist authoritative chunk receipts in versioned resume records.
- [x] Resume S3 multipart uploads after restart without caller-managed snapshots.
- [x] Validate untrusted resume records before chunk skipping or transport calls.
- [x] Report snapshot and persistent resume capabilities separately for official transports.
- [x] Reject unsafe NAS session collisions and existing finalize targets.

## 1.3.0 Included - Integrity, React, And TIFF Foundations

Spec Kit artifacts:

- [Completion integrity](../specs/006-completion-integrity/spec.md)
- [React headless adapter](../specs/007-react-headless/spec.md)
- [TIFF and BigTIFF metadata probe](../specs/008-tiff-metadata-probe/spec.md)
- [Reference integration and benchmarks](../specs/009-reference-integration-benchmarks/spec.md)

- [x] Preserve successful remote completion across local resume cleanup failures.
- [x] Isolate event and snapshot observer failures from upload control flow.
- [x] Expose typed non-fatal cleanup and observer failure signals.
- [x] Add optional React headless hooks over the framework-agnostic session contract.
- [x] Add TIFF and BigTIFF metadata probing without decoding image pixels.
- [x] Add a credential-free HTTP interruption, durable resume, and stored-file verification release gate.
- [x] Publish reproducible 1 GiB and 3 GiB timing, memory, retransmission, and integrity evidence.

## Future TODO - Remaining Ingest Integrity

- [ ] Replace provider preflight checks with complete opt-in integration scenarios.

## Future TODO - Advanced Upload Modes

- [ ] Define per-chunk checksum policy for transports that require provider-specific integrity records.
- [ ] Assess whether scoped packages are needed after 1.1 API growth.
- [ ] Add styled upload components only after headless adapter usage stabilizes.

## Parking Lot

- [ ] Provider-specific AWS S3 package if the generic S3-compatible multipart adapter becomes too broad.
- [ ] Dedicated migration guide if subpath exports move to scoped packages.
