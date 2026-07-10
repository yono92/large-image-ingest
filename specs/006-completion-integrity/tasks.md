# Tasks: Completion Integrity

**Input**: Design documents from `/specs/006-completion-integrity/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Focused tests are required because this patch changes terminal session truth, resume cleanup ordering, public events, and caller callback isolation.

## Phase 1: Setup

**Purpose**: Establish patch metadata and release tracking.

- [x] T001 Update version metadata to 1.3.0 in package.json and package-lock.json
- [x] T002 [P] Add the 1.3.0 completion integrity entry to CHANGELOG.md and docs/roadmap.md

---

## Phase 2: Foundational Contracts

**Purpose**: Define additive public warning and observer-failure contracts.

- [x] T003 Add ResumeCleanupOperation, IngestObserverFailure, resume:cleanup-failed, and onObserverError contracts in src/types.ts
- [x] T004 Export the new completion integrity types through src/core.ts
- [x] T005 [P] Add safe cleanup-warning summary expectations in tests/diagnostics.test.ts
- [x] T006 Implement safe resume:cleanup-failed summaries in src/diagnostics.ts

**Checkpoint**: Public contracts compile and safe summaries expose only stable cleanup metadata.

---

## Phase 3: User Story 1 - Preserve Remote Completion Truth (Priority: P1)

**Goal**: Keep transport completion authoritative while making local cleanup failures observable and recoverable.

**Independent Test**: A successful fake transport with fault-injecting completion storage resolves successfully, completes once, preserves a completed snapshot, and emits typed cleanup warnings.

### Tests

- [x] T007 [US1] Add mark-complete, delete, dual-failure, and transport-completion failure cases in tests/session-resume.test.ts

### Implementation

- [x] T008 [US1] Persist completed resume state before best-effort deletion in src/session.ts
- [x] T009 [US1] Convert post-completion resume-store failures into non-fatal cleanup events in src/session.ts

**Checkpoint**: Remote completion executes once and cannot be reversed by local cleanup failures.

---

## Phase 4: User Story 2 - Isolate Observer Failures (Priority: P1)

**Goal**: Prevent caller-owned UI and telemetry observers from changing session behavior.

**Independent Test**: Throwing event, snapshot, and observer-error callbacks leave transport calls, receipts, promise resolution, and final snapshot identical to the control case.

### Tests

- [x] T010 [US2] Add event, snapshot, completion-boundary, and recursive reporter failure cases in tests/session.test.ts

### Implementation

- [x] T011 [US2] Route onEvent through a contained observer boundary in src/session.ts
- [x] T012 [US2] Route onSnapshot through a contained observer boundary and preserve detached snapshots in src/session.ts

**Checkpoint**: Observer exceptions are reported but never escape session control flow.

---

## Phase 5: Documentation And Release Verification

**Purpose**: Align package documentation and verify patch compatibility.

- [x] T013 [P] Document completion truth, cleanup warnings, and observer isolation in README.md
- [x] T014 [P] Update package version and public contract assertions in tests/package-exports.test.ts
- [x] T015 Run npm run typecheck, npm run typecheck:examples, npm test, npm run build, and npm pack --dry-run
- [x] T016 Reconcile implementation against specs/006-completion-integrity/spec.md, plan.md, and tasks.md

---

## Dependencies And Execution Order

- Phase 1 has no dependencies.
- Phase 2 depends on Phase 1 and blocks both user stories.
- User Story 1 and User Story 2 depend on the public contracts but can otherwise be verified independently.
- Documentation and release verification depend on both stories.

## Parallel Opportunities

- T002 can proceed independently from package metadata updates.
- T005 can be written while T003 and T004 stabilize the public type names.
- T013 and T014 can run in parallel after behavior is final.

## Implementation Strategy

1. Add the smallest source-compatible warning and observer contracts.
2. Make remote completion truth safe before changing observer behavior.
3. Isolate both observer boundaries without introducing default logging.
4. Verify package consumption and all existing upload paths before release.

## Format Validation

All tasks use the required checkbox, sequential task ID, optional parallel marker, story label for story phases, and explicit file paths.
