# Roadmap

This roadmap captures minor-release work after 1.0.0. Items here are not committed implementation scope until they have their own Spec Kit artifacts.

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

- [ ] Harden source-file content identity for persistent resume.
- [ ] Make NAS staging metadata updates atomic and concurrency-safe.
- [ ] Add cancelable worker-based browser checksum execution.
- [ ] Replace provider preflight checks with complete opt-in integration scenarios.
- [ ] Align manifest producer version and transport capability reporting.

## Future TODO - Advanced Upload Modes

- [ ] Evaluate parallel upload support and its impact on chunk planning, receipt ordering, resume checkpoints, and transport capabilities.
- [ ] Define per-chunk checksum policy for transports that require provider-specific integrity records.
- [ ] Assess whether scoped packages are needed after 1.1 API growth.
- [ ] Add styled upload components only after headless adapter usage stabilizes.

## Parking Lot

- [ ] Provider-specific AWS S3 package if the generic S3-compatible multipart adapter becomes too broad.
- [ ] Web Worker checksum helper if checksum work causes main-thread pressure in real applications.
- [ ] Dedicated migration guide if subpath exports move to scoped packages.
