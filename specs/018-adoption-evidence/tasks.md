# Tasks: Comparative Adoption Evidence

## Phase 1: Protocol And Counting

- [x] T001 Encode the versioned journey, eligibility, ownership, counting, scenario, outcome, aggregation, safety, staleness, and claim protocol
- [x] T002 Implement deterministic non-comment source-line counting and frozen artifact revision SHA-256
- [x] T003 Implement bounded report validation, aggregate recomputation, safe-value inspection, and prohibited-claim checks
- [x] T004 [P] Add counting comment/blank/config/type/generated/shared-boundary fixtures
- [x] T005 [P] Add report completeness, recomputation, exclusion, unsafe output, claim, and staleness tests

## Phase 2: Equivalent Candidates And Journey

- [x] T006 Add the shared immutable source oracle and credential-free fault-injecting reference target
- [x] T007 Add the thin SDK S3-style reference integration using built public APIs
- [x] T008 [P] Add the raw tus-style application-owned integration
- [x] T009 [P] Add the raw presigned multipart application-owned integration
- [x] T010 Define frozen candidate-specific verification cases and complete responsibility/dependency matrices
- [x] T011 Prove every eligible candidate preserves and stores the same byte count and SHA-256 on the common journey

## Phase 3: Fault Evidence

- [x] T012 Implement all fourteen fault injections and invariant evaluators
- [x] T013 Capture required raw detection, mutation, recovery, retransmission, completion, terminal, verification, and safety fields
- [x] T014 Run four timing-sensitive scenarios ten times per candidate and every deterministic scenario once
- [x] T015 Preserve unsupported, parity, adverse, and regression outcomes without manual exclusion
- [x] T016 [P] Add candidate-scenario completeness, repeat-count, invariant, and deterministic rerun tests

## Phase 4: Reports And Claims

- [x] T017 Implement the credential-free runner and safe CLI output
- [x] T018 Generate and retain `benchmarks/results/2026-08-adoption-evidence.json`
- [x] T019 Generate implementation reduction and observed safe-scenario coverage with explicit numerators/denominators/weighting
- [x] T020 Add bounded claim records linked to report fields, candidate scope, journey boundary, and principal limitation
- [x] T021 Prove candidate/protocol/counting/scenario changes mark prior evidence stale

## Phase 5: Documentation And Verification

- [x] T022 Document candidate selection, measured results, responsibility boundaries, raw evidence, reproduction, limitations, staleness, and prohibited claims in `docs/adoption-evidence.md`
- [x] T023 [P] Update README, benchmark docs, roadmap, changelog, package scripts, and result index
- [x] T024 Run focused protocol/runner/report/security tests and two deterministic evidence runs
- [x] T025 Run full release matrix and package dry run
- [x] T026 Reconcile FR-001–FR-027 and SC-001–SC-010 and mark implemented only with no remaining work

## Dependencies

Protocol and counting precede frozen candidate measurement. All candidates must pass the common journey before scenario aggregation. Raw trials precede summaries and claims. Documentation and full gates follow validated retained evidence.

## Convergence Audit

- Completed 2026-08-31 with no remaining implementation task or unresolved requirement.
- FR-001–FR-011 map to the versioned protocol snapshot, three frozen candidate artifacts, explicit application/test/shared/dependency boundaries, source-line counter, responsibility/configuration matrices, and intentional omission of uncontrolled developer-time data.
- FR-012–FR-018 map to all fourteen injected scenarios, required raw trial fields, scenario-specific invariant evaluation, 150 retained trials, explicit unsupported handling, unweighted 42-pair aggregation, and preserved adverse line-count results.
- FR-019–FR-027 map to exact revisions and input digests, credential-free execution, common stored-byte verification, safe report validation, resolvable bounded claims, stale-label rejection, original-byte preservation, and the published methodology.
- SC-001–SC-010 are covered by three verified happy paths, traceable candidate artifacts, exact catalog/trial completeness checks, two deterministic reruns, independent aggregate recomputation, claim-field resolution, adverse/unsupported preservation tests, safe-output rejection, and candidate/protocol digest staleness tests.
- Focused adoption-evidence tests passed: 4 files, 14 tests. The retained report contains 3 eligible candidates, 42/42 safe controlled candidate-scenario outcomes, zero exclusions, and 150 raw trials. Full unit, ESM/CJS and example typechecks, build/package consumption, UI unit/browser, conformance, browser checksum, reference recovery/integrity, integration safe-skip, package dry-run, and `git diff --check` passed.
