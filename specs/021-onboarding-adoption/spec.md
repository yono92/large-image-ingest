# Feature Specification: Executable Onboarding And Adoption Validation

**Feature Branch**: `codex/onboarding-adoption`
**Created**: 2026-10-07
**Status**: Implemented and locally verified; external observations pending
**Input**: Apply a runnable minimum upload, working server/storage workflow examples, and external developer/adoption validation.

## User Scenarios & Testing

### User Story 1 - First successful upload (Priority: P1)

A developer follows the first README instructions and runs one original-preserving upload without providing undefined adapters or cloud credentials.

**Independent Test**: Execute the published-package-compatible example through real local HTTP and independently verify stored bytes.
**Acceptance Scenarios**:
1. Given an installed package and supported runtime, running the documented example uploads a supplied fixture, preserves its bytes and verifies its checksum.
2. Given a project with an existing upload endpoint, the introductory snippet identifies the only required transport configuration and distinguishes transfer completion from stored verification.

### User Story 2 - Complete verified workflow (Priority: P2)

A developer runs a complete example with working transfer, stored verification, recovery storage, checkpoint storage and immutable evidence persistence.

**Independent Test**: Run the workflow to persisted evidence and reconstruct its filesystem adapters to read that evidence and its checkpoint.
**Acceptance Scenarios**:
1. Given the local server, the workflow evaluates honestly labelled fixture metadata, uploads original bytes, independently verifies them and persists evidence.
2. Given paused acknowledged progress, replacement client/store instances recover without accepting a different original or retransmitting accepted bytes.
3. Given conflicting checkpoint revisions or changed content for an existing evidence revision, the example storage rejects the conflicting write.

### User Story 3 - Observe real adoption (Priority: P3)

A maintainer records actual first-time developer trials and known project observations, then obtains a summary whose limits are explicit.

**Independent Test**: Summarize records with failed trials, repeated projects and an empty collection.
**Acceptance Scenarios**:
1. Given external first-time trials, the report includes successes, blockers, abandonment and help received; maintainer/automation trials remain separate.
2. Given repeated observations of the same project, only its latest observation determines known active status, with evidence strength retained.
3. Given no observations, actual adoption is unknown; neither fixtures nor npm downloads count as confirmed projects.

### Edge Cases

- HTTP failure or corrupted stored bytes must not produce verified success.
- Path-like IDs must not escape storage directories; persisted private records must not appear in default output.
- Invalid or duplicate trial records fail validation, without echoing sensitive input.
- Existing example server authority is process-local: server restart is outside this example's recovery claim.
- The example storage has one process owner; multi-process deployment needs transactional storage.
- External participants are not available automatically; prepare the evaluation and record real observations only when they occur.

## Requirements

### Functional Requirements

- **FR-001**: First instructions MUST offer a complete executable minimal upload without undefined application adapters.
- **FR-002**: Examples MUST use public package entrypoints, preserve originals, retain default whole-file checksums and verify stored bytes.
- **FR-003**: The full example MUST supply functioning resume, checkpoint, verifier and evidence adapters with durable filesystem records.
- **FR-004**: Storage MUST reject stale checkpoint revisions and conflicting immutable evidence writes; stable repeat writes MUST reconcile.
- **FR-005**: Recovery claims MUST match verified behavior and explicitly bound server lifetime and storage concurrency.
- **FR-006**: Documentation MUST separate minimal transfer, persistent recovery and complete verified workflow stages.
- **FR-007**: Trial records MUST distinguish participant kind, first-time status, assistance, journey, outcome, duration and bounded blocker codes.
- **FR-008**: Project records MUST use stable pseudonymous IDs, observation dates, evaluating/active/discontinued status and evidence strength; examples and tests MUST be excluded.
- **FR-009**: Reporting MUST deduplicate projects, preserve unsuccessful trials and report empty observation collections as unknown actual adoption.
- **FR-010**: Observation collection MUST be explicit, local and separate from SDK runtime; default output MUST omit personal/customer data and raw records.
- **FR-011**: Meaningful tests MUST cover executable upload/workflow, recovery, storage conflicts, report counting and invalid input; standard package checks MUST pass.

### Key Entities

- Original: immutable source bytes with manifest checksum.
- Workflow persistence: private resume record, safe checkpoint and immutable evidence revision.
- Developer trial: pseudonymous participant/journey outcome, assistance and blockers.
- Project observation: dated evidence about one known project, separate from downloads.

## Success Criteria

- **SC-001**: Both documented commands finish successfully in a clean package consumer with no cloud credentials.
- **SC-002**: Stored bytes and checksums match; evidence remains readable through reconstructed storage adapters.
- **SC-003**: Conflict and recovery scenarios retain correct authority without claiming server crash recovery.
- **SC-004**: Reports correctly distinguish empty observations, unique known projects and external first-time trials.
- **SC-005**: A repeatable evaluation protocol can capture first-success time, assistance and blockers without fabricating external participants.

## Assumptions

- Node.js 20+ is the initial executable onboarding environment; existing browser/React guides remain available.
- Existing public SDK contracts are sufficient; no core API change is needed. Release packaging uses patch version 1.8.1.
- Reference storage is single-process and the HTTP server remains running during client recovery.
- A valid generated TIFF fixture supplies known, caller-supplied structural metadata; arbitrary input metadata is never invented.
- Maintainer smoke observations do not establish external developer usability or actual adoption.

## Release Preparation

Version 1.8.1 packages the executable examples, documentation and maintainer observation tools without changing public API contracts. Package metadata, embedded manifest producer version and version assertions are synchronized. The README starts with commands runnable from an installed package. Both CI and the publish gate verify the packed examples.

## Clarifications

### Session 2026-10-07

- Scope, privacy, persistence authority and validation criteria were resolved from approved recommendations and existing contracts; no critical ambiguities require a question.
