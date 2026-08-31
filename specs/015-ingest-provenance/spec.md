# Feature Specification: Auditable Ingest Provenance

**Feature Branch**: `[015-ingest-provenance]`

**Created**: 2026-08-31

**Status**: Implemented

**Input**: User description: "Provide a durable, privacy-conscious provenance artifact that links source identity, validation policy, upload recovery, transport evidence, derivatives, and stored-object verification without turning sensitive resume state into an audit log."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Retain A Trustworthy Ingest Record (Priority: P1)

As an ingestion operator, I can retain a compact provenance record after an upload completes, fails, or is canceled so that the important facts of the ingest remain explainable after operational recovery state is cleaned up.

**Why this priority**: Resume records are temporary operational state and may contain sensitive handles; auditability requires a separately scoped artifact designed for safe retention.

**Independent Test**: Exercise successful, failed, resumed, and canceled ingests, remove their recoverable session records according to normal cleanup policy, and verify that each configured provenance record still explains the source, applied policy, lifecycle outcome, and verification status without retaining forbidden secrets.

**Acceptance Scenarios**:

1. **Given** a successfully verified ingest, **When** its operational recovery state is deleted, **Then** the retained provenance artifact still links the manifest identity, original checksum, applied validation policy, recovery summary, completion result, and stored-original verification result.
2. **Given** an ingest that fails or is canceled, **When** provenance capture is enabled, **Then** the artifact records the terminal category and completed evidence without falsely claiming completion or verification.
3. **Given** provenance capture is not configured, **When** an ingest runs, **Then** existing upload, resume, cleanup, and verification behavior remains unchanged.

---

### User Story 2 - Verify Provenance Integrity And Relationships (Priority: P1)

As an auditor or downstream preservation service, I can verify that a provenance artifact is structurally valid, internally ordered, integrity-protected, and consistently linked to the manifest, original, derivatives, and verification evidence it describes.

**Why this priority**: A history document is useful only when accidental modification, broken references, missing evidence, and unsupported claims can be detected.

**Independent Test**: Validate an intact artifact, then independently alter event ordering, source identity, policy identity, derivative references, verification results, and the artifact integrity value to confirm that each inconsistency produces a typed issue.

**Acceptance Scenarios**:

1. **Given** an intact provenance artifact and its referenced manifest, **When** validation runs, **Then** their schema versions, manifest identity, source checksum, size, and derivative relationships agree.
2. **Given** any integrity-protected field is modified, **When** validation runs, **Then** the artifact fails integrity verification without exposing its sensitive source values in routine output.
3. **Given** an artifact is integrity-protected but not cryptographically signed by a trusted actor, **When** trust is reported, **Then** the result proves accidental-change detection only and does not imply signer identity or non-repudiation.
4. **Given** a caller supplies an external attestation, **When** it is attached, **Then** the attestation is clearly distinguished from library-generated provenance and can be validated independently.

---

### User Story 3 - Export Safe Evidence For Audit And Support (Priority: P2)

As a platform or support engineer, I can export a safe summary or a complete authorized provenance artifact for its intended audience without exposing operational secrets by default.

**Why this priority**: The same ingest evidence may support user recovery, internal audit, incident investigation, and long-term preservation, but those audiences require different disclosure levels.

**Independent Test**: Generate default summaries and explicitly authorized full exports from fixtures containing credentials, URLs, paths, object keys, customer metadata, and provider receipts, then verify that each projection reveals only its documented fields.

**Acceptance Scenarios**:

1. **Given** a provenance artifact containing application-authorized metadata, **When** a default summary is produced, **Then** it contains identifiers, status categories, timestamps, and safe evidence counts but no raw customer or provider values.
2. **Given** a caller requests a complete export through an explicit authorization boundary, **When** it is produced, **Then** the export remains schema-valid and documents which disclosure profile was applied.
3. **Given** an unknown future field or unsupported provenance version, **When** a safe summary is requested, **Then** it is rejected or conservatively summarized without accidentally disclosing the unknown value.

### Edge Cases

- A process stops after remote completion but before provenance persistence.
- A provenance sink fails after upload completion or verification has already become authoritative.
- Multiple resume cycles occur before one terminal outcome.
- The wall clock moves backward or events from different actors have equal timestamps.
- A verification result arrives after transfer completion or after an earlier failed verification attempt.
- A derivative is planned, created, replaced, fails, or becomes stale after the original ingest.
- A policy changes between initial upload and resume.
- The manifest exists but has no whole-file checksum because the caller disabled checksum generation.
- The provenance artifact is copied without its referenced manifest, derivative, or external attestation.
- A caller-supplied actor, environment, reason, or metadata label contains control characters, paths, secrets, or misleading content.
- Integrity verification succeeds but the artifact has no trusted external signature.
- Retention or deletion is requested while a provenance write is in progress.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The feature MUST define a versioned ingest provenance artifact that is distinct from manifests, resume records, transport snapshots, diagnostics, and logs.
- **FR-002**: Provenance capture MUST be explicitly configured and MUST NOT change existing ingest authority, state transitions, resume cleanup, transport behavior, or verification results when unused.
- **FR-003**: The artifact MUST identify its schema version, creation time, producing library identity, disclosure profile, and one stable ingest correlation identity.
- **FR-004**: The artifact MUST reference the source manifest identity and MUST include or reference strong whole-file source evidence when such evidence was established.
- **FR-005**: The artifact MUST record the expected original byte count and checksum algorithm category without requiring the original bytes or full manifest to be embedded.
- **FR-006**: The artifact MUST identify the validation policy or rule set applied, its version, its result category, and safe counts or codes for failed and warned rules.
- **FR-007**: The artifact MUST represent lifecycle evidence for preparation, validation, session creation, acknowledgement progress, pause, retry, resume, completion, cancellation, failure, and verification only when those events occurred.
- **FR-008**: Lifecycle entries MUST use stable event identities and deterministic ordering independent of wall-clock uniqueness.
- **FR-009**: The artifact MUST distinguish observed events, application-supplied assertions, transport-supplied evidence, verification results, and external attestations by evidence source.
- **FR-010**: Recovery provenance MUST summarize record version, recovery classification, resume count, acknowledged-range reuse, retransmitted acknowledged bytes when measured, and conflict outcomes without embedding full recovery state.
- **FR-011**: Transport provenance MUST include the transport category, relevant capability summary, and safe receipt or offset evidence summaries without embedding credentials, secret URLs, object keys, filesystem paths, or raw provider payloads.
- **FR-012**: Completion provenance MUST distinguish transfer finalization from stored-original verification and MUST NOT infer verification from transport success alone.
- **FR-013**: Verification provenance MUST record the verification status, verifier category, expected and observed evidence categories, verification time, and typed issue codes without exposing raw sensitive values by default.
- **FR-014**: Derivative provenance MUST retain the relationship to the original manifest identity and identify the generator, policy, status, checksum, and storage-reference category when those values are available.
- **FR-015**: The artifact MUST support integrity protection over all authoritative provenance fields so accidental or unauthorized modification is detectable.
- **FR-016**: Integrity protection without a trusted external signature MUST NOT be described as proof of actor identity, trusted time, legal non-repudiation, or regulatory compliance.
- **FR-017**: The feature MUST allow application-owned external attestations to be referenced or attached without requiring credentials or private signing material to enter routine provenance output.
- **FR-018**: Provenance validation MUST report typed structural, ordering, identity, relationship, integrity, disclosure, and unsupported-version issues.
- **FR-019**: Default provenance summaries MUST omit raw customer metadata, filenames when sensitive, content checksums, full manifests, full resume records, raw receipts, credentials, tokens, sensitive URLs, object keys, and filesystem paths.
- **FR-020**: Complete exports MUST require an explicit disclosure choice and MUST record the chosen disclosure profile in the exported artifact.
- **FR-021**: Unknown artifact versions or fields MUST be handled conservatively and MUST NOT be copied into default summaries without a defined safe projection.
- **FR-022**: Provenance persistence failures MUST be observable through a typed non-sensitive outcome and MUST NOT retroactively change an already authoritative upload completion or verification result.
- **FR-023**: The provenance record MUST be capable of representing completed, completed-but-unverified, verification-failed, upload-failed, and canceled terminal outcomes without ambiguity.
- **FR-024**: Retention, archival, and deletion MUST remain application-owned policies, with documented guidance that separates operational resume retention from provenance retention.
- **FR-025**: The source original MUST remain unmodified, and provenance capture MUST not require decoding, recompression, metadata stripping, or derivative generation.
- **FR-026**: Documentation MUST describe the trust model, evidence sources, integrity guarantees, disclosure profiles, persistence-failure behavior, retention boundary, and limitations of unsigned provenance.

### Key Entities

- **Ingest Provenance Artifact**: A versioned, integrity-protected account of one ingest lifecycle and its evidence relationships.
- **Provenance Entry**: One ordered observation, assertion, result, or attestation associated with the ingest.
- **Evidence Source**: The actor or subsystem category responsible for an entry, without assuming the source is inherently trusted.
- **Policy Reference**: The identity and version of the validation policy applied to the original.
- **Recovery Summary**: A non-sensitive account of recovery classification, resume attempts, acknowledged-range reuse, and conflicts.
- **Verification Evidence**: A result linking expected source identity to observed stored-original evidence.
- **External Attestation**: Application-owned signed or otherwise trusted evidence whose trust is evaluated separately from library-generated provenance.
- **Disclosure Profile**: A declared projection controlling which provenance fields are included for a particular audience.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For successful, resumed, failed, canceled, completed-but-unverified, and verification-failed fixtures, 100% produce an unambiguous provenance terminal category when capture is configured.
- **SC-002**: After operational resume records are deleted, 100% of completed provenance fixtures still retain enough non-secret evidence to identify the manifest, source evidence category, applied policy, recovery summary, completion status, and verification status.
- **SC-003**: Altering any integrity-protected authoritative field causes provenance integrity validation to fail in 100% of mutation fixtures.
- **SC-004**: Cross-artifact fixtures detect 100% of manifest identity, source size, checksum, policy, derivative relationship, and verification-result mismatches covered by the conformance matrix.
- **SC-005**: Default summary fixtures expose zero raw customer metadata values, content checksums, full manifests, full recovery records, raw receipts, credentials, tokens, sensitive URLs, object keys, or filesystem paths.
- **SC-006**: Every entry in generated fixtures has one stable identity, one evidence-source category, and an ordering value, with zero ordering ambiguity when timestamps are equal or non-monotonic.
- **SC-007**: Provenance persistence failures are reported in 100% of injected sink-failure cases and change zero already authoritative upload or verification outcomes.
- **SC-008**: Unsigned artifact validation reports integrity separately from actor trust in 100% of covered cases and makes zero non-repudiation or trusted-time claims.
- **SC-009**: Every full export identifies its disclosure profile, and unsupported versions or fields appear in zero default summaries unless a safe projection is defined.
- **SC-010**: Applications that do not configure provenance capture observe no public lifecycle, recovery, completion, or verification behavior changes in all existing compatibility checks.

## Assumptions

- Manifests remain the source description, resume records remain operational recovery state, and provenance artifacts remain durable evidence; no one artifact replaces the others.
- Whole-file source evidence may be unavailable only when existing policy explicitly permits that weaker ingest, and the provenance artifact must report that limitation rather than fabricate evidence.
- Application-provided actor names, policy labels, reasons, and external attestations are untrusted inputs until an application trust policy validates them.
- Integrity protection detects modification but does not establish trusted identity or time without an independently trusted attestation.
- Applications decide whether provenance is stored beside the original, in a separate audit service, or exported to a preservation package.
- This feature does not define legal admissibility, regulatory certification, a key-management system, a transparency ledger, or a mandatory retention period.
- Preservation-standard export is handled by the separate interoperability feature and consumes provenance without redefining it.
