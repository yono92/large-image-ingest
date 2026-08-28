# Tasks: First-Party Inspection Upload UI

**Input**: Design documents from `/specs/012-first-party-react-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Focused controller, coordinator, component, accessibility, browser, reference, export, and package-consumption tests are required by the feature specification and release criteria.

**Organization**: Tasks follow implementation Phases A through E. Within the implementation phases, work is grouped by user story so each product increment remains independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and does not depend on an incomplete task.
- **[Story]**: Maps implementation work to one user story from spec.md.
- Every task names the exact file or files it changes.

## Phase A: Contract Prerequisites (Shared Foundation)

**Purpose**: Make validation and source-identity preparation authoritative and observable before any styled UI is introduced.

**Exit Criteria**: Preflight rejection is typed as `validation.failed`; controller state distinguishes validation, identity preparation, and upload creation; existing callbacks still run; observer/callback failures cannot interrupt ingest; existing public fields and operations remain source compatible.

- [X] T001 Add failing regression tests for `validation.failed`, unchanged manifest/snapshot behavior, and existing controller API compatibility in tests/session.test.ts and tests/react-controller.test.ts
- [X] T002 Correct preflight validation rejection from `transport.failed` to `validation.failed` without changing validation results in src/session.ts
- [X] T003 Add additive preparation phase/progress public types to `IngestControllerState` in src/react-controller.ts and re-export them from src/react.ts
- [X] T004 Compose checksum progress so controller preparation updates and the application-supplied checksum callback both run in src/react-controller.ts
- [X] T005 Isolate controller-internal observers, user callbacks, and subscriber failures so none can interrupt ingest authority in src/react-controller.ts
- [X] T006 Expand focused controller tests for validating, preparing identity, creating upload, checksum callback preservation, thrown user callbacks, and duplicate-operation prevention in tests/react-controller.test.ts
- [X] T007 [P] Document the additive headless lifecycle and validation correction in README.md and CHANGELOG.md
- [X] T008 Run `npm run typecheck` and focused session/controller tests; fix only Phase A regressions in src/session.ts, src/react-controller.ts, tests/session.test.ts, and tests/react-controller.test.ts

**Checkpoint**: No message inspection or synthetic timer is required to present validation and source preparation.

---

## Phase B1: User Story 1 - Complete Authoritative Inspection Upload Experience (Priority: P1) MVP

**Goal**: Provide unstyled public behavior for exact-file selection through transfer completion and stored-original verification, backed by exactly one headless controller.

**Independent Test**: Mount the provider with a deterministic fake controller and verifier, select one exact `File`, exercise every valid action, complete transfer, and verify that UI state never invents bytes, completion, or integrity.

### Tests for User Story 1

- [X] T009 [P] [US1] Add failing safe error mapping/redaction tests for validation, transport, cancellation, cleanup, observer, verification, and unknown failures in tests/react-ui-coordinator.test.ts
- [X] T010 [P] [US1] Add failing coordinator tests for one controller per file, exact `File` identity, action gating, duplicate-operation prevention, and stale completion/verification results in tests/react-ui-coordinator.test.ts
- [X] T011 [P] [US1] Add failing public component/context tests for provider usage errors, semantic states, acknowledged progress, no automatic preview read, and server rendering in tests/react-ui-components.test.tsx

### Implementation for User Story 1

- [X] T012 [US1] Define immutable UI phase, source, preparation, controls, safe error, preview derivative, verifier, callback, slot, and aggregate state contracts in src/react-ui/types.ts
- [X] T013 [P] [US1] Implement complete stable default labels and partial override merging in src/react-ui/labels.ts
- [X] T014 [P] [US1] Implement typed safe error categorization and sanitized guidance without raw sensitive payload rendering in src/react-ui/safe-error.ts
- [X] T015 [US1] Implement the presentation coordinator with exact-file ownership, one-controller lifetime, controller-derived phases/progress, valid actions, callback isolation, and generation-based stale-result rejection in src/react-ui/coordinator.ts
- [X] T016 [US1] Implement required context, `InspectionUploadProvider`, and `useInspectionUploadUi` in src/react-ui/context.ts and src/react-ui/InspectionUploadProvider.tsx
- [X] T017 [US1] Implement minimally styled semantic selection, source, validation, preparation, transfer, controls, verification, and error primitives in src/react-ui/InspectionFileDropzone.tsx, src/react-ui/InspectionSourceCard.tsx, src/react-ui/InspectionValidationSummary.tsx, src/react-ui/InspectionPreparationProgress.tsx, src/react-ui/InspectionUploadProgress.tsx, src/react-ui/InspectionUploadControls.tsx, src/react-ui/InspectionVerificationStatus.tsx, and src/react-ui/InspectionErrorNotice.tsx
- [X] T018 [US1] Implement `InspectionUploadPanel` composition and bounded required live/status regions in src/react-ui/InspectionUploadPanel.tsx
- [X] T019 [US1] Add the optional public barrel and initial ESM/CommonJS/declaration package export wiring for components, hook, labels, and types in src/react-ui.ts, package.json, tsconfig.json, and tsconfig.cjs.json
- [X] T020 [US1] Make coordinator and component tests pass while preserving exact source identity and application-visible original typed errors in tests/react-ui-coordinator.test.ts and tests/react-ui-components.test.tsx

**Checkpoint**: Selection through verified completion works without CSS, Uppy, a second upload state machine, or source transformation.

---

## Phase B2: User Story 2 - Safe Interrupted Upload Recovery (Priority: P1)

**Goal**: Discover durable records as safe summaries, require source compatibility, resume through the authoritative controller, and keep stale recovery results from crossing file generations.

**Independent Test**: List multiple records, reselect a matching and then mismatching source, resume only the compatible choice with no new work before validation, and prove late list/classification results cannot attach to a replacement source.

### Tests for User Story 2

- [X] T021 [P] [US2] Add failing recovery tests for safe projection, expiry, compatible/mismatched source and chunking, multiple choices, optional discard, and private record containment in tests/react-ui-recovery.test.tsx
- [X] T022 [US2] Add failing race tests for refresh, classification, resume, discard, and source replacement generations in tests/react-ui-recovery.test.tsx

### Implementation for User Story 2

- [X] T023 [US2] Extend recovery public configuration and safe choice types without exposing full records or provider evidence in src/react-ui/types.ts
- [X] T024 [US2] Implement resume-store discovery, safe projection, public compatibility classification, explicit compatible-choice selection, and authorized discard in src/react-ui/coordinator.ts
- [X] T025 [US2] Implement accessible reselection guidance, compatibility outcomes, multiple-choice selection, refresh, resume, and optional discard in src/react-ui/InspectionRecoveryPrompt.tsx
- [X] T026 [US2] Integrate recovery state and actions into the provider, hook, and default panel in src/react-ui/InspectionUploadProvider.tsx, src/react-ui/context.ts, and src/react-ui/InspectionUploadPanel.tsx
- [X] T027 [US2] Make recovery and race tests pass while retaining recoverable mismatch records and blocking all remote work before compatibility succeeds in tests/react-ui-recovery.test.tsx

**Checkpoint**: Reload recovery is safe, provider-neutral, source-compatible, and free of full-record disclosure.

---

## Phase C: User Story 3 - Compose, Brand, And Access The Official UI (Priority: P2)

**Goal**: Ship the complete polished panel and composable primitives with opt-in prefixed CSS, bounded customization, keyboard operation, responsive layout, and restrained announcements.

**Independent Test**: Render the default panel and an alternate primitive composition, apply label/token overrides and a caller-owned derivative, then complete keyboard journeys at 320 CSS pixels, desktop, 200% zoom, and reduced motion.

### Tests for User Story 3

- [X] T028 [P] [US3] Add dev-only DOM/accessibility scanner setup and failing tests for native names/roles, valid disabled states, progress semantics, focus transitions, live-region throttling, derivative labeling, and every major lifecycle state in package.json, tests/react-ui-accessibility.test.tsx, and vitest.config.ts
- [X] T029 [P] [US3] Add failing stylesheet contract tests for `lii-`/`--lii-` prefixing, opt-in delivery, no global reset/leakage, responsive actions, and reduced motion in tests/react-ui-css.test.ts
- [X] T030 [P] [US3] Add the credential-free browser runner/config and failing journeys for keyboard selection/control, 320px, 200% zoom, reduced motion, recovery, verification failure, and default/alternate theme review artifacts in package.json, playwright.config.ts, scripts/run-ui-tests.cjs, and tests/ui-browser/inspection-upload.spec.ts

### Implementation for User Story 3

- [X] T031 [US3] Add bounded header, preview, selection guidance, recovery guidance, and terminal follow-up slots with slot-failure isolation in src/react-ui/types.ts and src/react-ui/InspectionUploadPanel.tsx
- [X] T032 [US3] Finalize native semantics, stable focus targets, polite/assertive announcements, and non-color status cues across src/react-ui/InspectionFileDropzone.tsx, src/react-ui/InspectionUploadControls.tsx, src/react-ui/InspectionRecoveryPrompt.tsx, src/react-ui/InspectionErrorNotice.tsx, and src/react-ui/InspectionVerificationStatus.tsx
- [X] T033 [US3] Create the opt-in scoped stylesheet, stable token set, responsive container layout, tabular progress values, visible focus, AA-oriented colors, and reduced-motion rules in styles/react-ui.css
- [X] T034 [US3] Make component, accessibility, CSS, and browser tests pass for default and custom compositions in tests/react-ui-components.test.tsx, tests/react-ui-accessibility.test.tsx, tests/react-ui-css.test.ts, and tests/ui-browser/inspection-upload.spec.ts

**Checkpoint**: The official panel is usable without host CSS and can be branded without forking lifecycle behavior or breaking accessibility.

---

## Phase D: User Story 4 - Credential-Free Official Reference Experience (Priority: P3)

**Goal**: Make the first-party UI the default runnable product experience while retaining the Uppy example as an optional UI-only integration recipe.

**Independent Test**: From a clean checkout, run the official example and reproduce all nine required outcomes without credentials or Uppy; then run the existing Uppy flow against the same provider-neutral local infrastructure.

### Tests for User Story 4

- [X] T035 [P] [US4] Add failing shared local fixture/transport/server and nine-outcome reference contract tests in tests/react-ui-reference.test.ts
- [X] T036 [P] [US4] Add failing example typecheck and package-public-import assertions for the official app in tests/package-exports.test.ts and tsconfig.inspection-ui-example.json

### Implementation for User Story 4

- [X] T037 [US4] Extract provider-neutral fixture generation, bounded local server, and local reference transport from Uppy-specific paths into examples/reference-local/create-fixture.cjs, examples/reference-local/local-server.mjs, and examples/reference-local/local-reference-transport.ts
- [X] T038 [US4] Update scripts/create-uppy-example-fixture.cjs, scripts/run-uppy-example.cjs, and examples/uppy-react/ to reuse provider-neutral infrastructure while preserving the existing Uppy recipe
- [X] T039 [US4] Build the official public-export-only panel and alternate-theme composition in examples/inspection-upload-react/src/App.tsx, examples/inspection-upload-react/src/main.tsx, and examples/inspection-upload-react/src/example-theme.css
- [X] T040 [P] [US4] Add the official example Vite/HTML/compiler setup in examples/inspection-upload-react/vite.config.ts, examples/inspection-upload-react/index.html, and tsconfig.inspection-ui-example.json
- [X] T041 [US4] Add fixture and process launchers plus package scripts in scripts/run-inspection-ui-example.cjs and package.json
- [X] T042 [P] [US4] Document clean-checkout setup and all nine outcome exercises in examples/inspection-upload-react/README.md
- [X] T043 [US4] Make official and Uppy reference tests/typechecks pass against shared local infrastructure in tests/react-ui-reference.test.ts, tests/uppy-reference-integration.test.ts, and tests/uppy-selection-bridge.test.ts

**Checkpoint**: The project demonstrates its own UI without credentials or Uppy, and the Uppy integration remains functional and clearly optional.

---

## Phase E: Release Convergence And Cross-Cutting Verification

**Purpose**: Publish isolated exports/styles, align documentation, and run every release-relevant integrity, accessibility, reference, package, and formatting gate.

- [X] T044 Finalize and verify ESM/CommonJS/declaration exports for `large-image-ingest/react-ui`, stylesheet export/side-effect metadata, example scripts, and no new runtime dependency in package.json, tsconfig.json, and tsconfig.cjs.json
- [X] T045 [P] Extend package consumption/export tests for styled, headless, SSR, CSS, dependency-isolation, and no-Uppy boundaries in scripts/verify-package-consumption.cjs and tests/package-exports.test.ts
- [X] T046 [P] Update generated/local UI fixture, data, Vite, screenshot, trace, and browser artifact exclusions without removing existing dirty rules in .gitignore and .npmignore
- [X] T047 [P] Write the public panel/provider/primitives/recovery/verification/theme/accessibility guide and headless prerequisite notes in docs/react-ui.md
- [X] T048 [P] Lead with the first-party UI, preserve headless and Uppy choices, document the single-local-file limit, and align examples in README.md and docs/integrations/uppy.md
- [X] T049 [P] Align release state, roadmap positioning, public API additions, and validation correction in docs/roadmap.md and CHANGELOG.md
- [X] T050 Run `npm run typecheck`, `npm run typecheck:examples`, `npm run typecheck:uppy-example`, `npm run typecheck:inspection-ui-example`, and fix scoped failures
- [X] T051 Run `npm test` and `npm run test:ui`; fix unit, DOM, accessibility, CSS, race, and browser failures
- [X] T052 Run `npm run build`, `npm run test:reference`, `npm run smoke:exports`, and all new UI/reference validation scripts; fix scoped failures
- [X] T053 Run the ten-trial compatible recovery/no-duplicate-byte and incompatible-source/no-remote-work gates and record reproducible evidence in specs/012-first-party-react-ui/quickstart.md
- [X] T054 Run `npm pack --dry-run` and inspect the tarball and optional UI JS/CSS sizes for included public artifacts and excluded generated/sensitive state
- [X] T055 Run `npm audit --audit-level=moderate` and `git diff --check`; fix release-blocking scoped findings
- [X] T056 Reconcile implementation, tests, docs, exports, and package contents against FR-001–FR-025 and SC-001–SC-012 in specs/012-first-party-react-ui/tasks.md

**Checkpoint**: All requested release checks pass, documentation describes the implemented surface exactly, and no generated fixture, credential, provider evidence, or sensitive local state ships.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase A** starts immediately and blocks all first-party UI implementation.
- **Phase B1 / US1** depends on Phase A and establishes the coordinator/provider contract.
- **Phase B2 / US2** depends on Phase B1 controller lifetime and state projection.
- **Phase C / US3** depends on B1 and B2 semantic behavior; CSS tests may be drafted earlier.
- **Phase D / US4** depends on the stable public components from Phase C; provider-neutral infrastructure tests may be drafted earlier.
- **Phase E** depends on all desired stories and is the final release gate.

### User Story Dependencies

- **US1** is the MVP and independently proves exact-file selection through verified completion.
- **US2** reuses US1's provider/coordinator and independently proves safe durable recovery.
- **US3** composes US1/US2 behavior without adding lifecycle authority.
- **US4** consumes the completed public surface and shared local infrastructure only.

### Parallel Opportunities

- T007 can proceed while T006 completes because it changes documentation only.
- T009, T010, and T011 cover different behavioral contracts and test files.
- T013 and T014 affect independent helper modules after T012 defines types.
- T021 and T022 share one recovery test file and therefore execute sequentially in one workspace.
- T028, T029, and T030 cover DOM, CSS, and browser layers in separate files.
- T035 and T036 cover reference behavior and package/type boundaries separately.
- T040 and T042 affect independent example configuration and documentation.
- T045 through T049 affect separate package/test/document files after the public surface stabilizes.

---

## Parallel Example: User Story 1

```text
Task T009: safe error/redaction contract tests in tests/react-ui-coordinator.test.ts
Task T011: provider/component/SSR contract tests in tests/react-ui-components.test.tsx

After T012 defines public types:
Task T013: default labels in src/react-ui/labels.ts
Task T014: safe mapping in src/react-ui/safe-error.ts
```

## Parallel Example: User Story 3

```text
Task T028: DOM and accessibility tests in tests/react-ui-accessibility.test.tsx
Task T029: CSS boundary tests in tests/react-ui-css.test.ts
Task T030: browser journeys in tests/ui-browser/inspection-upload.spec.ts
```

---

## Implementation Strategy

### MVP First

1. Complete Phase A and verify additive headless compatibility.
2. Complete Phase B1 / US1.
3. Stop only long enough to run the US1 independent test from exact selection to verification.
4. Continue through recovery, styling/accessibility, reference, and release convergence while checks remain executable.

### Incremental Delivery

1. Phase A makes lifecycle prerequisites authoritative.
2. Phase B1 delivers the complete unstyled main journey.
3. Phase B2 adds safe durable recovery.
4. Phase C adds the default visual system, composition, and accessibility contract.
5. Phase D proves clean-checkout adoption and preserves Uppy compatibility.
6. Phase E publishes and verifies the final optional surface.

## Notes

- Tests precede their corresponding implementation tasks.
- React remains an optional peer and no task adds a published UI runtime dependency.
- Full resume records, manifests, URLs, keys, receipts, credentials, and customer metadata never enter render state or slots.
- The UI never reads, decodes, resizes, recompresses, strips metadata from, or automatically previews the original.
- Mark every completed task `[X]` as implementation proceeds.
