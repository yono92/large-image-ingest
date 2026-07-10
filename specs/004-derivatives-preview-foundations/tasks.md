# Tasks: 1.1.0 Derivatives And Preview Foundations

**Input**: Design documents from `/specs/004-derivatives-preview-foundations/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required by FR-014, SC-001, SC-002, SC-003, and SC-005.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Prepare release metadata and the feature documentation surface for 1.1.0.

- [X] T001 [P] Add a 1.1.0 derivatives and preview foundations entry to `CHANGELOG.md`
- [X] T002 [P] Update package version metadata for 1.1.0 in `package.json` and `package-lock.json`
- [X] T003 [P] Create the derivative usage guide shell in `docs/derivatives.md`

---

## Phase 2: Foundational

**Purpose**: Add shared public contracts and exports that all user stories depend on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Expand additive derivative public types in `src/types.ts`
- [X] T005 Add derivative validation issue/result option types to `src/types.ts`
- [X] T006 Add source identity, storage reference, provenance, failure, and tile descriptor types to `src/types.ts`
- [X] T007 Export new derivative public types from `src/core.ts`
- [X] T008 Export new derivative public types from `src/index.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Model Derivatives Separately (Priority: P1) MVP

**Goal**: Developers can attach preview, thumbnail, tile, metadata, and custom derivative references without changing original manifest identity or preservation fields.

**Independent Test**: Create a manifest, attach planned/created/failed derivative references, and verify original identity, checksum, size, media type, and preservation policy remain unchanged.

### Tests for User Story 1

- [X] T009 [P] [US1] Add derivative attachment immutability tests in `tests/derivatives.test.ts`
- [X] T010 [P] [US1] Add duplicate derivative ID and replacement behavior tests in `tests/derivatives.test.ts`
- [X] T011 [P] [US1] Add derivative validation tests for missing source, stale source, unsupported kind, invalid status, unsafe storage, embedded payload, and required derivative cases in `tests/derivatives.test.ts`

### Implementation for User Story 1

- [X] T012 [US1] Implement `createDerivativeReference()` and source identity capture in `src/derivatives.ts`
- [X] T013 [US1] Implement immutable `attachDerivative()` duplicate and replacement behavior in `src/derivatives.ts`
- [X] T014 [US1] Implement `validateDerivativeReference()` in `src/derivatives.ts`
- [X] T015 [US1] Implement `validateManifestDerivatives()` and required derivative checks in `src/derivatives.ts`
- [X] T016 [US1] Export derivative helper functions from `src/core.ts`
- [X] T017 [US1] Export derivative helper functions from `src/index.ts`

**Checkpoint**: User Story 1 is independently testable with `npm test -- derivatives`.

---

## Phase 4: User Story 2 - Reference Browser-Safe Previews (Priority: P2)

**Goal**: Browser applications can describe planned, created, and failed preview or thumbnail outputs without requiring full-file reads, full-image decode, original rewrites, or embedded derivative bytes.

**Independent Test**: Use synthetic large-file fixtures and caller-provided preview descriptors to create derivative references that contain metadata and references only.

### Tests for User Story 2

- [X] T018 [P] [US2] Add planned, created, and failed preview derivative tests in `tests/preview.test.ts`
- [X] T019 [P] [US2] Add synthetic large-file safety tests proving preview helpers do not read, decode, rewrite, or embed bytes in `tests/preview.test.ts`

### Implementation for User Story 2

- [X] T020 [US2] Implement `createPreviewDerivative()` for preview and thumbnail descriptors in `src/preview.ts`
- [X] T021 [US2] Add preview descriptor sensitive payload guards in `src/preview.ts`
- [X] T022 [US2] Export preview helper functions from `src/core.ts`
- [X] T023 [US2] Export preview helper functions from `src/index.ts`

**Checkpoint**: User Story 2 is independently testable with `npm test -- preview`.

---

## Phase 5: User Story 3 - Enrich Image Metadata Safely (Priority: P3)

**Goal**: Server-side or caller-owned pipelines can record dimensions, format, color depth, channels, and tile pyramid metadata as traceable derivative or enrichment records.

**Independent Test**: Attach metadata enrichment and tile pyramid records, then verify provenance, source identity, tile validation, and original manifest preservation.

### Tests for User Story 3

- [X] T024 [P] [US3] Add metadata enrichment derivative tests in `tests/node-metadata.test.ts`
- [X] T025 [P] [US3] Add tile pyramid descriptor validation tests in `tests/node-metadata.test.ts`
- [X] T026 [P] [US3] Add stale source identity tests for metadata enrichment in `tests/node-metadata.test.ts`

### Implementation for User Story 3

- [X] T027 [US3] Implement `createMetadataDerivative()` in `src/node-metadata.ts`
- [X] T028 [US3] Implement `createTilePyramidDerivative()` and tile level validation in `src/node-metadata.ts`
- [X] T029 [US3] Reuse derivative source identity and validation behavior from `src/derivatives.ts` in `src/node-metadata.ts`
- [X] T030 [US3] Export metadata and tile helper functions from `src/node.ts`

**Checkpoint**: User Story 3 is independently testable with `npm test -- metadata` or `npm test -- node-metadata`.

---

## Phase 6: User Story 4 - Preserve Adapter Boundaries (Priority: P4)

**Goal**: Maintainers can verify that 1.1.0 keeps image processing, storage upload, UI bindings, and provider behavior outside the core ingest contract.

**Independent Test**: Review contracts, docs, package exports, and dependency metadata to confirm core owns references, validation, manifest attachment, and state representation only.

### Tests for User Story 4

- [X] T031 [P] [US4] Add package export boundary assertions for derivative, preview, and Node metadata helpers in `tests/package-exports.test.ts`
- [X] T032 [P] [US4] Add dependency boundary assertions that no runtime decoder, cloud SDK, or UI framework is introduced in `tests/package-exports.test.ts`

### Implementation for User Story 4

- [X] T033 [US4] Document derivative, preview, metadata, tile, storage, and UI adapter boundaries in `docs/derivatives.md`
- [X] T034 [US4] Add original-plus-derivatives manifest example and planned/created/failed status guidance to `README.md`
- [X] T035 [US4] Link `docs/derivatives.md` from `README.md`
- [X] T036 [US4] Update `docs/roadmap.md` to mark completed 1.1.0 implementation TODOs and keep 1.3.0 deferred items separate

**Checkpoint**: User Story 4 is independently reviewable through docs and package boundary tests.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Release validation, docs alignment, and Spec Kit cleanup.

- [X] T037 [P] Update `specs/004-derivatives-preview-foundations/contracts/derivatives-preview-contracts.md` if final exported names differ from the draft contract
- [X] T038 [P] Update `specs/004-derivatives-preview-foundations/quickstart.md` if final focused test commands differ
- [X] T039 Run `npm run typecheck`
- [X] T040 Run `npm run typecheck:examples`
- [X] T041 Run `npm test`
- [X] T042 Run `npm run test:integration`
- [X] T043 Run `npm run build`
- [X] T044 Run `npm pack --dry-run`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion - blocks user stories.
- **User Stories (Phase 3+)**: Depend on Foundational phase completion.
- **Polish (Phase 7)**: Depends on selected user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - MVP scope.
- **User Story 2 (P2)**: Can start after Foundational; uses derivative helpers from US1 if implemented sequentially, but preview descriptor tests remain independently scoped.
- **User Story 3 (P3)**: Can start after Foundational; reuses derivative identity and validation behavior when available.
- **User Story 4 (P4)**: Can start after Foundational; docs and package boundary tests can proceed independently from US2/US3 implementation details.

### Within Each User Story

- Tests must be written before implementation for US1, US2, US3, and US4.
- Public types before helper implementation.
- Generic derivative helpers before preview and metadata convenience helpers when implementing sequentially.
- Documentation examples after final exported helper names are known.

### Parallel Opportunities

- T001, T002, and T003 can run in parallel.
- T009, T010, and T011 can run in parallel before US1 implementation.
- T018 and T019 can run in parallel before US2 implementation.
- T024, T025, and T026 can run in parallel before US3 implementation.
- T031 and T032 can run in parallel with documentation tasks T033 through T036.
- T037 and T038 can run in parallel before final verification.

---

## Parallel Example: User Story 1

```text
Task: "T009 [P] [US1] Add derivative attachment immutability tests in tests/derivatives.test.ts"
Task: "T010 [P] [US1] Add duplicate derivative ID and replacement behavior tests in tests/derivatives.test.ts"
Task: "T011 [P] [US1] Add derivative validation tests for missing source, stale source, unsupported kind, invalid status, unsafe storage, embedded payload, and required derivative cases in tests/derivatives.test.ts"
```

---

## Parallel Example: User Story 2

```text
Task: "T018 [P] [US2] Add planned, created, and failed preview derivative tests in tests/preview.test.ts"
Task: "T019 [P] [US2] Add synthetic large-file safety tests proving preview helpers do not read, decode, rewrite, or embed bytes in tests/preview.test.ts"
```

---

## Parallel Example: User Story 3

```text
Task: "T024 [P] [US3] Add metadata enrichment derivative tests in tests/node-metadata.test.ts"
Task: "T025 [P] [US3] Add tile pyramid descriptor validation tests in tests/node-metadata.test.ts"
Task: "T026 [P] [US3] Add stale source identity tests for metadata enrichment in tests/node-metadata.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. Validate with `npm test -- derivatives` and `npm run typecheck`.

### Incremental Delivery

1. Add derivative reference contracts and generic helpers.
2. Add browser-safe preview and thumbnail descriptor helpers.
3. Add metadata enrichment and tile pyramid descriptor helpers.
4. Add adapter-boundary documentation and package boundary tests.
5. Run full verification.

### Notes

- Keep all changes additive for 1.1.x compatibility.
- Do not mutate original image bytes, strip EXIF, recompress, or rewrite source artifacts.
- Do not embed original bytes, derivative bytes, tile bytes, credentials, presigned URLs, or full customer metadata in manifests.
- Do not add runtime image decoder, cloud SDK, or UI framework dependencies to core.
- Mark each task `[X]` after completion.
