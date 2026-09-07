# Tasks: Verified Ingest Workflow

**Input**: Design documents from `specs/019-verified-ingest-workflow/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/workflow-api.md`, `quickstart.md`

**Tests**: Required by the specification. Test tasks precede implementation tasks within each user story and must fail for the intended reason before implementation.

**Organization**: Tasks are grouped by user story and dependency order. The product decisions in `research.md` are final planning inputs; changing one requires updating the contract and rerunning analysis before implementation.

## Phase 1: Regression Baseline And Contract Freeze

**Purpose**: Freeze the selected additive contract and capture the existing public behavior that must not change.

- [X] T001 [P] Capture unchanged legacy root/core/session/provenance/preservation/Node/React export baselines in tests/workflow-compatibility-baseline.test.ts
- [X] T002 [P] Encode the frozen factory, adapter, state, terminal-result, evidence-bundle, and React names as compile-only fixtures in tests/fixtures/workflow-contract.ts
- [X] T003 Add failing browser/Node subpath boundary assertions for the planned workflow exports in tests/workflow-package-boundary.test.ts and tests/package-exports.test.ts

**Checkpoint**: Existing compatibility behavior is executable, the selected contract is type-checkable as a target, and the browser/Node boundary fails only because the new subpaths are not implemented yet.

---

## Phase 2: Foundational Public Types And Fixtures

**Purpose**: Establish shared types and credential-free fixtures that block all story implementation.

- [X] T004 Add additive workflow state, run-result, strict terminal-state, stage, issue, adapter, checkpoint, and evidence bundle public types in src/workflow-types.ts
- [X] T005 [P] Add deterministic credential-free workflow adapters, call counters, seeded-secret values, and synthetic Blob fixtures in tests/workflow-fixtures.ts
- [X] T006 [P] Add table-driven canonical state, recovery, idempotency, and evidence-bundle fixtures in tests/fixtures/workflow-states.ts and tests/fixtures/workflow-evidence.ts
- [X] T007 Add workflow error construction, invalid-transition codes, and safe error projection using the frozen types in src/workflow-errors.ts
- [X] T008 Export only frozen public workflow types/constants from the planned browser-safe entrypoint in src/workflow.ts

**Checkpoint**: Shared contracts compile, fixture secrets are available for leak tests, and no runtime orchestration exists yet.

---

## Phase 3: User Story 1 - Complete One Verified Ingest (Priority: P1) — MVP

**Goal**: Run one exact source through explicit profile evaluation, the existing authoritative upload session, independent stored verification, provenance sealing, and durable evidence persistence.

**Independent Test**: A credential-free valid source reaches `evidence_persisted`, returns a valid bundle, uses exactly one core session, and performs no source transform or duplicate profile-layer read.

### Tests for User Story 1

- [X] T009 [P] [US1] Add compile-time state narrowing, factory options, recoverable run-result versus strict terminal-state, and package export tests in tests/workflow-contract.test.ts and tests/package-exports.test.ts
- [X] T010 [P] [US1] Add the profile-to-manifest-to-session-to-verification-to-evidence happy-path integration test with exact adapter call order in tests/workflow-happy-path.test.ts
- [X] T011 [P] [US1] Add tests proving the exact Blob reaches the core session and no decode, resize, rewrite, EXIF strip, or extra profile Blob read occurs in tests/workflow-original-preservation.test.ts
- [X] T012 [P] [US1] Add transfer-complete-versus-stored-verified authority assertions and failed-profile pre-mutation call counts in tests/workflow-authority.test.ts

### Implementation for User Story 1

- [X] T013 [US1] Implement minimal evidence bundle creation and self-hash integrity needed by the happy path in src/evidence-bundle.ts
- [X] T014 [US1] Implement profile selection, manifest creation, profile evaluation, and session binding without duplicate file reads in src/workflow.ts
- [X] T015 [US1] Delegate upload lifecycle, pause, cancel, and event forwarding to one LargeImageIngestSession without chunk or receipt state duplication in src/workflow.ts
- [X] T016 [US1] Invoke the stored verifier only after the core completed event and record its typed outcome in the existing provenance recorder in src/workflow.ts
- [X] T017 [US1] Seal provenance, persist provenance plus bundle through one stable evidence operation, and return typed terminal success/failure in src/workflow.ts
- [X] T018 [US1] Add the additive ./workflow export map, ESM/CJS build output, and package consumption checks in package.json, tsconfig.json, tsconfig.cjs.json, and scripts/verify-package-consumption.cjs
- [X] T019 [US1] Add a credential-free public-export-only golden-path example matching the frozen contract in examples/verified-ingest-workflow.ts

**Checkpoint**: The no-preservation workflow is a complete independently testable product slice ending at durable evidence persistence.

---

## Phase 4: User Story 2 - Recover Without Ambiguous Authority (Priority: P1)

**Goal**: Continue safely after pause, failure, lost acknowledgement, or process restart while retaining existing core resume authority and post-upload idempotency.

**Independent Test**: Restart from every stable state, inject before/after-effect failures, and prove already authoritative stages are not repeated and ambiguous effects reconcile before retry.

### Tests for User Story 2

- [X] T020 [P] [US2] Add exact-key checkpoint schema, revision conflict, stale writer, source/profile mismatch, and forbidden-field tests in tests/workflow-checkpoint.test.ts
- [X] T021 [P] [US2] Add restart tests for prepared, uploading, paused, uploaded_unverified, verified, and evidence persistence states in tests/workflow-recovery.test.ts
- [X] T022 [P] [US2] Add verification/evidence-revision idempotency, stable operation ID, lost-acknowledgement, reconcile-before-repeat, and call-count tests in tests/workflow-idempotency.test.ts
- [X] T023 [P] [US2] Add pause/cancel/chunk-ack/completion race and invalid-transition tests that assert core session authority in tests/workflow-races.test.ts
- [X] T024 [P] [US2] Add metadata-equal different-byte, manifest, profile, chunking, and transport mismatch pre-mutation tests in tests/workflow-source-rejection.test.ts

### Implementation for User Story 2

- [X] T025 [US2] Implement workflow checkpoint v1 parsing, exact-key validation, restricted recovery references, and compare-and-set revisions in src/workflow-checkpoint.ts
- [X] T026 [US2] Implement deterministic stage operation identities and monotonic attempt summaries across restart in src/workflow-operation.ts
- [X] T027 [US2] Implement resume by validating the workflow checkpoint and delegating upload continuation to the existing ResumeStore and session.resume() in src/workflow.ts
- [X] T028 [US2] Implement post-upload retry and adapter reconciliation without upload recreation or blind external-effect repetition in src/workflow.ts
- [X] T029 [US2] Implement typed paused, stopped, failed, canceled, and reconciliation-required outcomes including evidence-finalization failure with last-authoritative-state preservation in src/workflow.ts
- [X] T030 [US2] Add safe workflow event/state/checkpoint summaries and isolate subscriber/callback failures from workflow operations in src/workflow-diagnostics.ts and src/workflow.ts

**Checkpoint**: Every state/failure/idempotency row in data-model.md has an executable, restart-safe path or explicit terminal outcome.

---

## Phase 5: User Story 3 - Retain A Portable Evidence Dossier (Priority: P2)

**Goal**: Validate, safely summarize, explicitly export, and durably reference evidence bundle v1 without merging manifest, resume, provenance, or preservation roles.

**Independent Test**: Intact fixtures validate; every covered identity/state/order/reference/integrity mutation fails with typed safe issues; default summaries expose no seeded restricted values.

### Tests for User Story 3

- [X] T031 [P] [US3] Add evidence bundle schema, exact-key, terminal consistency, stage ordering, and cross-artifact mutation tests in tests/evidence-bundle.test.ts
- [X] T032 [P] [US3] Add self-hash integrity versus actor/time trust tests and external-attestation non-claims in tests/evidence-bundle-integrity.test.ts
- [X] T033 [P] [US3] Add safe-summary, authorized-export, unsupported-version, and seeded-secret leakage tests in tests/evidence-bundle-security.test.ts
- [X] T034 [P] [US3] Add evidence sink initial/final revision, immutable conflict, acknowledgement loss, reconciliation, same-operation replay, and persistence reference tests in tests/workflow-evidence-persistence.test.ts

### Implementation for User Story 3

- [X] T035 [US3] Complete evidence bundle v1 construction and exact-key validation across manifest, profile, transfer, verification, provenance, stage, terminal, and trust fields in src/evidence-bundle.ts
- [X] T036 [US3] Implement safe bundle summary and explicit audit/authorized-full exports without copying unknown fields in src/evidence-bundle.ts
- [X] T037 [US3] Integrate immutable bundle revision receipts and cross-artifact validation into authoritative workflow results in src/workflow.ts
- [X] T038 [US3] Export evidence bundle validators, summaries, disclosure types, and constants from src/workflow.ts

**Checkpoint**: The dossier is independently consumable and tamper-detecting without pretending to be signed, timestamp-trusted, or a resume record.

---

## Phase 6: User Story 4 - Hand Off To Preservation Deliberately (Priority: P2)

**Goal**: Add an optional post-evidence preservation adapter and thin Node helpers while retaining the existing new-output-only preservation boundary.

**Independent Test**: Not-requested, successful, blocked, failed, ambiguous, and retried preservation outcomes never change upload, verification, or evidence-persistence authority.

### Tests for User Story 4

- [X] T039 [P] [US4] Add optional/not-requested, success, blocked, failed, retry, reconcile, and post-handoff evidence-finalization tests proving preservation is never repeated in tests/workflow-preservation.test.ts
- [X] T040 [P] [US4] Add Node stored-file verifier adapter tests with trusted path resolution and existing verification issue mapping in tests/node-workflow.test.ts
- [X] T041 [P] [US4] Add Node BagIt/OCFL handoff adapter tests for new destinations, interrupted staging, repeat operation IDs, safe references, and repository non-goals in tests/node-workflow-preservation.test.ts

### Implementation for User Story 4

- [X] T042 [US4] Implement preservation after the initial pending bundle revision and commit its exact outcome as a final immutable revision without repeating handoff during finalization recovery in src/workflow.ts
- [X] T043 [US4] Add a thin StoredObjectVerificationAdapter over verifyNodeFileManifest() with application path resolution in src/node-workflow.ts
- [X] T044 [US4] Add a thin PreservationHandoffAdapter over evaluatePreservationMapping() and new BagIt/OCFL exporters without append or repository management in src/node-workflow.ts
- [X] T045 [US4] Export Node workflow adapters additively without making them browser-reachable in src/node.ts and package.json

**Checkpoint**: Preservation is an optional handoff, and `evidence_persisted` remains complete success when the adapter is absent.

---

## Phase 7: Integrated React Control-Plane Projection

**Purpose**: Raise the first-party control-plane experience without changing or duplicating the existing upload controller.

- [X] T046 [P] Add failing headless controller subscription, state/action, stale-result, and callback-isolation tests in tests/react-workflow-controller.test.ts
- [X] T047 [P] Add failing ready-made UI lifecycle, keyboard, live-region, 320px, 200% zoom, and safe-error tests in tests/react-ui-workflow.test.tsx and tests/ui-browser/verified-ingest-workflow.spec.ts
- [X] T048 Implement a headless controller and hooks that directly project VerifiedIngestWorkflow state/actions in src/react-workflow-controller.ts and src/react.ts
- [X] T049 Implement the distinct verified-workflow provider, panel, and composable status/actions without a second state machine in src/react-ui/verified-workflow/ and src/react-ui.ts
- [X] T050 Extend existing opt-in CSS tokens and scoped styles for evidence/preservation/reconciliation states in styles/react-ui.css

**Checkpoint**: The new UI reaches evidence persistence/preservation using workflow authority; the existing InspectionUploadPanel remains behaviorally unchanged.

---

## Phase 8: Conformance, Benchmarks, Documentation, And Release Readiness

**Purpose**: Prove compatibility, bounded large-file behavior, adoption impact, honest claims, and complete documentation.

- [X] T051 [P] Add a versioned credential-free workflow state/failure/idempotency conformance catalog and runner in src/conformance.ts, tests/workflow-conformance.test.ts, and benchmarks/workflow/
- [X] T052 [P] Add browser import-graph and bounded large-Blob read/memory checks for the workflow subpath in tests/browser-workflow.test.ts and scripts/verify-package-consumption.cjs
- [X] T053 Rerun and retain 1 GiB/3 GiB reference and Worker measurements with optional preservation reads reported separately in benchmarks/results/ and docs/benchmarks.md
- [X] T054 Update the adoption-evidence protocol input identity, workflow candidate, responsibility matrix, and raw rerun while retaining adverse/parity results in benchmarks/adoption/, benchmarks/results/, tests/adoption-*.test.ts, and docs/adoption-evidence.md
- [X] T055 [P] Replace the README first-screen example with the 20–30-line workflow path and retain the low-level session link in README.md and docs/quickstart.md
- [X] T056 [P] Document authority, states, failure/recovery/idempotency, evidence schema, browser/Node boundaries, and application adapters in docs/verified-ingest-workflow.md and docs/server-operational-guide.md
- [X] T057 [P] Document migration and precise relationships to profiles, provenance, preservation, React UI, and external trust in docs/domain-profiles.md, docs/provenance.md, docs/preservation.md, and docs/react-ui.md
- [X] T058 Update version/roadmap/release wording after implementation, evidence, and documentation acceptance tasks complete in docs/roadmap.md, CHANGELOG.md, package.json, src/package-version.ts, and specs/019-verified-ingest-workflow/spec.md
- [X] T059 Run npm run typecheck, npm run typecheck:examples, npm run typecheck:inspection-ui-example, npm test, npm run test:ui, npm run build, npm run test:conformance, npm run test:browser-checksum, npm run test:reference, npm run test:adoption-evidence, and npm audit --audit-level=moderate against the final package metadata from package.json
- [X] T060 Perform a final claim/scope review for signing, trusted time, compliance, provider qualification, repository operation, OCFL append, retention, and source mutation across README.md, docs/, examples/, and specs/019-verified-ingest-workflow/

---

## Dependencies & Execution Order

### Phase dependencies

- Phase 1 blocks all implementation because it freezes regression evidence, public names, and package boundaries.
- Phase 2 depends on Phase 1 and blocks every user story.
- US1 is the MVP and must complete before US2 and US3 integration.
- US2 checkpoint/recovery and US3 bundle validation may be developed in parallel after the US1 public contract is stable, but their integrations into `src/workflow.ts` must be serialized.
- US4 depends on US1 evidence persistence and the US3 final bundle contract.
- React projection depends on stable US1–US4 workflow states but can develop tests/components against frozen types after Phase 2.
- Conformance, benchmarks, documentation, and release readiness depend on the selected implementation scope being complete.

### User story dependencies

- **US1**: no story dependency after Foundation; independently delivers verified ingest through durable evidence without preservation.
- **US2**: depends on US1 factory/state contract; independently validates pause/restart/retry/reconciliation behavior.
- **US3**: depends on US1 minimal bundle; independently validates durable dossier consumption and disclosure.
- **US4**: depends on US1 and US3 final evidence contract; independently validates optional preservation handoff.

### Parallel opportunities

- T005 and T006 may run in parallel after T004 starts defining frozen types.
- Test tasks marked `[P]` in each story touch separate files and may be authored in parallel before implementation.
- US2 checkpoint internals and US3 bundle validators may proceed in parallel, with final workflow wiring serialized.
- Node adapter tests/implementation and React projection tests may proceed in parallel after the workflow contract is stable.
- Documentation tasks T055–T057 may proceed in parallel after public names and observed results are final.

## Parallel Example: User Story 2

```text
Task T020: checkpoint schema/revision tests
Task T021: process-restart state tests
Task T022: idempotency/reconciliation tests
Task T023: pause/cancel race tests
Task T024: mismatch pre-mutation tests
```

These tests are independent files. Implementations T025–T030 then proceed in dependency order because they converge on `src/workflow.ts`.

## Implementation Strategy

### MVP first

1. Complete T001–T003 regression baselines and contract fixtures.
2. Complete Foundation T004–T008.
3. Complete US1 T009–T019.
4. Stop and validate a one-file, no-preservation workflow ending at `evidence_persisted`.

### Incremental delivery

1. Add US2 restart/idempotency and validate every recovery boundary.
2. Add US3 full dossier validation/disclosure.
3. Add US4 optional Node preservation handoff.
4. Add React projection.
5. Produce fresh conformance/adoption/benchmark evidence and only then update release metadata.

## Task Summary

- Total tasks: 60
- Setup/contract freeze: 3
- Foundational: 5
- US1: 11
- US2: 11
- US3: 8
- US4: 7
- React projection: 5
- Conformance/docs/release: 10
- Suggested MVP: T001–T019, ending at durable `evidence_persisted` without optional preservation

All task checklist lines include a sequential ID and an exact repository path. User-story tasks include `[US#]`; `[P]` is used only for separate files with no incomplete dependency.
