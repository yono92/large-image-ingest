# Tasks: Persistent Resumable Upload

**Input**: Design documents from `/specs/001-persistent-resumable-upload/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests are required by the feature spec and constitution because resume correctness is safety-critical for large inspection artifacts.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files or has no dependency on incomplete tasks.
- **[Story]**: Maps the task to the user story from `spec.md`.
- Every task names the target file path.

## Phase 1: Setup

**Purpose**: Establish shared test fixtures and current-feature exports before story work.

- [X] T001 [P] Create fake resume store and fake transport test fixtures in `tests/resume-fixtures.ts`
- [X] T002 [P] Add resume feature export placeholders from `src/index.ts`

---

## Phase 2: Foundational

**Purpose**: Shared contracts and helpers that block all user stories.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Add resume record, file identity, chunking identity, progress, cleanup policy, and conflict code types in `src/types.ts`
- [X] T004 Add upload session result, upload chunk result, resume session context, and optional transport resume contract types in `src/types.ts`
- [X] T005 [P] Implement completed chunk range merge and lookup helpers in `src/resume.ts`
- [X] T006 [P] Implement file identity and chunking identity comparison helpers in `src/resume.ts`
- [X] T007 [P] Implement resume record status and recoverability helpers in `src/resume.ts`
- [X] T008 [P] Implement small Web Storage resume store adapter in `src/web-storage-resume-store.ts`
- [X] T009 Extend manifest creation to accept stored manifest identity for resumed sessions in `src/manifest.ts`
- [X] T010 Export resume helpers and web storage adapter from `src/index.ts`

**Checkpoint**: Resume contracts, identity helpers, and store adapter exist.

---

## Phase 3: User Story 1 - Resume After Interruption (Priority: P1) MVP

**Goal**: A stopped upload can resume with the same file and stored record without re-uploading completed chunks.

**Independent Test**: Upload two chunks with a fake transport, stop, recreate the session, resume with the stored record ID, and verify upload starts at the first incomplete chunk.

### Tests for User Story 1

- [X] T011 [P] [US1] Add interrupted upload resume test in `tests/session-resume.test.ts`
- [X] T012 [P] [US1] Add resumed manifest identity preservation test in `tests/session-resume.test.ts`
- [X] T013 [P] [US1] Add completion cleanup policy test in `tests/session-resume.test.ts`

### Implementation for User Story 1

- [X] T014 [US1] Persist initial resume record after transport session creation in `src/session.ts`
- [X] T015 [US1] Add explicit `resume(recordId)` orchestration in `src/session.ts`
- [X] T016 [US1] Skip completed chunk ranges and continue at `nextChunkIndex` in `src/session.ts`
- [X] T017 [US1] Delete completed records by default after successful completion in `src/session.ts`

**Checkpoint**: P1 is independently functional and demonstrates the persistent resume MVP.

---

## Phase 4: User Story 2 - Persist Reliable Checkpoints (Priority: P2)

**Goal**: Checkpoints advance only after confirmed chunk success, and pause leaves a recoverable record.

**Independent Test**: Use a fake transport that fails before acknowledging a chunk and verify the failed chunk remains incomplete in the store.

### Tests for User Story 2

- [X] T018 [P] [US2] Add successful chunk checkpoint persistence test in `tests/session-resume.test.ts`
- [X] T019 [P] [US2] Add failed chunk does not advance checkpoint test in `tests/session-resume.test.ts`
- [X] T020 [P] [US2] Add pause leaves recoverable record test in `tests/session-resume.test.ts`
- [X] T021 [P] [US2] Add cancel prevents default recovery test in `tests/session-resume.test.ts`

### Implementation for User Story 2

- [X] T022 [US2] Update resume record only after successful chunk upload in `src/session.ts`
- [X] T023 [US2] Merge completed chunk ranges and uploaded byte counts during checkpoint writes in `src/session.ts`
- [X] T024 [US2] Add pause request handling that settles the active chunk and stores paused status in `src/session.ts`
- [X] T025 [US2] Add cancel handling that prevents default recovery in `src/session.ts`

**Checkpoint**: Checkpoint safety and pause recovery behavior are independently testable.

---

## Phase 5: User Story 3 - Validate Transport Resume State (Priority: P3)

**Goal**: The active transport validates remote resume state before the core skips local chunks.

**Independent Test**: Use one fake transport with `resumeSession` and one without it; verify only the validating transport can resume.

### Tests for User Story 3

- [X] T026 [P] [US3] Add transport without resume support conflict test in `tests/session-resume.test.ts`
- [X] T027 [P] [US3] Add expired resume handle conflict test in `tests/session-resume.test.ts`
- [X] T028 [P] [US3] Add remote resume validation success test in `tests/session-resume.test.ts`

### Implementation for User Story 3

- [X] T029 [US3] Require transport `resumeSession` before persistent resume skips chunks in `src/session.ts`
- [X] T030 [US3] Refresh transport resume metadata from `resumeSession` results in `src/session.ts`
- [X] T031 [US3] Emit typed resume conflict events or errors for unsupported, expired, and transport mismatch states in `src/session.ts`

**Checkpoint**: Remote resume validation protects against stale local checkpoints.

---

## Phase 6: User Story 4 - Surface Recoverable Sessions (Priority: P4)

**Goal**: Applications can list safe recovery choices and distinguish compatible, incompatible, terminal, and expired records.

**Independent Test**: Seed a resume store with active, paused, failed, completed, canceled, expired, compatible, and incompatible records and verify default listing behavior.

### Tests for User Story 4

- [X] T032 [P] [US4] Add recoverable record filtering test in `tests/resume.test.ts`
- [X] T033 [P] [US4] Add selected-file compatibility classification test in `tests/resume.test.ts`
- [X] T034 [P] [US4] Add Web Storage resume store round-trip test in `tests/web-storage-resume-store.test.ts`

### Implementation for User Story 4

- [X] T035 [US4] Implement recoverable record filtering helpers in `src/resume.ts`
- [X] T036 [US4] Implement selected-file compatibility classification helpers in `src/resume.ts`
- [X] T037 [US4] Complete Web Storage resume store list/get/put/delete behavior in `src/web-storage-resume-store.ts`

**Checkpoint**: UI-facing recovery lists are safe by default.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, compatibility, and package verification.

- [X] T038 [P] Update README persistent resume examples and retry-vs-resume explanation in `README.md`
- [X] T039 [P] Document resume record security considerations in `README.md`
- [X] T040 [P] Update public API examples in `specs/001-persistent-resumable-upload/contracts/resume-contracts.md`
- [X] T041 Run `npm run typecheck`
- [X] T042 Run `npm test`
- [X] T043 Run `npm run build`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories.
- **US1 (Phase 3)**: Depends on Foundational; delivers MVP.
- **US2 (Phase 4)**: Depends on Foundational and can follow US1 session scaffolding.
- **US3 (Phase 5)**: Depends on Foundational and US1 resume flow.
- **US4 (Phase 6)**: Depends on Foundational helpers; can proceed after range/status helpers exist.
- **Polish (Phase 7)**: Depends on desired user stories.

### User Story Dependencies

- **US1**: No dependency on other stories after Foundational.
- **US2**: Builds on US1 session checkpoint creation.
- **US3**: Builds on US1 resume orchestration.
- **US4**: Can be developed in parallel with US2/US3 after Foundational helper types exist.

### Within Each User Story

- Tests must be written before implementation tasks.
- Public types and helpers must exist before session orchestration uses them.
- Story checkpoint must pass before moving to the next priority when working sequentially.

## Parallel Opportunities

- T001 and T002 can run in parallel.
- T005, T006, T007, and T008 can run in parallel after T003 and T004 are drafted.
- Test tasks within each user story can run in parallel.
- US4 helper work can proceed while US2 and US3 session behavior is implemented, once foundational helpers are available.

## Parallel Example: User Story 1

```bash
Task: "T011 [P] [US1] Add interrupted upload resume test in tests/session-resume.test.ts"
Task: "T012 [P] [US1] Add resumed manifest identity preservation test in tests/session-resume.test.ts"
Task: "T013 [P] [US1] Add completion cleanup policy test in tests/session-resume.test.ts"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 only.
3. Validate that a fake interrupted upload resumes from the first incomplete chunk.
4. Stop and review public contracts before adding pause, transport validation, and listing helpers.

### Incremental Delivery

1. Deliver US1 for durable resume.
2. Add US2 for checkpoint safety and pause behavior.
3. Add US3 for remote transport validation.
4. Add US4 for UI-facing recoverable session discovery.
5. Finish README and package checks.

## Notes

- Default tests must not require cloud credentials or network services.
- Preserve the original file and never persist original bytes in resume records.
- Treat transport resume handles and metadata as sensitive.
