# Tasks: Persistent Source Identity and Responsive Checksum

**Input**: Design documents from `specs/013-persistent-source-identity/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Focused regression and contract tests are required before implementation because the feature changes durable identity and recovery safety.

**Organization**: Tasks are grouped by user story and ordered so transport mutation cannot precede the shared identity/capability foundation.

## Phase 1: Setup And Release Baseline

**Purpose**: Establish the additive release and package/runtime version guard before changing persisted output.

- [x] T001 Update additive release metadata to 1.5.0 in `package.json` and `package-lock.json`
- [x] T002 Add the embedded producer version constant in `src/package-version.ts` and the package synchronization verifier in `scripts/verify-package-version.cjs`
- [x] T003 Wire version and browser checksum verification scripts into `package.json` without changing credential-gated integration behavior

**Checkpoint**: Package version and embedded producer version have one enforced release value.

---

## Phase 2: Foundational Contracts And Fixtures

**Purpose**: Add shared types, safe errors, fixtures, and capability normalization required by every story.

**Critical**: User story implementation starts only after these additive contracts compile.

- [x] T004 Add content identity, checksum executor/cancellation, v0.3 resume, compatibility result, and normalized recovery capability types in `src/types.ts`
- [x] T005 [P] Add typed checksum cancellation/execution and resume identity outcome handling in `src/errors.ts` and `src/react-ui/safe-error.ts`
- [x] T006 Add conservative `normalizeTransportRecoveryCapabilities` behavior and exports in `src/session.ts`, `src/core.ts`, and `src/index.ts`
- [x] T007 [P] Extend resume fixtures with metadata-equal byte variants and v0.1/v0.2/v0.3 matrix builders in `tests/resume-fixtures.ts`
- [x] T008 [P] Add bounded/counting/mutable source and callback-failure fixtures in `tests/checksum-fixtures.ts`
- [x] T009 [P] Add compile/runtime coverage for a custom transport omitting detailed capabilities in `examples/custom-transport.ts` and `tests/session-resume.test.ts`

**Checkpoint**: New contracts are additive; old custom transports still compile and normal upload remains usable.

---

## Phase 3: User Story 1 — Resume Only The Exact Original (Priority: P1) MVP

**Goal**: Reuse acknowledged bytes only after matching whole-file content evidence, before any remote recovery or mutation.

**Independent Test**: Interrupt a fake upload, reselect exact and metadata-equal altered files, and assert only the exact source reaches `resumeSession`; first/middle/final byte changes leave all transport call counts at zero.

### Tests For User Story 1

- [x] T010 [P] [US1] Add strong identity construction/equality and malformed evidence tests in `tests/resume.test.ts`
- [x] T011 [P] [US1] Add first/middle/final byte mismatch and exact-source pre-transport ordering tests in `tests/session-resume.test.ts`
- [x] T012 [P] [US1] Add manifest-checksum-disabled plus persistent-resume identity tests and traversal instrumentation in `tests/session-resume.test.ts`
- [x] T013 [P] [US1] Add safe event/error redaction assertions for identity mismatch in `tests/diagnostics.test.ts` and `tests/react-ui-recovery.test.tsx`

### Implementation For User Story 1

- [x] T014 [US1] Implement `ContentSourceIdentityV1` creation, validation, and equality using whole-file checksum evidence in `src/resume.ts`
- [x] T015 [US1] Write new durable records as `large-image-ingest.resume.v0.3` with mandatory content identity in `src/resume.ts` and `src/session.ts`
- [x] T016 [US1] Add the strong local identity and chunk/transport evidence gate before `resumeSession` in `src/session.ts`
- [x] T017 [US1] Reuse manifest checksum evidence or calculate one separate identity when checksum output is disabled in `src/manifest.ts` and `src/session.ts`
- [x] T018 [US1] Keep identity values and recovery payloads out of default diagnostic/event/UI projections in `src/diagnostics.ts` and `src/react-ui/coordinator.ts`

**Checkpoint**: Metadata-equal different bytes cannot trigger remote recovery, skipping, upload, or completion.

---

## Phase 4: User Story 2 — Prepare Large-File Identity Without Freezing The Experience (Priority: P1)

**Goal**: Provide bounded, cancelable checksum execution off the interactive browser path with explicit fallback and stale-result isolation.

**Independent Test**: Run checksum preparation through a Worker test harness, cancel/replace at start/middle/end, inject Worker/progress failures, and assert monotonic bounded progress and zero accepted late results.

### Tests For User Story 2

- [x] T019 [P] [US2] Add empty/sub-slice/exact-slice/non-multiple, abort timing, monotonic progress, and throwing observer tests in `tests/checksum.test.ts`
- [x] T020 [P] [US2] Add Worker startup/crash/malformed result, explicit fallback, cancellation, and late-message tests in `tests/browser-checksum.test.ts`
- [x] T021 [P] [US2] Add source replacement and canceled preparation authority tests in `tests/react-controller.test.ts` and `tests/react-ui-recovery.test.tsx`
- [x] T022 [P] [US2] Add a packaged ESM Worker consumption harness in `scripts/verify-browser-checksum.cjs`

### Implementation For User Story 2

- [x] T023 [US2] Refactor `calculateChecksum` around the existing incremental SHA-256 engine with signal checks and result validation in `src/checksum.ts`
- [x] T024 [US2] Sanitize monotonic progress and isolate progress/observer callback failures in `src/checksum.ts`
- [x] T025 [US2] Implement the browser Worker message runtime using the shared checksum function in `src/checksum-worker-runtime.ts`
- [x] T026 [US2] Implement `createBrowserWorkerChecksumExecutor` with abort, termination, protocol validation, and explicit fallback semantics in `src/browser.ts`
- [x] T027 [US2] Add the ESM-only `large-image-ingest/browser` package export and exclude browser-only entrypoints from CJS evaluation in `package.json` and `tsconfig.cjs.json`
- [x] T028 [US2] Thread session abort and observer-failure authority through manifest preparation and the headless controller in `src/manifest.ts`, `src/session.ts`, and `src/react-controller.ts`

**Checkpoint**: Worker execution is public and package-safe; core/Node/CJS do not require Worker; canceled or superseded results cannot apply.

---

## Phase 5: User Story 3 — Recover Safely From Supported Older Records (Priority: P1)

**Goal**: Deterministically classify and safely migrate v0.1/v0.2 records without fabricating identity/receipts or deleting weak records.

**Independent Test**: Run the documented record matrix across progress/evidence/transport combinations and verify exact outcomes, zero pre-classification transport calls, preservation of incompatible records, and invariant-preserving checkpoint promotion.

### Tests For User Story 3

- [x] T029 [P] [US3] Add v0.1/v0.2/v0.3 parse/validation and compatibility matrix tests in `tests/resume.test.ts`
- [x] T030 [P] [US3] Add progressed weak-record preservation, zero-progress restart-only, safe v0.2 promotion, and field-preservation tests in `tests/session-resume.test.ts`
- [x] T031 [P] [US3] Add v0.1 progressed S3 receipt rejection before broker/fetch work in `tests/s3.test.ts` and `tests/session-resume.test.ts`
- [x] T032 [P] [US3] Add exact-source legacy tus offset recovery and behavior declaration tests in `tests/tus.test.ts`
- [x] T033 [P] [US3] Add non-destructive list/read and safe-summary tests in `tests/web-storage-resume-store.test.ts` and `tests/react-ui-recovery.test.tsx`

### Implementation For User Story 3

- [x] T034 [US3] Extend bounded record validation and parsing for v0.3 while preserving v0.1/v0.2 reader behavior in `src/resume.ts`
- [x] T035 [US3] Implement `classifyPersistentResume` with resumable/upgradeable/restart-only/expired/incompatible outcomes in `src/resume.ts`
- [x] T036 [US3] Implement transport-evidence-aware legacy gates including progressed v0.1 S3 rejection before remote work in `src/session.ts`
- [x] T037 [US3] Promote only qualifying legacy records at authoritative checkpoints while preserving manifest, transport, receipt, and progress evidence in `src/session.ts`
- [x] T038 [US3] Keep weak/unsafe legacy records discoverable and map typed compatibility to safe UI recovery guidance in `src/react-ui/coordinator.ts`, `src/react-ui/types.ts`, and `src/react-ui/InspectionRecoveryPrompt.tsx`

**Checkpoint**: Every documented record fixture has one deterministic, non-destructive outcome before transport mutation.

---

## Phase 6: User Story 4 — Trust Manifest Provenance And Resume Capabilities (Priority: P2)

**Goal**: Report the actual producer release and only the recovery modes each transport proves.

**Independent Test**: Build and consume ESM/CJS/packed entrypoints, compare producer metadata with package version, and run official/custom capability behavior matrices.

### Tests For User Story 4

- [x] T039 [P] [US4] Update manifest producer/schema separation tests in `tests/manifest.test.ts` and `tests/verification.test.ts`
- [x] T040 [P] [US4] Add official tus and S3 capability-to-behavior matrices in `tests/tus.test.ts` and `tests/s3.test.ts`
- [x] T041 [P] [US4] Add root/core/browser ESM, root/core CJS, and packed producer/export assertions in `tests/package-exports.test.ts` and `scripts/verify-package-consumption.cjs`
- [x] T042 [P] [US4] Add missing-capability conservative normalization and ordinary-upload compatibility tests in `tests/session-resume.test.ts`

### Implementation For User Story 4

- [x] T043 [US4] Replace stale manifest producer metadata with the synchronized package release while preserving manifest schema v1 in `src/manifest.ts` and `src/types.ts`
- [x] T044 [US4] Enforce conservative snapshot/persistent capability decisions without blocking ordinary custom transport upload in `src/session.ts`
- [x] T045 [US4] Align official tus, S3, and local reference capability declarations with their tested behavior in `src/tus.ts`, `src/s3.ts`, and `examples/reference-local/local-reference-transport.ts`

**Checkpoint**: Producer metadata is release-accurate and every claimed official recovery mode has behavior evidence.

---

## Phase 7: UI, Examples, Documentation, And Cross-Cutting Verification

**Purpose**: Connect the authoritative preparation flow to first-party presentation, publish the browser path, and close release documentation/verification.

- [x] T046 [P] Apply the browser Worker executor in the credential-free first-party example and document fallback in `examples/inspection-upload-react/src/App.tsx` and `examples/inspection-upload-react/README.md`
- [x] T047 [P] Update strong identity, migration, cancellation, capability, and browser API guidance in `README.md`, `docs/quickstart.md`, `docs/react-ui.md`, and `docs/integration-tests.md`
- [x] T048 [P] Update release notes and remove stale planning/roadmap wording for Feature 013 in `CHANGELOG.md` and `docs/roadmap.md`
- [x] T049 [P] Update bounded 1 GiB/3 GiB checksum identity methodology and recorded-run caveats in `benchmarks/README.md` and `docs/benchmarks.md`
- [x] T050 Verify all tasks against `specs/013-persistent-source-identity/quickstart.md`, run the full requested command matrix, and record provider skips in the completion summary

---

## Dependencies And Execution Order

### Phase Dependencies

- Phase 1 establishes the release/version gate.
- Phase 2 establishes additive shared contracts and fixtures and blocks all user stories.
- US1 establishes strong identity and durable writer behavior.
- US2 supplies cancelable/background calculation used by US1 session/controller paths.
- US3 depends on US1 identity and Phase 2 schema contracts.
- US4 depends on Phase 1 versioning and Phase 2 capability normalization.
- Phase 7 depends on all selected user stories.

### User Story Dependencies

- **US1**: Starts after Phase 2; MVP safety boundary.
- **US2**: Starts after Phase 2 and integrates with US1 evidence reuse.
- **US3**: Starts after US1 content identity is stable.
- **US4**: Can proceed after Phase 2 independently of US2/US3, then joins package verification.

### Parallel Opportunities

- Test fixture tasks T007–T009 can proceed in separate files after T004.
- Story-specific test files marked `[P]` can be prepared before their implementation tasks.
- US4 manifest/package tests can proceed while US3 resume migration code is implemented.
- Documentation tasks T046–T049 touch separate files and can proceed after public APIs stabilize.

## Parallel Example: User Story 2

```text
Task T019: checksum boundary and cancellation tests
Task T020: Worker protocol and fallback tests
Task T021: controller/UI stale-result tests
Task T022: packed browser consumption harness
```

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational phases.
2. Complete US1 tests and implementation.
3. Verify metadata-equal altered sources fail before transport mutation.
4. Continue immediately to US2 and US3 because production-safe persistent resume requires all three P1 stories.

### Incremental Verification

1. Run focused tests after each test/implementation pair.
2. Run typecheck and unit tests at each story checkpoint.
3. Run build/export/browser/package gates after US4.
4. Run reference/integration/dry-run/diff gates after documentation alignment.

## Notes

- `[P]` means different files or independent test surfaces, not permission to reorder safety dependencies.
- Existing dirty Feature 013 files are preserved; every edit must trace to this task list.
- No commit, push, tag, or npm publish task is included.
- Real provider checks remain opt-in and missing environment is an explicit skip.
