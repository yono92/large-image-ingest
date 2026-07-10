# Feature Specification: Resume Integrity Hardening

**Feature Branch**: `main`

**Created**: 2026-07-10

**Status**: Implemented

**Input**: User description: "Address the architecture review findings one at a time and include the work in the 1.2.0 release, beginning with persistent resume integrity."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resume Multipart Upload After Restart (Priority: P1)

As an application developer, I can persist an interrupted multipart upload and resume it after a page refresh, process restart, or new session without re-uploading already acknowledged parts or losing the completion evidence required by the storage provider.

**Why this priority**: Current multipart snapshot resume works within caller-managed state, but the built-in persistent resume path cannot recover the durable part receipts needed to finish the upload.

**Independent Test**: Interrupt a multipart upload after at least one acknowledged part, discard all in-memory session state, load the persisted record in a new session, resume the remaining parts, and complete with the original ordered receipts plus the newly acknowledged receipts.

**Acceptance Scenarios**:

1. **Given** a multipart upload with persisted acknowledged part receipts, **When** a new session resumes the record, **Then** acknowledged parts are skipped and all required completion receipts are supplied in deterministic order.
2. **Given** a persisted multipart record missing provider-required completion evidence, **When** resume is attempted, **Then** the SDK stops before uploading and returns a typed non-retryable conflict instead of fabricating receipts.
3. **Given** an interrupted sequential-offset upload, **When** it resumes under the same record contract, **Then** its existing remote-offset reconciliation behavior remains unchanged.

---

### User Story 2 - Reject Corrupt Or Untrusted Resume State (Priority: P1)

As a security and reliability reviewer, I can rely on persisted resume state being validated before it influences chunk skipping, iteration, remote calls, or completion.

**Why this priority**: Browser and application storage can be truncated, modified, stale, or populated by an older library version. Invalid ranges or receipts must not cause silent byte skipping, unbounded work, or provider calls with malformed state.

**Independent Test**: Supply malformed, unsupported, out-of-range, duplicated, inconsistent, and truncated records and verify each is rejected with a bounded typed result before any chunk upload or completion call.

**Acceptance Scenarios**:

1. **Given** malformed persisted data, **When** it is read or listed, **Then** the SDK reports a typed storage or schema conflict without exposing sensitive record contents.
2. **Given** completed ranges or receipts outside the active chunk plan, **When** resume is attempted, **Then** validation fails before iterating those ranges or calling the transport.
3. **Given** duplicate or inconsistent receipts, **When** resume is attempted, **Then** the SDK rejects the record rather than selecting one implicitly.
4. **Given** a supported older record, **When** it contains enough evidence for safe recovery, **Then** it remains usable or is migrated without changing manifest identity.
5. **Given** an older record that lacks evidence required by its transport, **When** resume is attempted, **Then** it is rejected with a typed actionable conflict.

---

### User Story 3 - Preserve Sensitive Resume Material (Priority: P2)

As an application developer, I can persist the minimum provider state needed for recovery without having sensitive URLs, tokens, customer metadata, or full records appear in default events and diagnostics.

**Why this priority**: Stronger resume state adds more provider evidence, so redaction guarantees must remain explicit and testable.

**Independent Test**: Persist a record containing provider receipts, remote identifiers, opaque data, and customer metadata, then inspect default events and safe summaries to confirm sensitive values are absent.

**Acceptance Scenarios**:

1. **Given** a record containing provider completion evidence, **When** default events and safe summaries are emitted, **Then** sensitive values are omitted while stable IDs, progress, and typed codes remain observable.
2. **Given** a caller-owned persistence callback, **When** the full record is provided for storage, **Then** documentation clearly identifies its sensitivity and the caller controls its storage policy.

### Edge Cases

- A record is valid JSON but has an unsupported schema version.
- A record contains negative, non-integer, overlapping, reversed, duplicated, or out-of-range chunk indexes.
- Persisted uploaded byte totals disagree with completed ranges or receipt sizes.
- Transport name, upload ID, part number base, or receipt transport name disagrees with the active transport.
- A multipart receipt is missing its part number, completion token, or required checksum.
- A storage write succeeds remotely but the local checkpoint write fails.
- A legacy record contains progress but no durable receipts.
- Default diagnostics are produced from a rejected record containing secrets.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The SDK MUST persist the durable receipt for every acknowledged chunk when persistent resume is enabled.
- **FR-002**: Persisted receipts MUST retain the provider completion evidence needed by the active transport while remaining separate from the final manifest.
- **FR-003**: The SDK MUST restore persisted receipts exactly and MUST NOT fabricate provider receipt fields during resume.
- **FR-004**: Multipart resume MUST work from a persistent record after all in-memory and caller-managed snapshot state has been discarded.
- **FR-005**: The SDK MUST validate persisted record structure, schema version, file identity, chunking identity, transport identity, lifecycle status, progress totals, completed ranges, and receipts before using the record.
- **FR-006**: Validation MUST reject invalid record state before chunk skipping, unbounded range iteration, transport resume, chunk upload, or transport completion.
- **FR-007**: Record parsing and validation failures MUST use typed error codes and MUST NOT include sensitive record values in default messages or events.
- **FR-008**: The 1.2.0 reader MUST recognize records produced by supported 1.x releases and MUST reject legacy records safely when required recovery evidence cannot be established.
- **FR-009**: A rejected record MUST remain available for application-directed inspection or cleanup unless the application explicitly deletes it.
- **FR-010**: Default events, redacted snapshots, and safe summaries MUST omit full manifests, customer metadata, resume tokens, presigned locations, opaque provider data, and sensitive receipt fields.
- **FR-011**: Resume records and manifests MUST remain versioned, and schema evolution MUST preserve manifest identity and original preservation guarantees.
- **FR-012**: Existing sequential-offset resume behavior, custom transport support, snapshot resume, and source-compatible 1.x public entrypoints MUST remain functional.
- **FR-013**: The public transport capability contract MUST distinguish in-process retry, caller-managed snapshot resume, and durable persistent resume support.
- **FR-014**: The original file MUST never be resized, decoded-and-rewritten, recompressed, metadata-stripped, or otherwise mutated by resume processing.
- **FR-015**: The 1.2.0 documentation MUST describe persistent multipart resume, legacy-record handling, sensitive storage responsibilities, and migration behavior.

### Key Entities

- **Resume Record**: Versioned operational state containing manifest identity, source-file identity, chunking identity, transport state, acknowledged receipts, progress, lifecycle status, concurrency metadata, and timestamps.
- **Durable Chunk Receipt**: Evidence that one chunk was accepted, including its chunk identity, size, completion time, checksum when available, and transport-specific completion fields.
- **Legacy Resume Record**: A record produced by a supported earlier release that may require validation, migration, restricted recovery, or typed rejection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A multipart upload interrupted after any acknowledged part can be resumed in a new process and completed without re-uploading acknowledged parts in all supported test scenarios.
- **SC-002**: 100% of malformed, unsupported, out-of-range, duplicated, and internally inconsistent resume fixtures are rejected before any transport mutation.
- **SC-003**: Resume validation completes in time proportional to the number of planned chunks and receipts and does not iterate beyond the active chunk count for malformed input.
- **SC-004**: Safe event and diagnostic fixtures expose zero resume tokens, presigned locations, customer metadata values, opaque provider data, or provider secrets.
- **SC-005**: All existing default tests, public package consumption checks, type checks, and builds continue to pass for the 1.2.0 change set.
- **SC-006**: Release documentation contains one complete persistent multipart recovery example and one legacy or invalid record recovery example before 1.2.0 publication.

## Assumptions

- Version 1.2.0 is an additive minor release; existing import paths and common custom transport implementations remain source-compatible.
- Legacy records that lack transport-required receipts cannot be made safe by inventing provider fields; typed rejection is preferable to unsafe recovery.
- Applications remain responsible for selecting an appropriately protected persistence layer for full resume records.
- Provider-side completion and local cleanup reconciliation are deferred to a future hardening feature.
- Content-level file identity verification and concurrent resume claims are deferred to future hardening features.
- Parallel chunk upload remains outside this feature, but the record design must not prevent a later parallel-upload specification.
