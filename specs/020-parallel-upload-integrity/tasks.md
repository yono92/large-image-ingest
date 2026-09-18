# Tasks: Parallel Upload Integrity

**Input**: Design documents from `specs/020-parallel-upload-integrity/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required by the feature specification and project constitution. Write focused tests first and confirm they fail for the intended reason.

## Phase 1: Setup And Regression Freeze

**Purpose**: Freeze the current sequential contract before additive parallel work.

- [X] T001 Record the final pre-feature sequential typecheck, unit, build, and package-consumption baseline in specs/020-parallel-upload-integrity/quickstart.md
- [X] T002 [P] Add unchanged sequential lifecycle and receipt-order regression fixtures in tests/parallel-compatibility.test.ts
- [X] T003 [P] Add v0.1–v0.3 sequential resume compatibility fixtures in tests/parallel-resume.test.ts
- [X] T004 [P] Add current S3 sequential capability and completion regression fixtures in tests/s3.test.ts

---

## Phase 2: Foundational Contracts

**Purpose**: Add versioned data contracts and pure validation required by every story.

- [X] T005 Add parallel policy, checksum evidence, chunk outcome, capability, event, snapshot, and resume v0.4 public types in src/types.ts
- [X] T006 [P] Add parallel admission and integrity-policy validation tests in tests/parallel-integrity.test.ts
- [X] T007 [P] Add resume v0.4 parsing, mutation, and legacy rejection tests in tests/parallel-resume.test.ts
- [X] T008 Implement deterministic parallel and integrity policy identity plus resume v0.4 validation in src/resume.ts
- [X] T009 Implement bounded exact-Blob SHA-256 calculation and hex/Base64 normalization helpers in src/checksum.ts
- [X] T010 Export additive public contracts from src/index.ts and src/core.ts and extend package-consumption assertions in tests/package-exports.test.ts

**Checkpoint**: Contracts are type-checkable, v0.4 is validated, and the existing sequential path still compiles unchanged.

---

## Phase 3: User Story 1 - Transfer One Large Source In Parallel (Priority: P1) MVP

**Goal**: Opt one source into bounded parallel transfer with monotonic unique progress, canonical receipts, and exactly-once completion.

**Independent Test**: Upload at concurrency four with reversed acknowledgements and prove the bound, unique progress, receipt order, and one completion.

- [X] T011 [P] [US1] Add concurrency 2–16, transport-ceiling, short-plan, and unsupported-capability admission tests in tests/parallel-session.test.ts
- [X] T012 [P] [US1] Add ordered, reversed, random, simultaneous, duplicate, and stale-attempt scheduling tests in tests/parallel-session.test.ts
- [X] T013 [US1] Implement opt-in effective-concurrency admission while preserving the sequential branch in src/session.ts
- [X] T014 [US1] Implement the bounded worker pool and per-attempt identity in src/session.ts
- [X] T015 [US1] Implement serialized authoritative acknowledgement, monotonic unique-byte progress, and canonical receipt commits in src/session.ts
- [X] T016 [US1] Gate finalization on one valid receipt per planned chunk and retain ambiguous-completion reconciliation in src/session.ts
- [X] T017 [US1] Add requested/effective concurrency and safe outcome counts to snapshots and events in src/types.ts and src/session.ts
- [X] T018 [US1] Run the focused US1 tests and confirm all unchanged sequential fixtures pass

**Checkpoint**: Bounded parallel transfer works through a fake provider-neutral transport without persistent restart or S3-specific behavior.

---

## Phase 4: User Story 2 - Resume Sparse Parallel Progress Safely (Priority: P1)

**Goal**: Restore sparse acknowledged progress, reconcile ambiguity, and transmit only missing or safely repeatable chunks.

**Independent Test**: Stop after non-contiguous acknowledgements, reconstruct from v0.4, and prove exact reuse/retransmission decisions before mutation.

- [X] T019 [P] [US2] Add exhaustive bounded sparse-subset restart and remote-only adoption tests in tests/parallel-resume.test.ts
- [X] T020 [P] [US2] Add source, manifest, chunk-plan, transport, session, parallel-policy, and integrity-policy mismatch tests in tests/parallel-resume.test.ts
- [X] T021 [US2] Persist sparse authoritative receipts and policy identities through a serialized v0.4 checkpoint boundary in src/session.ts
- [X] T022 [US2] Add provider-neutral sparse reconciliation and safe-repeat contracts in src/types.ts and validation in src/resume.ts
- [X] T023 [US2] Implement resume classification for missing, remotely proven, ambiguous, conflicting, and unsafe-repeat chunks in src/session.ts
- [X] T024 [US2] Preserve v0.1–v0.3 sequential semantics and prohibit fabricated parallel evidence in src/resume.ts and src/session.ts

**Checkpoint**: Parallel restart never skips unproven work or retransmits remotely proven work.

---

## Phase 5: User Story 3 - Prove Each Acknowledged Chunk (Priority: P1)

**Goal**: Require local SHA-256 for every parallel chunk and matching remote evidence whenever attestation is advertised.

**Independent Test**: Cover matching, missing, malformed, wrong-algorithm, wrong-range, and mismatched evidence and prove invalid chunks never advance progress.

- [X] T025 [P] [US3] Add bounded chunk SHA-256 and encoding normalization tests in tests/parallel-integrity.test.ts
- [X] T026 [P] [US3] Add missing, malformed, unsupported, wrong-scope, mismatched, and transient-classification tests in tests/parallel-integrity.test.ts
- [X] T027 [US3] Calculate and bind local chunk integrity evidence before transport mutation in src/session.ts
- [X] T028 [US3] Normalize transport attestation and validate algorithm, range, session, source, and digest agreement in src/session.ts
- [X] T029 [US3] Make integrity conflicts typed and non-transient in src/errors.ts and src/types.ts
- [X] T030 [US3] Update receipt verification without treating chunk evidence as whole-file verification in src/verification.ts

**Checkpoint**: No parallel chunk becomes durable without valid required integrity evidence.

---

## Phase 6: User Story 4 - Pause, Cancel, And Retry Predictably (Priority: P2)

**Goal**: Settle concurrent work before publishing pause, cancel, failure, or completion.

**Independent Test**: Race each lifecycle action against every worker boundary and verify one stable state with no late progress.

- [X] T031 [P] [US4] Add pause, resume, cancel, completion, retry, and permanent-failure race tests in tests/parallel-races.test.ts
- [X] T032 [US4] Add scheduler closure and child-attempt interruption without changing the public session authority in src/session.ts
- [X] T033 [US4] Implement worker and commit-queue settlement before lifecycle state publication in src/session.ts
- [X] T034 [US4] Implement fail-fast sibling interruption while retaining valid and ambiguous outcomes in src/session.ts
- [X] T035 [US4] Enforce provider abort at most once and authoritative-completion precedence in src/session.ts

**Checkpoint**: Controlled lifecycle outcomes emit no progress after settlement and preserve exact recoverable work.

---

## Phase 7: User Story 5 - Capability And Resource Boundaries (Priority: P2)

**Goal**: Qualify the S3 path, publish honest capabilities, retain bounded resources, and keep safe outputs redacted.

**Independent Test**: Validate capability combinations and a latency-limited 32-chunk S3 fixture with concurrency four.

- [X] T036 [P] [US5] Add S3 SHA-256 composite checksum request, response, order, reconciliation, and abort tests in tests/s3.test.ts
- [X] T037 [P] [US5] Add provider-neutral and S3 parallel qualification scenarios in tests/conformance-s3.test.ts and src/conformance.ts
- [X] T038 [US5] Extend the S3 broker/target contract with SHA-256 composite part checksum negotiation in src/s3.ts
- [X] T039 [US5] Advertise qualified S3 concurrency and attestation while retaining tus and NAS sequential capabilities in src/s3.ts, src/tus.ts, and src/nas.ts
- [X] T040 [US5] Send Base64 part evidence, require matching S3 attestation, and complete consecutive canonical parts in src/s3.ts
- [X] T041 [US5] Add safe parallel snapshot, event, receipt, and error projections in src/diagnostics.ts
- [X] T042 [US5] Add the deterministic 32-chunk latency and bounded-window harness in benchmarks/parallel/ and document invocation in benchmarks/README.md

**Checkpoint**: The official S3 path is qualified; unsupported official transports stay explicitly sequential.

---

## Phase 8: Documentation, Compatibility, And Release Gates

- [X] T043 [P] Update concurrency, ordering, pause/cancel, resume, integrity, and S3 guidance in README.md and docs/quickstart.md
- [X] T044 [P] Update transport capability and qualification documentation in docs/transport-conformance.md and docs/server-operational-guide.md
- [X] T045 [P] Update version history and future roadmap status only after acceptance in CHANGELOG.md and docs/roadmap.md
- [X] T046 Reconcile FR-001–FR-040 and SC-001–SC-012 against implementation and append any missing work to specs/020-parallel-upload-integrity/tasks.md
- [X] T047 Run npm run typecheck, npm test, npm run build, npm run test:conformance, and the focused parallel benchmark
- [X] T048 Inspect default diagnostics and retained fixtures for credentials, URLs, transport handles, raw provider errors, full receipts, and customer metadata

---

## Dependencies & Execution Order

- Phase 1 freezes compatibility evidence before contract changes.
- Phase 2 blocks every user story.
- US1 establishes the scheduler and authoritative commit boundary.
- US2 and US3 depend on US1 and may then proceed in parallel in separate test files, but their `src/session.ts` integration is serialized.
- US4 depends on the worker pool and integrity failure classification.
- US5 depends on US1–US4 provider-neutral semantics before S3 advertises support.
- Phase 8 follows all selected stories.

## Parallel Opportunities

- T002–T004 can be authored independently.
- T006–T007 can be authored independently before T008–T009.
- US1 scheduling tests and US2/US3 fixture design can proceed in separate files after contracts freeze.
- T036, T037, and documentation drafts touch independent files after behavior is stable.

## Implementation Strategy

### MVP

Complete T001–T018 to prove bounded parallel scheduling, unique progress, canonical receipts, and exactly-once completion through a provider-neutral fake while leaving sequential behavior unchanged.

### Incremental Delivery

1. Add sparse durable recovery (T019–T024).
2. Enforce chunk integrity evidence (T025–T030).
3. Settle lifecycle races (T031–T035).
4. Qualify S3 and bounded performance (T036–T042).
5. Complete documentation and release gates (T043–T048).

## Task Summary

- Total tasks: 48
- Setup/regression: 4
- Foundational: 6
- US1: 8
- US2: 6
- US3: 6
- US4: 5
- US5: 7
- Documentation/release: 6

## Completion Reconciliation

Reconciled on 2026-09-18 against FR-001–FR-040 and SC-001–SC-012. No unimplemented requirement remained after adding strong source-bound chunk evidence, v0.4 ambiguous outcome persistence, safe-repeat/remote reconciliation admission, qualified S3 composite SHA-256 behavior, safe diagnostics, and the release gates. Verification completed with 85 test files / 391 tests, the credential-free S3/tus/NAS conformance suite, the 32-chunk bounded-window benchmark, browser checksum qualification, the 64 MiB reference run, package-consumption checks, package dry-run inspection, and a zero-vulnerability npm audit.
