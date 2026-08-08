# Feature Specification: Evidence-Grade Ingest Integrity

**Feature Branch**: `011-evidence-grade-ingest-integrity`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "Plan and implement the commercial-readiness roadmap, beginning with evidence-grade ingest integrity: content-bound resume validation, truthful completion evidence, provider integrity evidence, and versioned public schemas."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resume Only The Exact Original (Priority: P1)

As an application developer handling high-value inspection images, I can resume an interrupted upload only when the newly selected source has the same byte content as the source that created the resume record.

**Why this priority**: Reusing acknowledged chunks from a different file can silently assemble an invalid inspection artifact even when filename, size, media type, and modification time match.

**Independent Test**: Start and interrupt an upload, create another file with identical metadata but different bytes, and confirm that resume rejects it before any remote state lookup, chunk upload, completion, or abort mutation occurs.

**Acceptance Scenarios**:

1. **Given** a resumable upload with acknowledged chunks and a reselected file with the same content, **When** the application resumes, **Then** the upload continues without retransmitting acknowledged chunks.
2. **Given** a reselected file with matching filename, size, media type, and modification time but different bytes, **When** resume is requested, **Then** resume fails with a typed content-mismatch result before any transport mutation.
3. **Given** persistent resume is requested without trustworthy content identity, **When** the upload is started or resumed, **Then** the SDK rejects the unsafe resumable path rather than falling back to metadata-only matching.
4. **Given** a supported legacy resume record that contains a trustworthy whole-file checksum, **When** the matching source is reselected, **Then** it remains safely resumable without fabricating new identity evidence.

---

### User Story 2 - Receive Truthful Completion Evidence (Priority: P1)

As a platform engineer, I receive a versioned completion record that distinguishes transport completion from verified stored-byte integrity and can be retained as evidence of what happened.

**Why this priority**: A manifest that remains pending after remote completion cannot prove that a source-of-truth artifact was stored or verified.

**Independent Test**: Complete uploads using transports that return verified and unverified outcomes, then confirm each session exposes one immutable completion record with the correct status, source identity, receipt summary, transport identity, and timestamps.

**Acceptance Scenarios**:

1. **Given** a transport completes and independently verifies stored bytes against the original checksum, **When** the session finishes, **Then** completion evidence reports `verified` with matching source and stored checksums.
2. **Given** a transport completes without stored-byte verification, **When** the session finishes, **Then** completion evidence reports `completed-unverified` and never implies byte-level verification.
3. **Given** transport completion fails, **When** the session terminates, **Then** no successful completion evidence is exposed.
4. **Given** a successful upload through an existing custom transport that returns no completion details, **When** the session finishes, **Then** existing completion behavior remains usable and new evidence truthfully reports an unverified completion.

---

### User Story 3 - Preserve Provider Integrity Evidence (Priority: P2)

As a transport adapter author, I can return provider-native checksum and storage verification evidence through the common transport contract without placing provider behavior in core.

**Why this priority**: Provider-native verification is stronger than treating an HTTP success response or multipart ETag as universal proof of source-byte integrity.

**Independent Test**: Use fake custom, S3-compatible, tus-compatible, and NAS-backed paths that return valid, missing, mismatched, and unsupported integrity evidence, then confirm core classifies completion accurately and retains only safe normalized fields.

**Acceptance Scenarios**:

1. **Given** a transport returns a supported stored-object checksum matching the source checksum, **When** completion evidence is created, **Then** it is classified as verified.
2. **Given** a transport returns a checksum using a different algorithm or no checksum, **When** completion evidence is created, **Then** it remains completed but unverified unless equivalent verification is explicitly supplied.
3. **Given** a transport returns a checksum that conflicts with the source checksum for the same algorithm, **When** completion is reconciled, **Then** the session fails with a typed integrity error and does not emit successful evidence.
4. **Given** provider-specific opaque details, **When** core produces completion evidence or safe diagnostics, **Then** those details remain adapter-owned and sensitive values are not exposed by default.

---

### User Story 4 - Consume Stable Versioned Artifacts (Priority: P2)

As a long-lived SDK consumer, I can validate manifests, resume records, and completion evidence against published schemas and identify the exact library version that produced them.

**Why this priority**: Commercial integrations need durable data contracts, compatibility fixtures, and reliable producer attribution across upgrades.

**Independent Test**: Validate representative current and supported legacy artifacts, reject malformed or unsupported artifacts with typed results, and confirm the producer version equals the installed package version.

**Acceptance Scenarios**:

1. **Given** an artifact produced by the current package, **When** it is inspected, **Then** its producer version matches the published package version exactly.
2. **Given** a public artifact schema, **When** a consumer validates documented fixtures, **Then** valid fixtures pass and malformed fixtures fail at the documented field.
3. **Given** a supported legacy manifest or resume record, **When** it is read after upgrade, **Then** it is either safely accepted or rejected with an explicit migration reason.
4. **Given** a public schema or artifact contract change, **When** the package is prepared for release, **Then** compatibility fixtures, documentation, and public type tests detect unreviewed drift.

---

### User Story 5 - Operate Without Leaking Evidence Data (Priority: P3)

As an operator, I can summarize completion outcomes for logs, telemetry, and support without exposing source metadata, storage locations, remote identifiers, provider payloads, or full evidence records.

**Why this priority**: Evidence records sit close to customer data and storage identities, so observability must remain safe by default.

**Independent Test**: Pass verified, unverified, and failed completion fixtures containing sensitive values through diagnostic helpers and confirm only stable IDs, status, algorithms, counts, timestamps, and typed codes remain.

**Acceptance Scenarios**:

1. **Given** completion evidence containing customer and storage context, **When** a safe summary is created, **Then** no filename, customer metadata, raw location, upload identifier, provider payload, or checksum value appears.
2. **Given** a checksum conflict, **When** a safe error summary is created, **Then** the typed failure code and algorithms remain visible while checksum values remain redacted.
3. **Given** existing event and snapshot diagnostics, **When** completion evidence support is added, **Then** their current redaction guarantees remain unchanged.

### Edge Cases

- A source checksum is present in the manifest but missing from a legacy resume record identity.
- A resume record claims a content identity that conflicts with its embedded manifest.
- A selected file changes while its checksum is being calculated or between validation and chunk slicing.
- A transport reports verification for a different algorithm than the source checksum.
- A transport reports a matching checksum but a different byte size.
- Remote completion succeeds but creating or observing local completion evidence encounters a callback failure.
- Resume-store cleanup fails after verified remote completion.
- Completion is called again after a process loses local state at the completion boundary.
- A schema fixture contains unknown additive fields versus an unsupported schema version.
- Sensitive storage hints or opaque provider fields are nested inside completion details.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Persistent resume MUST bind the selected source to trustworthy byte-content identity rather than metadata-only identity.
- **FR-002**: Content identity validation MUST finish before remote resume lookup, chunk skipping, chunk upload, transport completion, abort, or other transport mutation.
- **FR-003**: A content mismatch MUST produce a typed, non-retryable error that does not expose checksum values or sensitive resume contents by default.
- **FR-004**: New persistent resume records MUST store a versioned content identity derived from the original bytes and MUST remain separate from the final completion evidence.
- **FR-005**: Persistent resume requested without trustworthy content identity MUST fail safely; it MUST NOT silently downgrade to metadata-only matching.
- **FR-006**: Supported legacy records MUST be accepted only when equivalent trustworthy content identity can be established without fabricating evidence.
- **FR-007**: Content validation, resume processing, and evidence generation MUST NOT decode, rewrite, resize, recompress, strip metadata from, or otherwise mutate the original source.
- **FR-008**: A successful transport completion MUST create exactly one versioned completion evidence record for the session.
- **FR-009**: Completion evidence MUST include stable evidence identity, manifest identity, exact producer version, source size, available source checksum identity, completion status, transport name, acknowledged chunk count, a deterministic receipt-set digest, and completion timestamps. Evidence produced from an explicitly checksum-disabled source MUST remain `completed-unverified`.
- **FR-010**: Completion evidence MUST distinguish `verified` from `completed-unverified`; absence of stored-byte proof MUST never be represented as verified.
- **FR-011**: `verified` status MUST require equivalent source and stored-byte identities plus matching byte size, or an adapter-provided verification result with equivalent guarantees.
- **FR-012**: Conflicting provider integrity evidence for the same algorithm MUST fail completion with a typed, non-retryable integrity error and MUST NOT produce successful completion evidence.
- **FR-013**: Existing custom transports that return no completion details MUST remain source-compatible and produce truthful `completed-unverified` evidence.
- **FR-014**: The transport contract MUST allow adapters to return normalized completion, storage, checksum, and verification evidence without adding provider-specific behavior to core.
- **FR-015**: Provider-specific opaque values MUST remain adapter-owned and MUST NOT be required in the common completion evidence schema.
- **FR-016**: Manifests, new resume records, and completion evidence MUST identify the exact library version that produced them.
- **FR-017**: Public schemas for the current manifest, resume record, and completion evidence MUST be versioned, shipped with the package, and covered by valid, malformed, and compatibility fixtures.
- **FR-018**: Unsupported artifact schema versions and unsafe legacy records MUST fail with typed migration or schema errors before state mutation.
- **FR-019**: Existing manifest v1, supported resume v0.1/v0.2 inputs, public package entrypoints, ESM/CommonJS consumption, and successful custom transport behavior MUST remain compatible unless a record lacks evidence required for safe resume.
- **FR-020**: Completion evidence MUST be observable through the session API and typed completion event without requiring consumers to log or persist the full record.
- **FR-021**: Safe completion summaries MUST expose only stable IDs, status, algorithms, counts, timestamps, and typed codes while redacting filenames, metadata, checksum values, upload identifiers, storage locations, and opaque provider details.
- **FR-022**: Observer and resume-store cleanup failures after successful remote completion MUST NOT rewrite a verified or unverified successful remote outcome as a transport failure.
- **FR-023**: Documentation MUST explain intent manifests versus completion evidence, strict resume identity, verified versus unverified completion, legacy record behavior, sensitive-data responsibilities, and migration guidance.
- **FR-024**: Focused tests MUST cover adversarial same-metadata files, legacy records, provider checksum outcomes, deterministic evidence generation, redaction, compatibility, and original preservation.

### Key Entities

- **Content Identity**: A versioned identity derived from the original byte content and used to decide whether acknowledged upload progress belongs to a reselected source.
- **Completion Evidence**: An immutable, versioned account of transport completion and verification truth for one ingest manifest.
- **Completion Status**: Either `verified`, meaning stored-byte identity is proven equivalent to the source, or `completed-unverified`, meaning transport completion succeeded without equivalent proof.
- **Receipt-Set Digest**: A deterministic identity of the normalized acknowledged chunk receipts included in completion.
- **Transport Completion Result**: Adapter-provided normalized completion facts, optional storage identity, and optional stored-byte verification evidence.
- **Artifact Schema**: A shipped, versioned validation contract for manifests, resume records, or completion evidence.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of adversarial resume fixtures whose metadata matches but bytes differ are rejected before any transport call or acknowledged-chunk skip.
- **SC-002**: 100% of matching-source persistent resume scenarios continue without retransmitting acknowledged chunks.
- **SC-003**: Every successful completion scenario produces exactly one schema-valid completion evidence record with the installed package version and a deterministic receipt-set digest.
- **SC-004**: 100% of stored checksum mismatches and stored-size mismatches prevent verified or unverified successful evidence from being emitted.
- **SC-005**: 100% of completion scenarios without equivalent stored-byte proof are labeled `completed-unverified`, with zero false `verified` outcomes in covered fixtures.
- **SC-006**: Public schema fixtures cover the current manifest, current resume record, completion evidence, supported legacy resume records, malformed inputs, and unsupported versions with deterministic pass or typed failure outcomes.
- **SC-007**: Safe diagnostic fixtures expose zero filenames, customer metadata values, checksum values, upload identifiers, storage locations, resume handles, or opaque provider values.
- **SC-008**: Existing public package consumption checks, supported legacy fixtures, type checks, default tests, integration harness, reference run, and build all continue to pass.
- **SC-009**: Release documentation includes one strict-resume example, one verified completion example, one unverified completion example, and one legacy-record migration example.
- **SC-010**: Original-preservation tests confirm byte-for-byte source equality before and after content validation, resume, provider evidence handling, and completion evidence generation in all covered transports.

## Assumptions

- Whole-file SHA-256 is the initial trustworthy content identity because current manifests calculate it by default and existing verification utilities support it.
- Persistent resume with checksum calculation explicitly disabled is rejected rather than treated as safe.
- Existing resume v0.1 and v0.2 records may remain readable, but progressed records without a trustworthy source checksum are not safely resumable.
- Completion evidence is returned and observed by the SDK; durable storage, signing, retention, and external audit policy remain application-owned.
- Existing non-resumable uploads with checksum calculation explicitly disabled remain supported, but their completion evidence cannot be classified as `verified`.
- A matching multipart ETag alone is not treated as equivalent whole-file verification.
- Provider-specific checksum calculation and server verification remain transport or broker responsibilities; core normalizes and classifies the returned facts.
- The feature does not add parallel upload scheduling, multi-file queues, styled UI, image decoding, derivative generation, or new cloud providers.
- The feature is released as a backward-compatible minor release with explicit migration notes for newly rejected unsafe resume records.
