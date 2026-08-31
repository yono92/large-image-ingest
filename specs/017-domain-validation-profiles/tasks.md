# Tasks: Domain Validation Profiles

## Phase 1: Contracts And Baseline Data

- [x] T001 Add browser-safe `large-image-ingest/profiles` ESM/CJS export, example, and package checks
- [x] T002 [P] Add profile, rule, evidence, outcome, evaluation, derivation, reference, and binding types
- [x] T003 [P] Encode documented semiconductor, microscopy, and satellite baseline v1 rule inventories
- [x] T004 Implement RFC 8785/SHA-256 effective-policy digest creation and untrusted profile validation
- [x] T005 Add baseline identity, frozen-data, complete-rule, digest, and deterministic snapshot tests

## Phase 2: Evaluation

- [x] T006 Implement source size, SHA-256, media type, suffix-family, structural-format, dimension, and bit-depth rules
- [x] T007 Implement bounded identifier, RFC 3339 timestamp, external evidence, metadata mapping, and unavailable-data outcomes
- [x] T008 Implement deterministic aggregate result, safe outcome projection, profile reference, and passing session binding
- [x] T009 [P] Add complete semiconductor valid/invalid/boundary matrix
- [x] T010 [P] Add complete microscopy and satellite valid/invalid/unavailable-evidence matrices
- [x] T011 [P] Add declared/observed conflict, proprietary/opaque format, caller-vs-observed source, and no-Blob-read tests

## Phase 3: Derived Profiles

- [x] T012 Implement one-base derived profile construction with added and provably tighter rules
- [x] T013 Implement bounded metadata mappings and explicit categorized exception replacements/disablement
- [x] T014 Reject duplicate/conflicting rules, cycles, malformed mappings, invalid digests, unprovable tightening, and silent relaxation
- [x] T015 [P] Add derivation, exception, conflict, cycle, duplicate, digest, and immutable-baseline tests

## Phase 4: Session And Resume Authority

- [x] T016 Add optional domain-profile session binding and safe resume-record reference
- [x] T017 Block failed/mismatched bindings before transport session creation
- [x] T018 Compare exact profile references during resume classification before source reads or remote mutation
- [x] T019 Add `resume.profile_mismatch` diagnostics and preserve legacy/no-profile behavior
- [x] T020 [P] Add no-createSession, no-resumeSession, no-upload, no-duplicate-checksum, and compatibility tests

## Phase 5: Security, Documentation, And Verification

- [x] T021 [P] Add metadata/checksum/profile/exception/storage/receipt no-leak and bounded-untrusted-input tests
- [x] T022 Document baseline tables, evidence, derivation, exceptions, session/resume binding, safety, and limitations in `docs/domain-profiles.md`
- [x] T023 [P] Update README, quickstart, roadmap, changelog, examples, and export map
- [x] T024 Run focused profile/session/security/package tests
- [x] T025 Run full release matrix and package dry run
- [x] T026 Reconcile FR-001–FR-028 and SC-001–SC-010 and mark implemented only with no remaining work

## Dependencies

Profile validation/digests and baseline data precede evaluation. A passing evaluation precedes session binding. Resume persistence/comparison follows the safe reference contract. Documentation and full gates follow all matrices.

## Convergence Audit

- Completed 2026-08-31 with no remaining implementation task or unresolved requirement.
- FR-001–FR-028 map to the versioned profile/rule/evidence contracts, three baseline inventories, deterministic evaluator, constrained derivation, optional session binding, safe resume reference, and documentation.
- SC-001–SC-010 are covered by repeat evaluations, no-profile compatibility, three domain matrices, missing SHA-256, untrusted derivation mutations, pre-transport resume mismatch, evaluator no-Blob API/instrumentation, safe-output assertions, complete outcome records, and published baseline tables.
- Focused profile/resume/session/package tests passed: 9 files, 47 tests; domain-only tests passed: 5 files, 22 tests. Full unit tests passed: 53 files, 286 tests. ESM/CJS and example typechecks, build/package consumption, UI unit/browser, conformance, browser checksum, reference recovery/integrity, integration safe-skip, package dry-run, and `git diff --check` passed.
