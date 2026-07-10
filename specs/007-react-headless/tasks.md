# Tasks: React Headless Adapter

**Input**: Design documents from `/specs/007-react-headless/`
**Tests**: Focused controller, hook, SSR, subscription, and package isolation tests are required.

## Phase 1: Setup

- [x] T001 Add React optional peer and development test dependencies in package.json and package-lock.json
- [x] T002 Add the large-image-ingest/react ESM, CommonJS, and declaration export in package.json
- [x] T003 [P] Add React headless adapter release notes and roadmap tracking in CHANGELOG.md and docs/roadmap.md

## Phase 2: Foundational Controller Contracts

- [x] T004 Add controller state, status, and action contracts in src/react-controller.ts
- [x] T005 [P] Add controller contract and subscription tests in tests/react-controller.test.ts
- [x] T006 Implement stable state snapshots, subscriptions, and progress normalization in src/react-controller.ts

## Phase 3: User Story 1 - Bind Upload State To React (Priority: P1)

**Independent Test**: A fake upload publishes accurate lifecycle, byte progress, manifest, error, and record state without duplicate operations.

- [x] T007 [US1] Add successful, failed, and persistent resume controller tests in tests/react-controller.test.ts
- [x] T008 [US1] Implement core session event and snapshot mapping in src/react-controller.ts
- [x] T009 [US1] Implement deduplicated start and resume operations in src/react-controller.ts

## Phase 4: User Story 2 - Control Uploads Without Prescribed UI (Priority: P1)

**Independent Test**: Stable actions delegate start, resume, pause, and cancel once and expose correct action availability.

- [x] T010 [US2] Add pause, cancel, and concurrent action tests in tests/react-controller.test.ts
- [x] T011 [US2] Implement pause and cancel delegation plus action availability in src/react-controller.ts and src/react.ts

## Phase 5: User Story 3 - Compose State Through Context (Priority: P2)

**Independent Test**: Multiple consumers share state through one provider, subscriptions clean up, SSR works, and missing context fails clearly.

- [x] T012 [US3] Add provider, hook, subscription cleanup, missing context, and SSR tests in tests/react.test.ts
- [x] T013 [US3] Implement IngestProvider and useIngestSession with useSyncExternalStore in src/react.ts
- [x] T014 [US3] Implement useUploadProgress and useUploadControls in src/react.ts

## Phase 6: Documentation And Verification

- [x] T015 [P] Add headless React installation and custom UI examples in README.md and docs/quickstart.md
- [x] T016 [P] Extend package export and no-root-React assertions in tests/package-exports.test.ts and scripts/verify-package-consumption.cjs
- [x] T017 Run focused React tests and reconcile implementation against specs/007-react-headless artifacts

## Dependencies And Execution Order

- Setup precedes controller and React source compilation.
- Controller contracts and stable subscriptions precede all hooks.
- User Stories 1 and 2 share the controller and precede provider composition verification.
- Documentation and package isolation checks follow final public names.

## Parallel Opportunities

- T003 can proceed with dependency setup.
- T005 can be written while controller contracts stabilize.
- T015 and T016 can run in parallel after implementation.

## Implementation Strategy

1. Keep React optional and isolated at the package export boundary.
2. Build and test the controller without React first.
3. Bind the controller through external-store hooks and context.
4. Add no styled UI or hidden upload behavior.
