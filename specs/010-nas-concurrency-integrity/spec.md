# Feature Specification: NAS Concurrency Integrity

**Feature Branch**: `agent/nas-concurrency-integrity`

**Created**: 2026-07-16

**Status**: Implemented

**Input**: User description: "Prepare version 1.3.1 by serializing same-session NAS staging, finalization, and cancellation across gateway instances; preserve the last valid metadata state with atomic updates; clean temporary metadata; add concurrency regression coverage; update release documentation; preserve the existing public API and NAS session schema."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preserve Concurrent Chunk Progress (Priority: P1)

As a server operator, I can accept multiple chunk staging requests for the same NAS upload session without losing already acknowledged chunk records or producing metadata that disagrees with staged bytes.

**Why this priority**: Lost chunk records can make a complete source appear incomplete and can prevent safe finalization of high-value inspection artifacts.

**Independent Test**: Stage 16 distinct chunks concurrently through more than one gateway instance, then confirm that the session records all 16 chunks exactly once and finalizes to the expected byte sequence.

**Acceptance Scenarios**:

1. **Given** an open NAS session, **When** 16 distinct chunks are staged concurrently, **Then** all 16 acknowledged chunks remain present in the session state.
2. **Given** two gateway instances sharing the same staging root, **When** they stage chunks for one session concurrently, **Then** neither instance overwrites progress committed by the other.
3. **Given** concurrent writes for the same chunk index, **When** both operations complete, **Then** session metadata and the stored chunk bytes describe the same successfully committed operation.

---

### User Story 2 - Resolve Lifecycle Races Safely (Priority: P1)

As a server operator, I can finalize or cancel a NAS session while another request is attempting to stage a chunk, and the session reaches one valid, explainable outcome without partial lifecycle state.

**Why this priority**: Finalization and cancellation are irreversible boundaries; racing writes must not silently mutate a completed target or resurrect canceled progress.

**Independent Test**: Race staging against finalization and cancellation repeatedly and confirm each run ends in a valid terminal or staging state with no unrecorded accepted bytes, no target overwrite, and no post-terminal mutation.

**Acceptance Scenarios**:

1. **Given** a stage request and a finalization request for one session, **When** they overlap, **Then** one operation is ordered before the other and finalization only uses committed session state.
2. **Given** a stage request and a cancellation request for one session, **When** they overlap, **Then** cancellation cannot leave acknowledged progress that is absent from the last valid session state.
3. **Given** a finalized or canceled session, **When** a later stage request arrives, **Then** the request is rejected using existing public error contracts.

---

### User Story 3 - Recover From Interrupted Metadata Updates (Priority: P2)

As a server operator, I retain the last complete NAS session state when a metadata update is interrupted, and temporary update artifacts do not accumulate indefinitely.

**Why this priority**: A process or filesystem failure during metadata persistence must not replace recoverable session state with truncated or invalid data.

**Independent Test**: Inject failures before and during metadata promotion, reopen the session, and confirm that the previous valid state is readable and abandoned temporary artifacts are removed safely.

**Acceptance Scenarios**:

1. **Given** a valid session state, **When** a later metadata update fails before commitment, **Then** the previous valid state remains readable.
2. **Given** abandoned temporary metadata artifacts, **When** the session is read, mutated, or cleaned, **Then** safe stale artifacts are removed without deleting the committed session state.
3. **Given** a successful metadata update, **When** it is read by another gateway instance, **Then** it observes one complete state rather than partial serialized data.

### Edge Cases

- Two gateway instances stage different chunk indexes at the same instant.
- Two requests stage the same index with identical or different bytes.
- A stage operation overlaps finalization after the last required chunk arrives.
- A stage operation overlaps cancellation or expired-session cleanup.
- A process fails after temporary metadata is complete but before it becomes committed.
- A process fails after metadata commitment but before temporary artifact cleanup.
- A stale coordination artifact remains after an earlier process terminates.
- Metadata storage and the final target reside on filesystems with different rename guarantees.
- A session is read while another gateway instance is committing an update.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Mutating operations for one NAS session MUST have a single observable order even when invoked concurrently.
- **FR-002**: Coordination MUST apply across gateway instances that share the same staging root, not only within one in-memory object.
- **FR-003**: Concurrent staging of distinct acknowledged chunks MUST retain every committed chunk record exactly once.
- **FR-004**: A committed chunk record MUST describe the bytes stored for the same chunk index.
- **FR-005**: Concurrent writes to the same chunk index MUST preserve existing replacement behavior while keeping stored bytes and metadata consistent with the last successfully committed operation.
- **FR-006**: Finalization MUST operate only on a complete committed session state and MUST exclude overlapping staging or cancellation mutations for that session.
- **FR-007**: Cancellation MUST exclude overlapping staging or finalization mutations and MUST NOT allow a later operation to recreate canceled session state.
- **FR-008**: Interrupted metadata updates MUST leave the last committed session state readable and valid.
- **FR-009**: Successful metadata updates MUST become visible as a complete state rather than partially serialized content.
- **FR-010**: Temporary metadata and coordination artifacts MUST use collision-resistant identities and MUST be removed after success or when safely recognized as stale.
- **FR-011**: Cleanup MUST NOT delete a live session update or the last committed metadata state.
- **FR-012**: Original source artifacts and finalized target bytes MUST remain unchanged by metadata coordination behavior.
- **FR-013**: The change MUST preserve existing exported function signatures, public TypeScript types, typed error codes, and NAS session schema version.
- **FR-014**: The change MUST NOT add runtime dependencies, credentials, sensitive logging, or provider-specific behavior.
- **FR-015**: Release documentation MUST identify the concurrency integrity correction, retained compatibility, and verification coverage for version 1.3.1.

### Key Entities

- **NAS Session State**: The last committed lifecycle status, target identity, expected byte and chunk counts, user metadata, and acknowledged chunk records for one NAS upload.
- **Session Mutation**: A staging, finalization, cancellation, or cleanup action that may change one NAS session or its target.
- **Committed Metadata**: The complete session state that readers and later mutations are allowed to observe.
- **Temporary Metadata Artifact**: An uncommitted candidate state that may be promoted or safely removed but must never be treated as committed session state.
- **Session Coordination Artifact**: State used to order mutations across gateway instances sharing a staging root.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100 repeated runs, concurrently staging 16 distinct chunks records all 16 chunks exactly once and finalizes to the expected whole-file bytes.
- **SC-002**: The same concurrency scenario succeeds when requests are split across at least two gateway instances sharing one staging root.
- **SC-003**: Repeated stage-versus-finalize and stage-versus-cancel races produce no partial metadata, target overwrite, post-terminal mutation, or unrecorded acknowledged chunk.
- **SC-004**: Every injected pre-commit metadata failure leaves the previous committed session state readable and schema-valid.
- **SC-005**: Successful and failed test runs leave no stale temporary metadata artifacts after safe cleanup.
- **SC-006**: Existing NAS session documents remain readable without migration, and all existing public package consumption tests continue to pass unchanged.
- **SC-007**: Default verification remains credential-free and all type, unit, build, reference integration, and package-content checks pass for version 1.3.1.

## Assumptions

- Concurrent writes to the same chunk index retain the existing replacement semantics; the last successfully committed operation determines both bytes and metadata.
- Gateway instances that coordinate a session use the same staging root and the existing shared coordination configuration.
- Coordination artifacts may be recovered after process termination using the existing stale-artifact policy and clock controls.
- Atomic promotion is required within the staging filesystem; cross-filesystem promotion is not introduced.
- The patch does not introduce parallel chunk scheduling in the core upload session. It only makes the NAS gateway safe when callers invoke it concurrently.
- Version 1.3.0 is published before version 1.3.1 is released.

## Verification Evidence

- The real-filesystem, two-gateway, 16-chunk regression completed 100 consecutive runs on Windows with all chunks retained and every finalized target byte-exact.
- The default focused NAS suite runs 10 iterations for routine feedback and supports `LII_NAS_CONCURRENCY_RUNS=100` for the release stress gate.
- Version 1.3.1 passed TypeScript and example type checks, 144 tests, ESM/CJS build and consumption checks, the 64 MiB reference benchmark, npm audit, and npm tarball inspection.
- No platform limitation was observed in the exercised Windows filesystem environment; deployment still requires the documented shared-root and same-directory atomic-rename guarantees.
