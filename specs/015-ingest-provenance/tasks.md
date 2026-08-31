# Tasks: Auditable Ingest Provenance

## Phase 1: Setup And Contracts

- [x] T001 Add the `large-image-ingest/provenance` ESM/CJS export and example mapping in `package.json` and `tsconfig.examples.json`
- [x] T002 [P] Add schema/version, evidence, entry, relationship, terminal, integrity, validation, summary, export, sink, and recorder types in `src/provenance.ts`
- [x] T003 [P] Add safe provenance fixtures and six terminal lifecycle fixtures under `tests/`
- [x] T004 Add public export consumption checks and `examples/provenance.ts`

## Phase 2: Foundational Validation And Integrity

- [x] T005 Implement bounded exact-key validation for all v1 artifact sections in `src/provenance.ts`
- [x] T006 Implement RFC 8785-compatible canonicalization for the supported I-JSON domain and SHA-256 sealing in `src/provenance.ts`
- [x] T007 Implement typed structural, version, ordering, identity, relationship, integrity, disclosure, and attestation issues
- [x] T008 [P] Add canonicalization vectors, insertion-order equivalence, mutation matrix, unsupported version, unknown field, and invalid Unicode/number tests in `tests/provenance-integrity.test.ts`
- [x] T009 [P] Add schema constant/bounds parity and parsed round-trip tests in `tests/provenance.test.ts`

## Phase 3: User Story 1 — Retain A Trustworthy Record

- [x] T010 [P] [US1] Add success, resumed success, upload failure, cancellation, completed-unverified, and verification-failed lifecycle tests in `tests/provenance-lifecycle.test.ts`
- [x] T011 [P] [US1] Add equal/regressing timestamp and multi-resume ordering tests in `tests/provenance-lifecycle.test.ts`
- [x] T012 [P] [US1] Add no-recorder compatibility assertions in existing session tests
- [x] T013 [US1] Implement the recorder, stable sequence/entry IDs, event mapping, and terminal reducer in `src/provenance.ts`
- [x] T014 [US1] Implement recovery and transport evidence summaries without operational handles or raw receipts
- [x] T015 [US1] Implement independent verification recording and completed/verified authority separation

## Phase 4: User Story 2 — Verify Integrity And Relationships

- [x] T016 [P] [US2] Add manifest ID/schema/size/checksum mismatch tests in `tests/provenance-integrity.test.ts`
- [x] T017 [P] [US2] Add policy, derivative source/status, verification-order, and terminal inconsistency tests
- [x] T018 [P] [US2] Add unsigned, externally attested, failed-attestation, and no-trusted-time assertions
- [x] T019 [US2] Implement cross-manifest and derivative relationship validation
- [x] T020 [US2] Implement derivative summaries and application-owned external attestation references
- [x] T021 [US2] Implement separate artifact integrity and actor-trust validation results

## Phase 5: User Story 3 — Safe Export And Persistence

- [x] T022 [P] [US3] Add recursive forbidden-value and unknown-field safe-summary tests in `tests/provenance-security.test.ts`
- [x] T023 [P] [US3] Add audit/full export projection and disclosure-profile resealing tests
- [x] T024 [P] [US3] Add sink success/failure, raw-error redaction, and unchanged authority tests
- [x] T025 [US3] Implement fixed safe summaries that reject invalid/unknown artifacts
- [x] T026 [US3] Implement explicit audit/authorized-full exports and bounded authorized annotations
- [x] T027 [US3] Implement non-throwing typed persistence results and optional safe outcome callback

## Phase 6: Documentation And Verification

- [x] T028 Document trust, evidence sources, disclosure, persistence, retention, and unsigned limitations in `docs/provenance.md`
- [x] T029 [P] Update README package map/examples, roadmap, changelog, and quickstart
- [x] T030 [P] Add package ESM/CJS and TypeScript example verification
- [x] T031 Run focused provenance/schema/security/package tests
- [x] T032 Run typecheck, examples, full unit/UI, build, conformance, reference, browser, integration skip, package dry run, and diff checks
- [x] T033 Reconcile FR-001–FR-026 and SC-001–SC-010, append remaining work if any, and mark the feature implemented only when none remains

## Dependencies

- Phase 2 blocks all user stories.
- US1 establishes the artifact producer and is the MVP.
- US2 depends on sealed artifacts from US1.
- US3 depends on validation and sealing from US2.
- Documentation and release gates follow all stories.

## Parallel Opportunities

- T002–T003 can proceed after T001 reserves the export.
- T008–T009 cover independent integrity/schema surfaces.
- T010–T012 and T016–T018 are independent test files after fixtures exist.
- T022–T024 are independent security/export/persistence cases after the artifact builder exists.

## Convergence Audit

Completed on 2026-08-31 after implementation and release-gate verification.

- FR-001–FR-014 and FR-023 are covered by the v1 recorder, deterministic entries, policy history, recovery/transport summaries, independent verification reducer, derivative relationships, and six terminal fixture categories.
- FR-015–FR-018 are covered by RFC 8785 canonicalization, SHA-256 sealing, bounded validation, typed issues, and separate external-attestation trust evaluation.
- FR-019–FR-022 are covered by fixed safe summaries, exact-key rejection, explicit re-sealed exports, bounded authorized annotations, and non-throwing persistence outcomes with raw-error isolation.
- FR-024–FR-026 are covered by application-owned sink/retention documentation, no original-byte processing, and explicit unsigned trust limitations.
- SC-001–SC-010 are covered by 21 focused provenance tests, package ESM/CJS/example verification, 242 passing unit tests, 20 passing UI tests, conformance/reference/browser gates, integration-safe skip, package dry run, and diff checks.
- Reconciliation found no remaining unbuilt work. Policy changes and repeated verification attempts were retained explicitly during the audit rather than silently replacing their history.
