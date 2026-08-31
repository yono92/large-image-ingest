# Feature Specification: Persistent Source Identity and Responsive Checksum

**Feature Branch**: `main` (feature directory: `013-persistent-source-identity`)

**Created**: 2026-08-31

**Status**: Implemented

**Input**: User description: "Prioritize persistent-resume source identity hardening, responsive and cancelable background checksum preparation, resume-record compatibility and migration, and alignment of manifest producer metadata with transport capability reporting while preserving existing public APIs."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resume Only The Exact Original (Priority: P1)

As an inspection operator, I can reselect an original after a reload and trust that durable resume skips previously acknowledged bytes only when the selected content is the exact source associated with the recovery record.

**Why this priority**: Metadata such as filename, size, media type, and modification time can be identical for different content. Treating metadata identity as proof of content identity can join acknowledged remote bytes with the wrong local source and invalidate the stored original.

**Independent Test**: Create two files with identical metadata and size but at least one different byte, interrupt an upload after durable progress, and verify that only the original file can resume while the altered file is rejected before any transport mutation.

**Acceptance Scenarios**:

1. **Given** a recoverable upload with acknowledged bytes and content-derived source evidence, **When** the exact original is reselected, **Then** compatibility succeeds and resume can skip only the acknowledged ranges recorded for that source.
2. **Given** a different file with the same filename, size, media type, and modification time, **When** resume compatibility is evaluated, **Then** it is rejected before remote session recovery, chunk skipping, upload, or completion.
3. **Given** a selected source whose content identity cannot be established, **When** a progressed durable record would require acknowledged bytes to be skipped, **Then** resume is blocked with a typed actionable outcome and the record remains available for application-directed cleanup or later recovery.
4. **Given** an exact source and a record with no acknowledged bytes, **When** strong compatibility cannot be proven, **Then** the application may begin a new ingest but MUST NOT silently treat the unproven record as a resumed upload.

---

### User Story 2 - Prepare Large-File Identity Without Freezing The Experience (Priority: P1)

As an operator handling multi-gigabyte inspection images, I can see bounded source-identity progress, continue interacting with the application, and cancel preparation without a late checksum result starting or modifying an ingest.

**Why this priority**: Whole-file identity is required for safe persistent resume, but performing sustained checksum work on the interactive execution path can make the application appear frozen and can apply obsolete results after the source changes.

**Independent Test**: Begin identity preparation for a multi-gigabyte synthetic source, verify interaction and progress remain responsive, cancel or replace the source at multiple preparation points, and confirm no canceled or obsolete result changes the active source, manifest, recovery decision, or transport state.

**Acceptance Scenarios**:

1. **Given** a supported browser environment and a large source, **When** content identity preparation begins, **Then** checksum work can execute away from the interactive path while reporting monotonic bounded progress.
2. **Given** active preparation, **When** the operator cancels, removes, or replaces the source, **Then** outstanding work is canceled or invalidated and no late result is accepted for the previous source.
3. **Given** background execution is unavailable or fails before producing trusted evidence, **When** the application chooses a supported fallback, **Then** identity correctness, bounded memory, cancellation semantics, and typed failure behavior remain intact even if performance differs.
4. **Given** one completed whole-file content calculation can satisfy both source identity and manifest checksum policy, **When** manifest preparation completes, **Then** the source is not read through a second equivalent whole-file pass.
5. **Given** an application progress observer throws, **When** identity preparation continues, **Then** the observer failure remains isolated and cannot alter the authoritative preparation or ingest outcome.

---

### User Story 3 - Recover Safely From Supported Older Records (Priority: P1)

As an application developer upgrading the SDK, I can continue to discover supported older resume records and receive a deterministic usable, upgradeable, restart-only, or incompatible outcome without unsafe assumptions or silent record loss.

**Why this priority**: Existing applications may retain durable records across deployments. A stronger identity contract must improve safety without unexpectedly deleting recoverable state or fabricating evidence that older records never captured.

**Independent Test**: Evaluate a fixture matrix covering every supported resume-record version, with and without acknowledged progress and trustworthy whole-file evidence, and verify that each record follows its documented path before transport mutation.

**Acceptance Scenarios**:

1. **Given** a supported older record containing trustworthy whole-file content evidence, **When** the exact source is reselected, **Then** the record remains safely resumable and can be written in the current form at the next authoritative checkpoint without changing manifest identity.
2. **Given** a supported older progressed record without sufficient content evidence, **When** resume is requested, **Then** the SDK returns a typed non-retryable compatibility outcome before remote work and does not invent identity evidence.
3. **Given** an older record that is structurally valid but unsuitable for skipping acknowledged bytes, **When** it is listed, **Then** applications can still present a safe recovery summary and choose explicit cleanup or a new ingest.
4. **Given** a record with an unsupported or malformed identity form, **When** it is parsed or classified, **Then** it is rejected without exposing the record, digest value, provider state, or customer metadata in default diagnostics.

---

### User Story 4 - Trust Manifest Provenance And Resume Capabilities (Priority: P2)

As an SDK integrator, I can inspect a manifest and a transport capability summary and accurately determine which library release produced the artifact and which recovery modes the configured transport actually supports.

**Why this priority**: Stale producer metadata and ambiguous resumability claims make support, migration, and safe UI decisions harder even when the underlying upload succeeds.

**Independent Test**: Produce manifests and capability summaries using the built package and each official transport, then verify producer metadata matches the installed release and every advertised recovery mode is demonstrated by a corresponding supported behavior.

**Acceptance Scenarios**:

1. **Given** a manifest produced by a released package, **When** its provenance is inspected, **Then** it identifies the actual producing package release rather than a stale fixed value.
2. **Given** an official or custom transport, **When** its capabilities are inspected, **Then** transient retry, caller-supplied snapshot recovery, and durable persistent recovery are not represented as interchangeable guarantees.
3. **Given** an older custom transport that omits newer optional capability detail, **When** it is used through an existing public entrypoint, **Then** existing supported upload behavior remains source-compatible and the SDK does not claim unproven recovery support.
4. **Given** capability information used by the first-party UI or documentation, **When** a recovery action is offered, **Then** the action corresponds to an authoritative supported capability rather than a generic resumable label alone.

### Edge Cases

- Two sources have identical names, sizes, media types, modification times, and metadata but differ at the first, middle, or final byte.
- A source is empty, smaller than one processing slice, exactly one slice, or not an exact multiple of the slice size.
- A source does not provide a modification time or provides an empty media type.
- Cancellation occurs before the first byte, between source slices, after all bytes are read but before the result is accepted, or while a progress callback runs.
- The selected source changes repeatedly while older background operations are still settling.
- Background preparation cannot start, terminates unexpectedly, returns malformed output, or reports progress outside the source byte range.
- The source-like object changes its reported size or bytes during preparation.
- Manifest checksum generation is disabled while persistent resume is enabled.
- A caller supplies expected checksum evidence that disagrees with the calculated source identity.
- A legacy record has metadata identity only, a whole-file checksum only, conflicting identity fields, no acknowledged progress, or completed progress.
- A supported legacy record can be read but cannot be proven safe for its transport's recovery requirements.
- A custom transport reports a generic resumable capability but omits snapshot or persistent recovery detail.
- Default events, UI state, logs, or diagnostics are produced for a content mismatch containing sensitive manifest or provider data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Any durable resume operation that would skip one or more acknowledged source bytes MUST establish compatibility from content-derived evidence that covers the entire original source.
- **FR-002**: Filename, size, media type, modification time, extension, and user metadata MAY be used as preliminary compatibility filters but MUST NOT alone authorize skipping acknowledged bytes.
- **FR-003**: A content mismatch or absence of required trustworthy identity evidence MUST stop durable resume before remote session recovery, chunk skipping, upload, completion, or other transport mutation.
- **FR-004**: Strong identity preparation MUST preserve the exact original bytes and MUST NOT decode, resize, recompress, normalize, strip metadata, or otherwise mutate the source.
- **FR-005**: Source content MUST be processed incrementally with a documented memory bound and MUST NOT require an application-owned whole-file buffer.
- **FR-006**: Browser applications MUST have an official way to perform sustained checksum preparation away from the interactive execution path while retaining the framework-agnostic core path for other environments.
- **FR-007**: Identity preparation MUST accept cancellation and MUST prevent canceled, failed, or superseded results from changing the active source, manifest, recovery classification, upload session, or UI state.
- **FR-008**: Preparation progress MUST be monotonic, bounded between zero and the source size, identify completion accurately, and remain optional when an execution environment cannot provide meaningful byte progress.
- **FR-009**: Observer and progress-callback failures MUST remain isolated from checksum, identity, validation, manifest, and ingest authority and MUST be reportable through the existing observer-failure boundary.
- **FR-010**: When one trusted whole-file calculation satisfies both source identity and configured manifest checksum policy, the result MUST be reused so the source is not read by two equivalent full-file passes.
- **FR-011**: Persistent resume MUST retain content-derived source evidence in a versioned form sufficient to compare a reselected source without relying only on mutable metadata.
- **FR-012**: The SDK MUST recognize every documented supported resume-record version and classify each as safely resumable, safely upgradeable, restart-only, expired, or incompatible before transport mutation.
- **FR-013**: Migration MUST NOT fabricate missing content evidence, alter manifest identity, discard provider receipts, reset acknowledged progress, or delete the original stored record without explicit application policy.
- **FR-014**: A supported older record MAY be promoted to the current record form only after its identity and transport evidence meet the current safety requirements; promotion SHOULD occur at an authoritative checkpoint rather than merely because the record was listed.
- **FR-015**: Records that cannot be migrated safely MUST remain available for safe summary, explicit cleanup, or selection of a new ingest and MUST produce a typed actionable compatibility outcome.
- **FR-016**: Content identity values, full resume records, full manifests, customer metadata, provider receipts, upload locations, object keys, paths, tokens, and credentials MUST be omitted from default events, diagnostics, UI presentation, and error messages.
- **FR-017**: Manifest provenance MUST identify the actual library name and release that produced the manifest while preserving the existing manifest schema contract unless a separately specified schema change is required.
- **FR-018**: Transport capability reporting MUST distinguish generic resumability from caller-managed snapshot recovery and durable persistent recovery, and MUST NOT advertise a recovery mode that the transport cannot perform safely.
- **FR-019**: Existing custom transports that omit optional detailed capabilities MUST remain usable for their existing upload behavior, with missing capability detail interpreted conservatively rather than as proof of support.
- **FR-020**: Existing public entrypoints, manifest consumers, supported resume readers, official transports, headless controllers, React integrations, and custom transport implementations MUST remain source-compatible for the additive minor release.
- **FR-021**: Typed preparation, checksum, source-mismatch, cancellation, legacy-record, and unsupported-capability outcomes MUST be distinguishable enough for applications to present safe recovery guidance without inspecting raw sensitive data.
- **FR-022**: The first-party inspection UI and official examples MUST present authoritative identity-preparation progress and cancellation without exposing content identity values or creating a second preparation state machine.
- **FR-023**: Documentation MUST describe strong persistent-resume identity, cancellation behavior, supported legacy-record outcomes, provenance semantics, capability semantics, environment fallbacks, and the sensitivity of complete recovery artifacts.
- **FR-024**: Default verification MUST remain local and credential-free; real provider checks MUST remain explicit opt-in scenarios.

### Scope Boundaries

- Parallel chunk upload, per-chunk transport checksums, cross-tab session ownership, offline orchestration, provider-specific authentication, storage retention policy, and a production backend are outside this feature.
- This feature does not change the original-preservation contract or generate previews, thumbnails, tiles, or other derivatives.
- This feature does not promise that metadata-only legacy records are resumable; safety takes precedence over preserving an unsafe recovery path.
- This feature aligns existing manifest provenance and transport capability reporting but does not introduce a new manifest schema solely to rename or reorganize fields.

### Key Entities

- **Content Source Identity**: Versioned evidence derived from every byte of the selected original and used to decide whether durable acknowledged ranges may be reused.
- **Metadata Fingerprint**: A fast preliminary identity derived from source metadata. It can narrow candidates but cannot independently authorize durable byte skipping.
- **Identity Preparation Operation**: One cancelable attempt to calculate content evidence for one exact selected source, including bounded progress and an operation identity that prevents obsolete results from being accepted.
- **Resume Record**: Versioned durable recovery state containing manifest identity, source evidence, chunking identity, transport state, receipts, progress, and timestamps.
- **Legacy Resume Record**: A supported older recovery record whose available source and transport evidence determines whether it can be resumed, promoted, restarted, or only cleaned up.
- **Manifest Provenance**: The package identity and release recorded as the producer of a manifest.
- **Transport Capability Summary**: Conservative declarations describing upload, abort, expiration, chunk-integrity, parallelism, snapshot recovery, and persistent recovery support.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a fixture matrix where pairs share identical metadata and size but differ in content, 100% of altered sources are rejected before any transport mutation and 100% of exact sources remain eligible for resume when all other recovery evidence is valid.
- **SC-002**: Across cancellation and source-replacement tests at the beginning, middle, and end of preparation, zero canceled or superseded results update a manifest, resume decision, active controller, durable record, or transport session.
- **SC-003**: During recorded 1 GiB and 3 GiB browser preparation runs, operator input and cancellation remain responsive, no single preparation task blocks the interactive path for more than 100 milliseconds, and progress never decreases or exceeds total source bytes.
- **SC-004**: For 1 GiB and 3 GiB fixtures, maximum simultaneously buffered source data remains within the documented fixed processing bound and does not grow in proportion to source size; no full-file application buffer is created.
- **SC-005**: When source identity and manifest checksum use equivalent whole-file evidence, instrumentation records exactly one full traversal of source bytes.
- **SC-006**: 100% of fixtures for every documented resume-record version produce the documented resumable, upgradeable, restart-only, expired, or incompatible outcome before transport mutation.
- **SC-007**: Every manifest produced by packaged release tests reports the package name and exact release version under test, with zero stale hard-coded producer versions.
- **SC-008**: Every official transport passes a capability matrix in which each advertised recovery mode has a successful behavior test and each unsupported mode is absent or explicitly false.
- **SC-009**: Safe diagnostic and UI fixtures expose zero content-identity values, full recovery artifacts, provider secrets, upload locations, object keys, filesystem paths, or customer metadata values.
- **SC-010**: Existing type checks, unit tests, package-consumption tests, official transport tests, React UI tests, reference integrity checks, builds, and package dry runs remain successful after the additive changes.

## Assumptions

- The feature targets the next additive minor release after 1.4.0; removing existing entrypoints or requiring existing custom transports to implement new methods is out of scope.
- Whole-file cryptographic evidence is the default trust level for authorizing reuse of acknowledged source ranges. Metadata fingerprints remain useful only for fast candidate filtering.
- The existing default whole-file checksum policy provides reusable content evidence; applications that disable manifest checksums but enable persistent resume still accept the cost of establishing separate strong resume identity.
- Supported older records that already contain trustworthy whole-file checksum evidence can use that evidence for compatibility after validation; records without sufficient evidence cannot be made safe by inferred or fabricated values.
- A source supplied for one ingest session returns stable size, metadata, and slice bytes for that session. Sources that can mutate underneath an active read require an application-owned snapshot and are outside this feature.
- Exact record-schema evolution, public type names, execution packaging, and fallback selection belong to planning as long as they satisfy this specification's compatibility and safety outcomes.
- Browser responsiveness measurements are recorded with the environment and are release evidence, not universal performance guarantees for every device.
- Real tus, S3-compatible, and NAS qualification remains a later feature; this feature uses credential-free fakes and local reference infrastructure by default.
