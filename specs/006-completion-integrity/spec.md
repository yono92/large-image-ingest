# Feature Specification: Completion Integrity

**Feature Branch**: `agent/sdk-1-3-0`

**Created**: 2026-07-10

**Status**: Implemented

**Input**: User description: "Harden completion integrity and include it with React headless hooks and TIFF/BigTIFF metadata probing in one 1.3.0 release."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preserve Remote Completion Truth (Priority: P1)

As an application developer, I receive a successful upload result when the transport has durably completed the upload, even if local resume-record cleanup fails afterward, and I can observe that cleanup still needs attention.

**Why this priority**: Reporting a completed remote upload as failed can trigger duplicate completion attempts, confuse recovery UI, and make the local record disagree with irreversible provider state.

**Independent Test**: Complete an upload with a resume store whose completion cleanup fails, then verify the session resolves successfully, the completed snapshot remains authoritative, and a typed cleanup warning is observable without retrying transport completion.

**Acceptance Scenarios**:

1. **Given** a transport completion succeeds and resume-record deletion fails, **When** the session finishes, **Then** the upload resolves successfully and the remaining record is marked completed when storage permits.
2. **Given** a transport completion succeeds and all local completion writes fail, **When** the session finishes, **Then** the upload still resolves successfully and exposes a typed non-fatal cleanup warning.
3. **Given** the transport completion itself fails, **When** the session finishes, **Then** existing failed-session behavior remains unchanged and no completed result is reported.

---

### User Story 2 - Isolate Observer Failures (Priority: P1)

As an application developer, an exception thrown by UI, telemetry, or snapshot observers does not change upload state, interrupt chunk processing, or turn a completed upload into a failure.

**Why this priority**: Observer code is caller-owned and must not become part of the durable upload transaction.

**Independent Test**: Configure event and snapshot observers that throw at validation, progress, and completion boundaries, then verify upload behavior and final state are identical to a session without those observers while observer failures remain reportable.

**Acceptance Scenarios**:

1. **Given** an event observer throws during validation or chunk progress, **When** upload continues, **Then** all planned chunks and transport completion still execute exactly once.
2. **Given** a snapshot observer throws after remote completion, **When** the session finishes, **Then** the session resolves with a completed snapshot.
3. **Given** an observer-failure reporter also throws, **When** an observer fails, **Then** the reporter exception is contained and upload behavior remains unchanged.

### Edge Cases

- Resume cleanup marking succeeds but deletion fails.
- Resume cleanup marking fails but deletion succeeds.
- Both completion marking and deletion fail.
- Event observers throw while a pause or cancel action is being processed.
- Snapshot observers mutate their received value before throwing.
- Observer errors contain URLs, tokens, or customer data and are summarized for diagnostics.
- The original file and completed transport receipts remain unchanged by local cleanup or observer handling.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A successful transport completion MUST remain the authoritative upload outcome regardless of subsequent resume-store cleanup failure.
- **FR-002**: The SDK MUST attempt to persist a completed resume status before destructive completion cleanup when a resume record exists.
- **FR-003**: Completion cleanup failures MUST be observable through a typed non-fatal signal without exposing sensitive record contents by default.
- **FR-004**: A completed session MUST retain a completed snapshot even when local cleanup or observers fail.
- **FR-005**: A transport completion failure MUST continue to produce the existing failed outcome and MUST NOT be downgraded to a cleanup warning.
- **FR-006**: Exceptions from event and snapshot observers MUST NOT escape into session control flow.
- **FR-007**: Applications MUST be able to observe event- and snapshot-observer failures through one optional typed observer-failure callback.
- **FR-008**: Exceptions from the observer-failure callback MUST be contained.
- **FR-009**: Observer inputs MUST remain detached or redacted according to existing snapshot and event contracts.
- **FR-010**: Existing transport, resume-record schema, manifest schema, import paths, and successful cleanup behavior MUST remain source-compatible.
- **FR-011**: The original file MUST never be decoded, rewritten, resized, recompressed, or otherwise mutated by completion reconciliation.
- **FR-012**: Public documentation and tests MUST describe remote completion truth, non-fatal cleanup warnings, and observer isolation for version 1.3.0.

### Key Entities

- **Remote Completion Outcome**: The irreversible result of the transport completion operation and the authority for session success or failure.
- **Completion Cleanup Warning**: A typed non-fatal notification that local resume state could not be fully marked or removed after remote completion.
- **Observer Failure**: A contained exception raised by caller-owned event or snapshot observation code.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In all cleanup-failure test scenarios, transport completion executes once and the session resolves successfully after remote completion.
- **SC-002**: In all observer-failure test scenarios, uploaded chunks, receipts, transport calls, and final session state match the observer-free control case.
- **SC-003**: 100% of completion cleanup failures produce a typed non-fatal signal while exposing no full manifest, resume token, presigned URL, or customer metadata through safe summaries.
- **SC-004**: Existing type checks, package-consumption checks, tests, and builds continue to pass without a resume-record or manifest schema migration.

## Assumptions

- Transport completion is the system-of-record boundary; local cleanup after that boundary is best-effort and recoverable.
- A completed record left in storage is safer than an active or failed record that invites duplicate remote completion.
- Observer callbacks are notifications rather than transaction participants.
- Content-level resume identity, concurrent resume claims, React bindings, and TIFF probing remain outside this patch feature.
