# Tasks: 1.1.0 Operational Safety

**Input**: Design documents from `/specs/003-operational-safety/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required by FR-004, SC-001, SC-002, SC-003, and SC-004.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Prepare additive public contracts and package metadata for 1.1.0.

- [X] T001 [P] Add 1.1.0 operational safety entry to `CHANGELOG.md`
- [X] T002 [P] Update package version metadata in `package.json` and `package-lock.json`
- [X] T003 [P] Verify existing publish ignore files still cover `dist/`, `node_modules/`, logs, and local env files in `.gitignore` and `.npmignore`

---

## Phase 2: Foundational

**Purpose**: Add shared contracts and exports that user stories depend on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Add retry policy public types to `src/types.ts`
- [X] T005 Add safe diagnostics public types and helper exports to new `src/diagnostics.ts`
- [X] T006 Export diagnostics helpers and retry policy types from `src/core.ts`
- [X] T007 Export diagnostics helpers and retry policy types from `src/index.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Log Safe Operational Summaries (Priority: P1) MVP

**Goal**: Developers can produce safe summaries and redacted diagnostic objects without exposing customer metadata, credentials, full manifests, upload URLs, or sensitive resume handles.

**Independent Test**: Pass representative events, snapshots, resume records, and verification results through diagnostics helpers and assert that safe fields remain while sensitive fields are absent.

### Tests for User Story 1

- [X] T008 [P] [US1] Add safe event summary tests for manifest-bearing, progress, retry, conflict, and failed events in `tests/diagnostics.test.ts`
- [X] T009 [P] [US1] Add snapshot and resume record redaction tests in `tests/diagnostics.test.ts`
- [X] T010 [P] [US1] Add verification summary tests in `tests/diagnostics.test.ts`

### Implementation for User Story 1

- [X] T011 [US1] Implement `createSafeEventSummary()` in `src/diagnostics.ts`
- [X] T012 [US1] Implement `redactUploadSessionSnapshot()` in `src/diagnostics.ts`
- [X] T013 [US1] Implement `redactResumeRecord()` in `src/diagnostics.ts`
- [X] T014 [US1] Implement `createSafeVerificationSummary()` in `src/diagnostics.ts`
- [X] T015 [US1] Document diagnostics helper usage and safe logging guidance in `README.md`

**Checkpoint**: User Story 1 is independently testable with `npm test -- diagnostics`.

---

## Phase 4: User Story 2 - Configure Retry Behavior Predictably (Priority: P2)

**Goal**: Developers can configure retry attempts and delay behavior for transient chunk failures while permanent conflicts, pause, cancel, and validation failures do not retry.

**Independent Test**: Use fake transports to trigger retryable and non-retryable failures and assert attempts, retry events, checkpoint behavior, pause/cancel behavior, and final status.

### Tests for User Story 2

- [X] T016 [P] [US2] Add retry policy success and exhausted-attempt tests in `tests/session.test.ts`
- [X] T017 [P] [US2] Add pause, cancel, and non-retryable bypass tests in `tests/session.test.ts`

### Implementation for User Story 2

- [X] T018 [US2] Add `retryPolicy` option handling to `src/session.ts`
- [X] T019 [US2] Preserve existing numeric `retries` behavior when `retryPolicy` is not provided in `src/session.ts`
- [X] T020 [US2] Add retry delay/backoff/jitter support that respects abort signals in `src/session.ts`
- [X] T021 [US2] Ensure pause, cancel, aborted signals, and non-retryable errors bypass retry in `src/session.ts`
- [X] T022 [US2] Document retry policy behavior and precedence in `README.md`

**Checkpoint**: User Story 2 is independently testable with focused session tests.

---

## Phase 5: User Story 3 - Validate Real-World Integration Paths Opt-In (Priority: P3)

**Goal**: Maintainers have an opt-in integration harness that skips safely by default and avoids sensitive output.

**Independent Test**: Run the integration script without environment variables and verify all targets skip without network, cloud, or NAS requirements.

### Tests for User Story 3

- [X] T023 [P] [US3] Add integration harness skip tests in `tests/integration-harness.test.ts`

### Implementation for User Story 3

- [X] T024 [US3] Add opt-in integration harness script in `scripts/run-integration-tests.cjs`
- [X] T025 [US3] Add `test:integration` package script in `package.json`
- [X] T026 [US3] Document opt-in integration target variables, skip behavior, and sensitive-output safeguards in `docs/integration-tests.md`

**Checkpoint**: User Story 3 is independently testable with `npm test -- integration-harness` and `npm run test:integration`.

---

## Phase 6: User Story 4 - Use A Minimal Server Example (Priority: P4)

**Goal**: Adopters have server-side guidance that clarifies application-owned credentials, storage policy, cleanup, and verification responsibilities.

**Independent Test**: Review documentation to verify credentials remain server-owned, filenames/metadata are labels, and browsers are not instructed to write directly to NAS or filesystems.

### Implementation for User Story 4

- [X] T027 [P] [US4] Add minimal server-side operational guide in `docs/server-operational-guide.md`
- [X] T028 [US4] Link server-side guide from `README.md`
- [X] T029 [US4] Ensure examples and docs avoid treating user filenames or metadata as trusted paths in `docs/server-operational-guide.md`

**Checkpoint**: User Story 4 is independently reviewable through docs.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Release validation, docs alignment, and Spec Kit cleanup.

- [X] T030 [P] Update 1.1.0 contract notes in `specs/003-operational-safety/contracts/operational-safety-contracts.md` if implementation names differ
- [X] T031 [P] Update `specs/003-operational-safety/quickstart.md` with final commands and expected outcomes
- [X] T032 Run `npm run typecheck`
- [X] T033 Run `npm run typecheck:examples`
- [X] T034 Run `npm test`
- [X] T035 Run `npm run build`
- [X] T036 Run `npm pack --dry-run`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion - blocks user stories.
- **User Stories (Phase 3+)**: Depend on Foundational phase completion.
- **Polish (Phase 7)**: Depends on selected user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - MVP scope.
- **User Story 2 (P2)**: Can start after Foundational; uses shared public types from Phase 2.
- **User Story 3 (P3)**: Can start after Foundational; independent from US1/US2 implementation.
- **User Story 4 (P4)**: Can start after Foundational; documentation-only and independent.

### Within Each User Story

- Tests must be written before implementation for US1, US2, and US3.
- Public types before helper implementation.
- Diagnostics helpers before README examples that reference them.
- Retry policy tests before session retry implementation.

### Parallel Opportunities

- T001, T002, and T003 can run in parallel.
- T008, T009, and T010 can run in parallel before US1 implementation.
- T016 and T017 can run in parallel before US2 implementation.
- T023 and T027 can run independently after Foundational.
- T030 and T031 can run in parallel before final verification.

---

## Parallel Example: User Story 1

```text
Task: "T008 [P] [US1] Add safe event summary tests for manifest-bearing, progress, retry, conflict, and failed events in tests/diagnostics.test.ts"
Task: "T009 [P] [US1] Add snapshot and resume record redaction tests in tests/diagnostics.test.ts"
Task: "T010 [P] [US1] Add verification summary tests in tests/diagnostics.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. Validate with `npm test -- diagnostics` and `npm run typecheck`.

### Incremental Delivery

1. Add safe diagnostics helpers.
2. Add retry policy.
3. Add opt-in integration harness.
4. Add server-side guidance.
5. Run full verification.

### Notes

- Keep all changes additive for 1.1.0 compatibility.
- Do not mutate original image bytes or add derivative generation in this feature.
- Do not require real credentials or services in default tests.
- Mark each task `[X]` after completion.
