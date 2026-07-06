# Tasks: TUS Transport Adapter

**Input**: Design documents from `/specs/002-tus-transport-adapter/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests are required by the feature spec and constitution because transport and resume correctness are safety-critical for large inspection artifacts.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files or has no dependency on incomplete tasks.
- **[Story]**: Maps the task to the user story from `spec.md`.
- Every task names the target file path.

## Phase 1: Setup

**Purpose**: Establish local protocol fixtures and public export placeholders.

- [X] T001 [P] Extend in-memory TUS protocol simulator fixture in `tests/tus.test.ts`
- [X] T002 [P] Verify adapter module exists in `src/tus.ts`
- [X] T003 [P] Add TUS adapter export placeholders from `src/index.ts`

---

## Phase 2: Foundational

**Purpose**: Shared contracts and helpers that block all user stories.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Define TUS adapter option, metadata mapper, resume data, and error code types in `src/tus.ts`
- [X] T005 [P] Implement safe metadata encoding helper in `src/tus.ts`
- [X] T006 [P] Implement safe header resolution helper without logging sensitive values in `src/tus.ts`
- [X] T007 [P] Implement remote response parsing helpers for offset, length, location, and expiration in `src/tus.ts`
- [X] T008 [P] Implement typed TUS transport error class and safe details shape in `src/tus.ts`
- [X] T009 Export TUS adapter public types and factory from `src/index.ts`

**Checkpoint**: Adapter contracts, helpers, and exports exist without performing uploads.

---

## Phase 3: User Story 1 - Upload Through TUS-Compatible Transport (Priority: P1) MVP

**Goal**: A developer can configure a TUS-compatible endpoint and complete a fresh large-image upload through the existing ingest session.

**Independent Test**: Use the protocol simulator to create a remote resource, upload every planned chunk in order, and complete the existing ingest session without mutating the original file.

### Tests for User Story 1

- [X] T010 [P] [US1] Add fresh upload creation test in `tests/tus.test.ts`
- [X] T011 [P] [US1] Add sequential chunk PATCH/upload test in `tests/tus.test.ts`
- [X] T012 [P] [US1] Add completion and original-preservation test in `tests/tus.test.ts`

### Implementation for User Story 1

- [X] T013 [US1] Implement `createTusTransport()` factory returning `UploadTransport` in `src/tus.ts`
- [X] T014 [US1] Implement remote upload creation request and upload identity extraction in `src/tus.ts`
- [X] T015 [US1] Implement chunk upload request using original file slices and active chunk descriptors in `src/tus.ts`
- [X] T016 [US1] Implement successful chunk result metadata refresh in `src/tus.ts`
- [X] T017 [US1] Implement complete-session no-op or verification behavior compatible with current core session completion in `src/tus.ts`

**Checkpoint**: P1 is independently functional and proves the first real transport adapter.

---

## Phase 4: User Story 2 - Resume A Remote TUS Upload (Priority: P2)

**Goal**: Persistent resume validates remote TUS offset before completed local chunks are skipped.

**Independent Test**: Stop an upload after confirmed chunks, resume with the same file and stored record, and verify the simulator receives no duplicate completed chunks after remote offset validation succeeds.

### Tests for User Story 2

- [X] T018 [P] [US2] Add remote offset validation success test in `tests/tus.test.ts`
- [X] T019 [P] [US2] Add remote offset lower-than-local conflict test in `tests/tus.test.ts`
- [X] T020 [P] [US2] Add remote offset higher-than-local conflict test in `tests/tus.test.ts`
- [X] T021 [P] [US2] Add missing or expired remote upload conflict test in `tests/tus.test.ts`

### Implementation for User Story 2

- [X] T022 [US2] Implement `resumeSession` remote state lookup in `src/tus.ts`
- [X] T023 [US2] Calculate local checkpoint byte offset from completed chunk ranges in `src/tus.ts`
- [X] T024 [US2] Reject lower, higher, missing, and expired remote offset states before upload in `src/tus.ts`
- [X] T025 [US2] Refresh transport resume metadata after successful remote validation in `src/tus.ts`

**Checkpoint**: Remote truth protects local checkpoint skipping.

---

## Phase 5: User Story 3 - Surface TUS Transport Failures Safely (Priority: P3)

**Goal**: Applications receive actionable typed outcomes for transient and permanent TUS failures without sensitive handle exposure.

**Independent Test**: Simulate transient network failure, unauthorized/forbidden, missing session, invalid protocol response, and finalization failure, then verify typed safe errors.

### Tests for User Story 3

- [X] T026 [P] [US3] Add retryable chunk failure test in `tests/tus.test.ts`
- [X] T027 [P] [US3] Add permanent remote rejection mapping test in `tests/tus.test.ts`
- [X] T028 [P] [US3] Add invalid protocol response mapping test in `tests/tus.test.ts`
- [X] T029 [P] [US3] Add sensitive data redaction test in `tests/tus.test.ts`

### Implementation for User Story 3

- [X] T030 [US3] Map remote HTTP/status failures to typed TUS error codes in `src/tus.ts`
- [X] T031 [US3] Preserve existing retry behavior for retryable chunk failures in `src/tus.ts`
- [X] T032 [US3] Redact upload URLs, authorization headers, cookies, and resume handles from default error details in `src/tus.ts`
- [X] T033 [US3] Map invalid protocol responses to non-sensitive typed failures in `src/tus.ts`

**Checkpoint**: Failure states are safe and distinguish retry from resume conflict.

---

## Phase 6: User Story 4 - Configure Adapter Boundaries (Priority: P4)

**Goal**: Platform engineers can configure endpoint, metadata, headers, credentials, and request overrides without changing core ingest logic.

**Independent Test**: Configure the adapter with metadata and headers against the simulator and verify only intended metadata and safe request options are used.

### Tests for User Story 4

- [X] T034 [P] [US4] Add metadata allowlist encoding test in `tests/tus.test.ts`
- [X] T035 [P] [US4] Add custom header provider test in `tests/tus.test.ts`
- [X] T036 [P] [US4] Add custom fetch/request override test in `tests/tus.test.ts`

### Implementation for User Story 4

- [X] T037 [US4] Implement metadata mapper support in `src/tus.ts`
- [X] T038 [US4] Implement static and async header provider support in `src/tus.ts`
- [X] T039 [US4] Implement custom fetch/request override support in `src/tus.ts`
- [X] T040 [US4] Ensure core package behavior remains independent when TUS adapter is unused in `src/index.ts`

**Checkpoint**: Adapter configuration is isolated and deployable without core changes.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, compatibility, and package verification.

- [X] T041 [P] Update README TUS transport examples and retry/resume explanation in `README.md`
- [X] T042 [P] Update public API examples in `specs/002-tus-transport-adapter/contracts/tus-transport-contracts.md`
- [X] T043 [P] Update quickstart validation notes if implementation names differ in `specs/002-tus-transport-adapter/quickstart.md`
- [X] T044 Run `npm run typecheck`
- [X] T045 Run `npm test`
- [X] T046 Run `npm run build`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories.
- **US1 (Phase 3)**: Depends on Foundational; delivers MVP fresh upload.
- **US2 (Phase 4)**: Depends on US1 transport session creation and chunk upload behavior.
- **US3 (Phase 5)**: Depends on Foundational and may follow US1/US2 error paths.
- **US4 (Phase 6)**: Depends on Foundational option contracts and can proceed after US1 request flow exists.
- **Polish (Phase 7)**: Depends on desired user stories.

### User Story Dependencies

- **US1**: No dependency on other stories after Foundational.
- **US2**: Builds on US1 and existing persistent resume core.
- **US3**: Builds on US1 failure paths and US2 conflict semantics.
- **US4**: Builds on Foundational configuration contracts and US1 request construction.

### Within Each User Story

- Tests must be written before implementation tasks.
- Public contracts must exist before adapter orchestration uses them.
- Story checkpoint must pass before moving to the next priority when working sequentially.

## Parallel Opportunities

- T001, T002, and T003 can run in parallel.
- T005, T006, T007, and T008 can run in parallel after T004 is drafted.
- Test tasks within each user story can run in parallel.
- US4 configuration tests can be drafted while US2 resume behavior is implemented, once foundational option contracts exist.

## Parallel Example: User Story 1

```bash
Task: "T010 [P] [US1] Add fresh upload creation test in tests/tus-transport.test.ts"
Task: "T011 [P] [US1] Add sequential chunk PATCH/upload test in tests/tus-transport.test.ts"
Task: "T012 [P] [US1] Add completion and original-preservation test in tests/tus-transport.test.ts"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 only.
3. Validate that a synthetic large image uploads through the local protocol simulator.
4. Review public adapter contracts before adding resume, error mapping, and configuration breadth.

### Incremental Delivery

1. Deliver US1 for fresh upload.
2. Add US2 for remote resume validation.
3. Add US3 for safe failure mapping.
4. Add US4 for deployable adapter configuration.
5. Finish README and package checks.

## Notes

- Default tests must not require real TUS servers, cloud credentials, or network services.
- Preserve the original file and never persist original bytes in adapter resume state.
- Treat upload URLs, authorization headers, cookies, and resume handles as sensitive.
- Strong checksum verification and package splitting remain follow-up features.
