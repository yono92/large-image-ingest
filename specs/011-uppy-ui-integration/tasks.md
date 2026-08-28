# Tasks: Uppy UI Integration

**Input**: Design documents from `/specs/011-uppy-ui-integration/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Focused Vitest, example type checking, credential-free loopback verification, and runnable browser validation are required by the feature specification.

**Organization**: Tasks are grouped by user story so the UI composition, runnable example, adapter decision, and later tus-js-client review remain independently reviewable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and does not depend on an incomplete task.
- **[Story]**: Maps implementation work to one user story from spec.md.
- Every task names the exact file or files it changes.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add development-only dependencies and scripts without changing published runtime dependencies or public exports.

- [x] T001 Add matching Uppy React UI and Vite development dependencies plus example scripts in package.json and package-lock.json
- [x] T002 Add React example compiler configuration in tsconfig.uppy-example.json and wire it into the existing typecheck scripts in package.json
- [x] T003 [P] Add generated fixture and local example artifact patterns to .gitignore

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create reproducible local inputs and shared example layout required by the user-story implementations.

**CRITICAL**: User-story work begins only after the example can create a deterministic multi-chunk source without external data.

- [x] T004 Add failing fixture generation assertions for byte size, repeatability, and ignored output location in tests/uppy-reference-integration.test.ts
- [x] T005 Create the planned examples/uppy-react/src directory and deterministic inspection-like fixture generator in scripts/create-uppy-example-fixture.cjs

**Checkpoint**: A credential-free multi-chunk local source can be generated repeatably.

---

## Phase 3: User Story 1 - Add Uppy Without Duplicating Upload Ownership (Priority: P1) MVP

**Goal**: Let Uppy own one local-file selection UI while large-image-ingest remains the sole owner of the ingest lifecycle.

**Independent Test**: Add and remove local files through an Uppy instance, reject unsupported remote/Blob-only entries and second selections, and prove no Uppy uploader or upload lifecycle API participates.

### Tests for User Story 1

- [x] T006 [P] [US1] Add failing selection-bridge tests for local File acceptance, unsupported source rejection, one-file enforcement, and active-removal policy in tests/uppy-selection-bridge.test.ts

### Implementation for User Story 1

- [x] T007 [US1] Implement the example-private local File selection and removal bridge in examples/uppy-react/src/selection-bridge.ts
- [x] T008 [US1] Implement Uppy headless Dropzone and selected-file UI without uploader/status ownership in examples/uppy-react/src/UppySelection.tsx
- [x] T009 [US1] Document the ownership matrix, event mapping, recovery mapping, and prohibited Uppy upload APIs in docs/integrations/uppy.md

**Checkpoint**: The selection path is independently testable and contains no Uppy uploader, preprocessing, remote-source, or upload-state integration.

---

## Phase 4: User Story 2 - Run A Complete React Reference Flow (Priority: P1)

**Goal**: Provide an actually runnable React example with real local HTTP transfer, pause/reload recovery, cancellation, and stored-original verification.

**Independent Test**: From a clean root install, generate a fixture, run the example, transfer at least three chunks, pause or interrupt after a checkpoint, reload and reselect the same file, resume without duplicate accepted bytes, and finish with server-side checksum verification.

### Tests for User Story 2

- [x] T010 [P] [US2] Add failing HTTP contract tests for create, status, chunk, completion verification, cancellation, invalid range, and terminal mutation in tests/uppy-reference-integration.test.ts
- [x] T011 [P] [US2] Add failing transport tests for session creation, durable resume lookup, receipt mapping, completion, cancellation, and 10 consecutive mismatch-rejection/no-duplicate recovery trials in tests/uppy-reference-integration.test.ts
- [x] T012 [P] [US2] Add failing browser-selection composition tests for exact-file identity, unsupported sources, removal policy, same-file recovery, and incompatible-file rejection in tests/uppy-selection-bridge.test.ts

### Implementation for User Story 2

- [x] T013 [US2] Implement the bounded streaming local reference target and safe status API in examples/uppy-react/local-server.mjs
- [x] T014 [US2] Implement the example-private resumable UploadTransport and safe verification lookup in examples/uppy-react/src/local-reference-transport.ts
- [x] T015 [US2] Implement the large-image-ingest controller composition, recovery selection, controls, progress, safe errors, and verification UI in examples/uppy-react/src/App.tsx
- [x] T016 [P] [US2] Add the React entrypoint and accessible example styling in examples/uppy-react/src/main.tsx and examples/uppy-react/src/styles.css
- [x] T017 [P] [US2] Add the Vite HTML and proxy/build configuration in examples/uppy-react/index.html and examples/uppy-react/vite.config.ts
- [x] T018 [US2] Add a process launcher that builds the package and manages the local service and Vite lifecycle in scripts/run-uppy-example.cjs
- [x] T019 [US2] Add clean-checkout setup, fixture, upload, pause/reload/resume, mismatch, cancellation, and verification instructions in examples/uppy-react/README.md

**Checkpoint**: The browser example runs without credentials and proves the actual stored original, not only UI state.

---

## Phase 5: User Story 3 - Turn Integration Friction Into An Adapter Decision (Priority: P2)

**Goal**: Capture reproducible integration friction and decide whether an official Uppy adapter warrants a separate specification.

**Independent Test**: Trace every material issue to an example/test step, classify it, apply the correctness and repeated-coordination gates, and end with exactly one adapter outcome.

- [x] T020 [P] [US3] Create the evidence-based friction log, severity taxonomy, and decision template in docs/integrations/uppy-friction.md
- [x] T021 [US3] Exercise the completed example and record every observed documentation, composition, public API, or upstream Uppy friction item in docs/integrations/uppy-friction.md
- [x] T022 [US3] Apply the adapter decision gate and record either explicit deferral or a link to a separately initialized formal Uppy adapter specification in docs/integrations/uppy-friction.md

**Checkpoint**: No public adapter is proposed without reproducible correctness or repeated library-owned coordination evidence.

---

## Phase 6: User Story 4 - Bound The Later tus-js-client Review (Priority: P3)

**Goal**: Produce a review-ready follow-up without adding tus-js-client or changing the existing tus transport.

**Independent Test**: Verify the brief assigns or flags one owner for chunk scheduling, retry, progress, pause, URL persistence, resume validation, receipts, completion, and parallelism, while package exports and dependencies remain unchanged.

- [x] T023 [P] [US4] Write the responsibility matrix, current transport comparison, compatibility questions, required experiments, migration risks, and go/no-go criteria in docs/integrations/tus-js-client-review.md
- [x] T024 [US4] Verify and record that package.json, package-lock.json, and src/tus.ts contain no tus-js-client dependency or behavior change in docs/integrations/tus-js-client-review.md

**Checkpoint**: tus-js-client remains a separately gated transport decision rather than an implicit part of Uppy integration.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Integrate the new path into product documentation and run every release-relevant validation gate.

- [x] T025 [P] Link the Uppy recipe and runnable example from README.md and align the integration roadmap in docs/roadmap.md
- [x] T026 [P] Update docs/integrations/uppy.md with the final tested commands, limitations, resume security notes, and production transport substitution guidance
- [x] T027 Run npm run typecheck, npm run typecheck:examples, npm run typecheck:uppy-example, npm test, npm run build, and npm run test:reference; fix scoped failures in changed files
- [x] T028 Run npm pack --dry-run and verify the tarball contains the guide and runnable example while production dependencies/exports remain unchanged
- [x] T029 Run the quickstart browser flow from specs/011-uppy-ui-integration/quickstart.md and record actual results in docs/integrations/uppy-friction.md
- [x] T030 Reconcile README.md, docs/, examples/, tests/, and specs/011-uppy-ui-integration/ against FR-001 through FR-021 and SC-001 through SC-009

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately.
- **Foundational (Phase 2)**: Depends on Setup and blocks runnable user-story validation.
- **User Story 1 (Phase 3)**: Depends on Setup; its bridge and ownership contract are prerequisites for the full React app.
- **User Story 2 (Phase 4)**: Depends on Foundational and User Story 1.
- **User Story 3 (Phase 5)**: The template can start after planning, but final evidence and decision depend on User Stories 1 and 2.
- **User Story 4 (Phase 6)**: Can be drafted after planning and finalized after User Story 2 confirms transport boundaries.
- **Polish (Phase 7)**: Depends on all desired stories.

### User Story Dependencies

- **US1**: Independent MVP for safe Uppy selection composition.
- **US2**: Builds on US1 selection and controller ownership, but uses only existing public package APIs.
- **US3**: Evaluates evidence from US1 and US2; it does not block their implementation.
- **US4**: Uses the proven ownership model but adds no runtime integration.

### Parallel Opportunities

- T003 can proceed alongside T001; T002 follows T001 because both update package.json.
- T006 can be written while fixture foundations are prepared.
- T010, T011, and T012 cover distinct contracts and can be drafted in parallel.
- T016 and T017 affect independent client files after the App contract is known.
- T020 and T023 are independent documentation artifacts.
- T025 and T026 touch separate documents.

---

## Parallel Example: User Story 2

```text
Task T010: HTTP target contract tests in tests/uppy-reference-integration.test.ts
Task T011: browser transport contract tests in tests/uppy-reference-integration.test.ts
Task T012: React/controller composition tests in tests/uppy-selection-bridge.test.ts

After T013-T015 establish behavior:
Task T016: React entrypoint and styles
Task T017: Vite HTML and proxy configuration
```

---

## Implementation Strategy

### MVP First

1. Complete Setup and deterministic fixture generation.
2. Complete US1 selection bridge, headless UI, tests, and ownership recipe.
3. Validate there is no uploader plugin or duplicate lifecycle.

### Incremental Delivery

1. Add the local target and transport, then prove the full React flow.
2. Capture real friction and make the Uppy adapter decision.
3. Finish the independent tus-js-client review.
4. Run all package, reference, tarball, and browser quickstart gates.

## Notes

- Tests precede their corresponding implementation tasks.
- Uppy and Vite are development-only; no task adds a production runtime dependency or export.
- A `specify-adapter` decision creates a new feature specification and stops before adapter implementation.
- Mark every completed task `[X]` as implementation proceeds.
