# Tasks: NAS Concurrency Integrity

**Input**: Design documents from `/specs/010-nas-concurrency-integrity/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Real-filesystem concurrency, lifecycle race, metadata failure, compatibility, and release verification tests are required by the specification.

**Organization**: Tasks are grouped by user story so each safety outcome remains independently testable.

## Phase 1: Setup

**Purpose**: Establish shared test support and preserve a reproducible baseline.

- [x] T001 Add reusable NAS concurrency barriers, candidate-file inspection, and shared-gateway fixtures in tests/nas.test.ts

---

## Phase 2: Foundational Coordination And Persistence

**Purpose**: Add private primitives required by every user story without changing public contracts.

**CRITICAL**: No user story is complete until these primitives are wired into its mutation paths.

- [x] T002 Implement bounded wait, fail-fast, and try-once acquisition modes over the existing `"finalize"` lock scope in src/nas.ts
- [x] T003 Implement unique same-directory metadata candidates, atomic promotion, and lock-held abandoned-candidate cleanup helpers in src/nas.ts

**Checkpoint**: Shared coordination and persistence primitives are ready for mutation-path integration.

---

## Phase 3: User Story 1 - Preserve Concurrent Chunk Progress (Priority: P1) MVP

**Goal**: Prevent lost chunk records and byte/metadata disagreement during concurrent staging across gateway instances.

**Independent Test**: Stage 16 chunks through two gateway instances for 100 runs, verify all records, finalize, and compare exact target bytes; also verify same-index replacement consistency.

### Tests for User Story 1

- [x] T004 [US1] Add a failing 16-chunk, two-gateway, repeated concurrency regression test in tests/nas.test.ts
- [x] T005 [US1] Add a failing concurrent same-index byte-and-metadata consistency test in tests/nas.test.ts

### Implementation for User Story 1

- [x] T006 [US1] Serialize the complete stageChunk read, chunk replacement, metadata merge, and snapshot return path in src/nas.ts
- [x] T007 [US1] Verify independently concurrent sessions remain non-blocking and all US1 focused tests pass in tests/nas.test.ts

**Checkpoint**: Concurrent staging preserves every acknowledged chunk and final target identity.

---

## Phase 4: User Story 2 - Resolve Lifecycle Races Safely (Priority: P1)

**Goal**: Order staging, finalization, cancellation, and expired cleanup without post-terminal mutation or deletion of live work.

**Independent Test**: Repeatedly race a controlled stage operation against finalize and cancel, then verify each result is a valid ordered outcome and cleanup skips a locked session.

### Tests for User Story 2

- [x] T008 [US2] Add failing stage-versus-finalize, stage-versus-cancel, and post-terminal staging tests in tests/nas.test.ts
- [x] T009 [US2] Add a failing cleanup-versus-live-session-lock regression test in tests/nas.test.ts

### Implementation for User Story 2

- [x] T010 [US2] Coordinate finalizeSession and cancelSession with stageChunk while preserving finalize fail-fast errors and existing public error codes in src/nas.ts
- [x] T011 [US2] Make cleanupExpiredSessions acquire the session lock once and skip live mutations before removing session directories in src/nas.ts

**Checkpoint**: Lifecycle races produce only valid states and never remove active session work.

---

## Phase 5: User Story 3 - Recover From Interrupted Metadata Updates (Priority: P2)

**Goal**: Preserve the last committed session document and safely remove abandoned metadata candidates.

**Independent Test**: Inject candidate write and promotion failures, verify the previous metadata remains readable, then perform a later locked mutation and confirm stale candidates are removed.

### Tests for User Story 3

- [x] T012 [US3] Add metadata candidate failure, prior-state preservation, complete-reader visibility, and abandoned-candidate cleanup tests in tests/nas.test.ts

### Implementation for User Story 3

- [x] T013 [US3] Route create, stage, finalize, and cancel metadata commits through atomic promotion and ensure primary errors survive candidate cleanup or lock release failures in src/nas.ts

**Checkpoint**: Failed updates preserve the prior valid document and successful recovery leaves no temporary metadata debris.

---

## Phase 6: Release Compatibility And Documentation

**Purpose**: Ship the compatible safety correction as version 1.3.1 with exact release evidence.

- [x] T014 Update 1.3.1 version metadata and package-version assertions in package.json, package-lock.json, and tests/package-exports.test.ts
- [x] T015 [P] Add the 1.3.1 NAS concurrency integrity entry and compatibility statement in CHANGELOG.md
- [x] T016 [P] Mark NAS atomic concurrency safety complete and document shared-root coordination, atomic metadata, cleanup, and filesystem assumptions in docs/roadmap.md and docs/server-operational-guide.md
- [x] T017 Verify README.md, docs/, examples/, and specs/010-nas-concurrency-integrity/ contain no stale or contradictory NAS concurrency, schema, API, or version claims
- [x] T018 Run the focused NAS suite from specs/010-nas-concurrency-integrity/quickstart.md and record any platform limitation in specs/010-nas-concurrency-integrity/spec.md
- [x] T019 Run npm run typecheck, npm run typecheck:examples, npm test, npm run build, npm run test:reference, and npm pack --dry-run
- [x] T020 Mark specs/010-nas-concurrency-integrity/spec.md implemented and every task complete only after all compatibility and release gates pass

---

## Dependencies And Execution Order

### Phase Dependencies

- **Setup**: Starts immediately.
- **Foundational**: Depends on T001 and blocks all mutation-path work.
- **User Story 1**: Depends on T002-T003 and is the MVP data-loss correction.
- **User Story 2**: Depends on the same coordination primitive and integrates with the staged path from US1.
- **User Story 3**: Depends on the metadata candidate primitive and validates recovery behavior across all mutation paths.
- **Release**: Depends on all user stories and their focused tests.

### User Story Dependencies

- **US1**: First implementation slice because it directly fixes the reproduced lost-update defect.
- **US2**: Uses the US1 stage lock boundary but remains independently verifiable through lifecycle races.
- **US3**: Uses the same lock boundary to prove persistence recovery and candidate cleanup.

### Parallel Opportunities

- T004 and T005 can be authored together before T006 because they cover distinct concurrency outcomes in tests/nas.test.ts.
- T008 and T009 can be designed together after the shared coordination helper is stable.
- T015 and T016 affect separate release documents and can proceed in parallel after behavior stabilizes.
- Different session IDs remain a runtime parallelism requirement and must be tested explicitly in T007.

---

## Implementation Strategy

### MVP First

1. Complete T001-T003.
2. Add the failing 16-chunk and same-index tests in T004-T005.
3. Implement T006 and validate T007.
4. Stop and confirm the original `16 expected / 1 recorded` reproduction becomes `16 / 16` with exact final bytes.

### Incremental Delivery

1. Fix lost concurrent chunk progress.
2. Extend the same coordination boundary to terminal lifecycle operations and cleanup.
3. Make every metadata commit atomic and recover abandoned candidates.
4. Update only patch-compatible version and documentation surfaces.
5. Run focused, full, reference, and package-content gates before marking the feature implemented.

## Notes

- All public NAS signatures, literal unions, error-code unions, and v0.1 schema identifiers remain unchanged.
- Tests must prove real filesystem behavior; mocks are reserved for deterministic failure injection.
- No real NAS mount, cloud service, or credential is required.

## Phase 7: Convergence

- [x] T021 Make getSession remove abandoned metadata candidates only when it can acquire the session lock without blocking per US3/AC2 (partial)
- [x] T022 Add candidate-write failure and reader-during-promotion regression coverage in tests/nas.test.ts per T012 and US3/AC1/AC3 (partial)
- [x] T023 Add repeated direct stage-versus-finalize and stage-versus-cancel race coverage in tests/nas.test.ts per SC-003 and T008 (partial)
