# Roadmap

This roadmap captures minor-release work after 1.0.0. Items here are not committed implementation scope until they have their own Spec Kit artifacts.

## 1.5.0 Included - Persistent Source Identity And Responsive Checksum

Spec Kit artifacts:

- [Persistent source identity and responsive checksum](../specs/013-persistent-source-identity/spec.md)

- [x] Bind persistent resume to exact whole-file content identity before remote recovery or acknowledged-byte skipping.
- [x] Add cancelable bounded checksum execution and an official ESM browser Worker subpath with explicit fallback.
- [x] Preserve safe v0.1/v0.2 discovery, deterministic compatibility outcomes, and checkpoint-only migration to v0.3.
- [x] Align manifest producer release metadata and conservative transport recovery capabilities without breaking ordinary custom uploads.

## 1.4.0 Included - First-Party Inspection Upload UI

Spec Kit artifacts:

- [First-party inspection upload UI](../specs/012-first-party-react-ui/spec.md)

- [x] Correct typed validation presentation and expose source preparation progress from the headless controller.
- [x] Ship an optional `react-ui` surface with a complete panel, composable primitives, opt-in CSS, and no Uppy runtime dependency.
- [x] Present safe resume choices and application-supplied stored-object verification without duplicating controller authority.
- [x] Add an official credential-free React reference experience covering upload, pause, reload, resume, cancellation, failure, and verification.
- [x] Keep Uppy as an optional integration recipe and evaluate a dedicated adapter only from observed API friction.

## 1.4.0 Included - Uppy UI Composition Validation

Spec Kit artifacts:

- [Uppy UI integration](../specs/011-uppy-ui-integration/spec.md)

- [x] Define Uppy as selection UI while preserving one authoritative SDK upload lifecycle.
- [x] Add a credential-free React example with real local transfer, recovery, cancellation, and verification.
- [x] Record observed API friction and defer an official Uppy adapter when public APIs remain sufficient.
- [x] Produce a separate review-ready tus-js-client transport brief without adding its dependency or export.

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

- [ ] Evaluate parallel upload support and its impact on chunk planning, receipt ordering, resume checkpoints, and transport capabilities.
- [ ] Define per-chunk checksum policy for transports that require provider-specific integrity records.
- [ ] Assess whether scoped packages are needed after 1.1 API growth.
- [x] Promote styled upload components into formal scope after headless adapter usage stabilized; implementation is tracked by feature 012.

## Parking Lot

- [ ] Provider-specific AWS S3 package if the generic S3-compatible multipart adapter becomes too broad.
- [ ] Dedicated migration guide if subpath exports move to scoped packages.
