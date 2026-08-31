# Tasks: Official Transport Conformance

**Input**: Design documents from `specs/014-transport-conformance/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Contract and representative-target tests are required before implementation because this feature publishes new evidence semantics and may expose unsafe recovery claims.

**Organization**: Tasks are grouped by user story. Shared catalog/report contracts block target-specific work; every positive capability must finish with behavior evidence.

## Phase 1: Setup And Additive Release Baseline

**Purpose**: Establish the shared additive release and verification entrypoints without changing existing upload behavior.

- [x] T001 Update the shared additive 1.6.0 release baseline in `package.json`, `package-lock.json`, and `src/package-version.ts`
- [x] T002 Add `test:conformance` and `qualify:transport` command placeholders plus prepublish ordering in `package.json`
- [x] T003 [P] Add the 1.6.0 conformance release section and evidence boundary to `CHANGELOG.md`
- [x] T004 [P] Add compile-time conformance consumer fixtures to `examples/conformance-target.ts` and `tsconfig.examples.json`

**Checkpoint**: Package and embedded producer versions agree; additive command and example surfaces are reserved.

---

## Phase 2: Foundational Catalog, Types, And Fixtures

**Purpose**: Add versioned provider-neutral contracts and safe test infrastructure required by every story.

**Critical**: No target may be called conformant until this phase compiles and its validation tests fail for incomplete evidence.

- [x] T005 Add catalog/report versions, stable scenario IDs, capability/profile/observation/result/report types, and issue codes in `src/conformance.ts`
- [x] T006 Implement immutable v1 scenario definitions with applicability, required observation fields, and invariant metadata in `src/conformance.ts`
- [x] T007 Implement safe-slug, target profile, capability relationship, observation, and untrusted report validation primitives in `src/conformance.ts`
- [x] T008 [P] Add valid/invalid observation, profile, capability, and report builders without sensitive values in `tests/conformance-fixtures.ts`
- [x] T009 [P] Add catalog uniqueness, immutability, scenario ordering, and schema-constant tests in `tests/conformance.test.ts`
- [x] T010 [P] Add bounded validation tests for malformed, duplicate, missing, oversized, and sensitive-shaped input in `tests/conformance.test.ts`
- [x] T011 Export the additive ESM/CJS `large-image-ingest/conformance` subpath and declarations in `package.json`, `tsconfig.cjs.json`, and `scripts/verify-package-consumption.cjs`
- [x] T012 [P] Add package export, conformance consumer, and unchanged existing custom-transport compile/runtime assertions in `tests/package-exports.test.ts`, `examples/conformance-target.ts`, and `examples/custom-transport.ts`

**Checkpoint**: The public contract can represent only safe, versioned evidence and remains source-compatible with existing consumers.

---

## Phase 3: User Story 1 — Trust Recovery Across Official Transports (Priority: P1) MVP

**Goal**: Prove the same recovery, completion, and stored-integrity invariants through the official S3 multipart, tus, and NAS paths.

**Independent Test**: Run the complete catalog against one credential-free representative target per official category, inject interruption/mismatch/evidence/reconciliation/completion/cleanup failures, and require conformant reports with zero acknowledged retransmission and verified stored bytes.

### Tests For User Story 1

- [x] T013 [P] [US1] Add runner status-authority and invariant-evaluation tests for all common scenarios in `tests/conformance.test.ts`
- [x] T014 [P] [US1] Add exact-source resume, accepted-part response loss, metadata-equal mismatch, invalid receipt, reconciliation, ambiguous completion, and stored-verification scenarios for S3 in `tests/conformance-s3.test.ts`
- [x] T015 [P] [US1] Add exact-source resume, accepted-PATCH response loss, offset mismatch/expiry, missing upload, ambiguous completion, and stored-verification scenarios for tus in `tests/conformance-tus.test.ts`
- [x] T016 [P] [US1] Add staged recovery, accepted-stage response loss, stale/partial metadata, lock conflict, finalize verification, cancellation, and cleanup-failure scenarios for NAS in `tests/conformance-nas.test.ts`
- [x] T017 [P] [US1] Add source-byte preservation, pre-mutation call counts, zero/one/partial-final chunk, and maximum-plan boundary assertions shared by all targets in `tests/conformance-official.test.ts`
- [x] T018 [P] [US1] Add ten-run ordered-status determinism and zero-duplicate acknowledged-byte assertions in `tests/conformance-official.test.ts`

### Implementation For User Story 1

- [x] T019 [US1] Implement sequential abort-aware scenario execution, observation validation, invariant evaluation, safe exception mapping, and report status reduction in `src/conformance.ts`
- [x] T020 [US1] Implement S3 representative target behavior using the public multipart adapter and independent stored-original verification in `scripts/conformance/representative-s3.cjs`
- [x] T021 [US1] Implement tus representative target behavior using the public tus adapter, authoritative offsets, optional extension evidence, and independent stored-original verification in `scripts/conformance/representative-tus.cjs`
- [x] T022 [US1] Implement NAS representative target behavior using isolated temporary roots, the public gateway, staged checksums/locks, final verification, and cleanup in `scripts/conformance/representative-nas.cjs`
- [x] T023 [US1] Implement the credential-free catalog orchestrator, repetition comparison, machine-readable output, and guaranteed final cleanup in `scripts/run-conformance.cjs`
- [x] T024 [US1] Apply only conformance-test-proven safety fixes to official adapters in `src/s3.ts`, `src/tus.ts`, and `src/nas.ts` without changing provider-neutral core authority

**Checkpoint**: All official categories pass every applicable common scenario through actual public adapter/gateway paths.

---

## Phase 4: User Story 2 — Understand Capability Differences Without Losing Safety (Priority: P1)

**Goal**: Make shared guarantees, capability-scoped evidence, unsupported behavior, and safe provider limitations auditable in one report.

**Independent Test**: Corrupt or remove each capability's evidence, inject secret-bearing provider errors, and verify the report becomes non-conformant/incomplete while exposing only safe categories.

### Tests For User Story 2

- [x] T025 [P] [US2] Add positive-capability-to-passing-scenario coverage and unproven-claim rejection tests in `tests/conformance.test.ts`
- [x] T026 [P] [US2] Add pass/fail/skip/unsupported and conformant/non-conformant/incomplete matrix tests in `tests/conformance.test.ts`
- [x] T027 [P] [US2] Add recursive safe-output fixtures for credentials, URLs, object keys, paths, metadata, manifests, recovery records, receipts, checksums, and thrown provider details in `tests/conformance.test.ts`
- [x] T028 [P] [US2] Add JSON-schema parity and report round-trip validation tests in `tests/conformance-report-schema.test.ts`

### Implementation For User Story 2

- [x] T029 [US2] Implement capability-evidence evaluation, capability-scoped unsupported results, duplicate/missing coverage rejection, and parallel-claim reservation in `src/conformance.ts`
- [x] T030 [US2] Implement report aggregation for safe environment/configuration categories, timings, limitations, and cleanup counts in `src/conformance.ts`
- [x] T031 [US2] Align official target capability profiles and protocol-specific limitation codes in `scripts/conformance/representative-s3.cjs`, `scripts/conformance/representative-tus.cjs`, and `scripts/conformance/representative-nas.cjs`
- [x] T032 [US2] Document the shared invariant matrix, protocol evidence differences, report authority, and evidence limitations in `docs/transport-conformance.md` and `README.md`

**Checkpoint**: Static metadata cannot manufacture conformance, and a reviewer can understand every result without inspecting a secret or raw provider artifact.

---

## Phase 5: User Story 3 — Qualify A Real Deployment Target (Priority: P2)

**Goal**: Allow an operator to run the same catalog through an explicitly configured target driver while preserving safe defaults and cleanup visibility.

**Independent Test**: Run the repository command with no configuration, partial/invalid configuration, a safe fake real-target driver, a failing driver, and a cleanup-failing driver; verify no implicit mutation and accurate report authority.

### Tests For User Story 3

- [x] T033 [P] [US3] Replace reachability-as-proof tests with all-skip, explicit opt-in, driver-load, safe-failure, and no-secret-output assertions in `tests/integration-harness.test.ts`
- [x] T034 [P] [US3] Add fixture real-target modules for complete, skipped, failed, and cleanup-failed qualification in `tests/fixtures/conformance-drivers/`
- [x] T035 [P] [US3] Add report output, incomplete-run authority, abandoned-resource count, and final cleanup assertions in `tests/integration-harness.test.ts`

### Implementation For User Story 3

- [x] T036 [US3] Add explicit `LII_CONFORMANCE_OPT_IN=1` plus `LII_CONFORMANCE_DRIVER_MODULE` loading and safe module validation to `scripts/run-conformance.cjs`
- [x] T037 [US3] Replace target preflight pass wording with conformance-driver execution or explicit skip behavior in `scripts/run-integration-tests.cjs`
- [x] T038 [US3] Keep driver paths, endpoints, credentials, provider identifiers, and raw errors out of CLI output while preserving exit status and report path categories in `scripts/run-conformance.cjs`
- [x] T039 [US3] Document driver ownership, provisioning, cost, namespace, cleanup, and opt-in commands in `docs/integration-tests.md` and `specs/014-transport-conformance/quickstart.md`

**Checkpoint**: Real-target evidence uses the same report contract; missing or partial configuration never mutates a target or produces a conformant claim.

---

## Phase 6: Documentation, Release Evidence, And Cross-Cutting Verification

**Purpose**: Retain reviewed evidence and close the additive release without documentation drift.

- [x] T040 Retain one reviewed three-target, ten-run credential-free report under `benchmarks/results/` and summarize it in `docs/transport-conformance.md`
- [x] T041 [P] Update `docs/roadmap.md`, `CHANGELOG.md`, and `README.md` from planning language to implemented 1.6.0 behavior
- [x] T042 [P] Update package examples and export guidance for `large-image-ingest/conformance` in `README.md` and `docs/quickstart.md`
- [x] T043 Run focused conformance, official transport, schema, integration-harness, and package-consumption tests from `specs/014-transport-conformance/quickstart.md`
- [x] T044 Run typecheck, all example typechecks, full unit/UI tests, build, conformance, reference, browser checksum, integration skips, package dry run, and `git diff --check`
- [x] T045 Reconcile every FR/SC and capability claim against implementation and append any remaining work to `specs/014-transport-conformance/tasks.md` before marking the feature implemented

---

## Dependencies And Execution Order

### Phase Dependencies

- Phase 1 establishes the shared release and command surface.
- Phase 2 establishes safe public contracts and blocks every user story.
- US1 implements the common safety evidence and is the MVP.
- US2 depends on US1 result production and adds capability/report authority.
- US3 depends on the US1 runner and US2 safe report boundary.
- Phase 6 depends on all selected stories.

### User Story Dependencies

- **US1**: Starts after Phase 2; independently proves all official representative paths.
- **US2**: Starts after the runner can produce results; independently proves report/capability honesty and safe output.
- **US3**: Starts after the target contract and safe report are stable; independently proves explicit real-target qualification.

### Parallel Opportunities

- T003–T004 can proceed independently after T001 chooses the release value.
- T008–T010 and T012 touch independent fixtures/test surfaces after T005–T007 contracts are drafted.
- US1 target tests T014–T016 are independent; implementations T020–T022 use separate driver files.
- US2 security/schema tests T025–T028 can be written independently before evaluator changes.
- US3 driver fixtures and harness tests T033–T035 can be prepared in parallel.

## Parallel Example: User Story 1

```text
Task T014: S3 official representative scenarios
Task T015: tus official representative scenarios
Task T016: NAS official representative scenarios
```

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational phases.
2. Implement US1 with all three representative targets.
3. Verify exact-source recovery, mismatch-before-mutation, zero retransmission, one completion, and stored SHA-256.
4. Continue to US2 before publishing any conformance claim because capability/report honesty is part of the safety boundary.

### Incremental Verification

1. Write each focused test before its implementation task and confirm the expected failure.
2. Run typecheck and focused tests at every phase checkpoint.
3. Run the ten-repeat credential-free command after all official target scenarios pass.
4. Run explicit opt-in fixture drivers before documenting real-target qualification.
5. Run the complete release matrix only after documentation and package exports are aligned.

## Notes

- `[P]` means separate files or independent test surfaces, not permission to bypass foundational contracts.
- No real provider credentials, production paths, commit, push, tag, or publish action is included.
- A preflight or successful import is not a conformance result.
- Conformance status exists only in a complete report and is never added to `TransportCapabilities`.

## Convergence Audit

Completed on 2026-08-31 after implementation and the full release matrix.

- FR-001–FR-003, FR-011–FR-014, FR-017, FR-019, and FR-021 are covered by the versioned catalog/report types, bounded validator, package export, capability evaluator, schema tests, and safe-output tests.
- FR-004–FR-010, FR-018, and FR-020 are covered by the shared invariant evaluator plus the official S3 multipart, tus, and NAS representative targets and adapter regression tests.
- FR-015 is covered by the isolated representative runner and retained ten-run report; FR-016 is covered by exact opt-in driver loading and mutation-free default skips; FR-022 is covered by `docs/transport-conformance.md`, `docs/integration-tests.md`, and the README.
- SC-001–SC-010 are evidenced by 223 passing unit tests, 20 passing UI tests, passing type/example/build/package gates, the 64 MiB reference and browser gates, the explicit real-target fixtures, and `benchmarks/results/2026-08-transport-conformance.json` containing 30 conformant reports across ten deterministic repetitions.
- Reconciliation found no remaining unbuilt work. The data-model cleanup wording was aligned with the implemented distinction between an observed intermediate cleanup failure and a failed final cleanup.
