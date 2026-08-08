# Tasks: Evidence-Grade Ingest Integrity

**Input**: Design documents from `/specs/011-evidence-grade-ingest-integrity/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: The specification requires focused adversarial resume, completion evidence, schema, provider, compatibility, diagnostics, and original-preservation tests. Tests are written before their corresponding implementation.

**Organization**: Tasks are grouped by user story so each integrity outcome remains independently testable.

## Phase 1: Setup

**Purpose**: Establish release metadata and schema-test tooling without changing runtime behavior.

- [x] T001 Update minor-release metadata to 1.4.0 and add the development-only JSON Schema validator in package.json and package-lock.json
- [x] T002 [P] Add a package-version synchronization assertion script in scripts/verify-version-sync.cjs and wire it into package.json verification commands
- [x] T003 [P] Add shared evidence, schema, and adversarial same-metadata file fixtures in tests/evidence-fixtures.ts

---

## Phase 2: Foundational Public Contracts

**Purpose**: Define the shared types and version source required by every user story.

**CRITICAL**: No user story implementation begins until these contracts typecheck.

- [x] T004 Add the browser-safe `LARGE_IMAGE_INGEST_VERSION` producer constant in src/version.ts and use it in src/manifest.ts
- [x] T005 Define artifact producer, resume v0.3 content identity, completion result, completion evidence, validation, and typed error contracts in src/types.ts
- [x] T006 Export the new shared contracts and version constant through src/core.ts and src/index.ts
- [x] T007 Update shared resume and session fixture builders for v0.3 while retaining explicit v0.1/v0.2 fixtures in tests/resume-fixtures.ts

**Checkpoint**: Public contracts compile and legacy fixtures remain representable.

---

## Phase 3: User Story 1 - Resume Only The Exact Original (Priority: P1) MVP

**Goal**: Reject metadata-colliding or identity-less sources before any persistent resume transport access while preserving safe legacy recovery.

**Independent Test**: Interrupt an upload, attempt resume with matching and different-content sources sharing identical metadata, and verify only the exact source reaches the transport or skips acknowledged chunks.

### Tests for User Story 1

- [x] T008 [P] [US1] Add failing v0.3 creation, parsing, content identity, manifest consistency, malformed digest, and legacy compatibility tests in tests/resume.test.ts
- [x] T009 [P] [US1] Add failing same-metadata different-content, missing-identity, transport-call ordering, exact-match resume, and original-preservation tests in tests/session-resume.test.ts
- [x] T010 [P] [US1] Add failing WebStorage round-trip and unsafe legacy record tests for v0.3 in tests/web-storage-resume-store.test.ts

### Implementation for User Story 1

- [x] T011 [US1] Implement resume v0.3 creation, validation, parsing, and content identity comparison in src/resume.ts
- [x] T012 [US1] Require an original checksum when persistent resume is enabled and write v0.3 records in src/session.ts
- [x] T013 [US1] Recalculate and validate selected-source content before transport resume lookup or mutation in src/session.ts
- [x] T014 [US1] Validate v0.3 storage reads and preserve safe v0.1/v0.2 inspection behavior in src/web-storage-resume-store.ts
- [x] T015 [US1] Export and document typed `resume.content_identity_missing` and `resume.content_mismatch` recovery behavior in src/types.ts and docs/quickstart.md

**Checkpoint**: Persistent resume is content-bound and acknowledged bytes are reused only for the exact original.

---

## Phase 4: User Story 2 - Receive Truthful Completion Evidence (Priority: P1)

**Goal**: Produce one immutable verified or completed-unverified record after every successful completion without changing existing manifest-returning methods.

**Independent Test**: Complete fake uploads with matching, absent, and conflicting stored-object facts and inspect the session getter, completed event, and React state.

### Tests for User Story 2

- [x] T016 [P] [US2] Add failing deterministic receipt digest, verified/unverified classification, size/checksum conflict, parser, clone, and original-preservation tests in tests/completion-evidence.test.ts
- [x] T017 [P] [US2] Add failing custom-transport compatibility, exactly-one evidence, event/getter, failed-completion, observer-failure, and resume-cleanup-failure tests in tests/session.test.ts
- [x] T018 [P] [US2] Add failing completion evidence state propagation and detached-state tests in tests/react-controller.test.ts and tests/react.test.ts

### Implementation for User Story 2

- [x] T019 [US2] Implement canonical receipt digest, completion classification, immutable cloning, validation, and parsing in src/completion-evidence.ts
- [x] T020 [US2] Integrate optional transport completion results, exactly-one evidence construction, completed events, and `getCompletionEvidence()` in src/session.ts
- [x] T021 [US2] Expose detached completion evidence through the headless controller and React state in src/react-controller.ts and src/react.ts
- [x] T022 [US2] Export completion evidence functions and types from src/core.ts and ensure root compatibility through src/index.ts

**Checkpoint**: Every successful session reports truthful completion evidence and every failed completion reports none.

---

## Phase 5: User Story 3 - Preserve Provider Integrity Evidence (Priority: P2)

**Goal**: Let official and custom adapters return normalized stored-object evidence without moving provider logic into core.

**Independent Test**: Return matching, missing, different-algorithm, and conflicting completion facts through S3 and tus adapter fakes and verify classification and compatibility.

### Tests for User Story 3

- [x] T023 [P] [US3] Add failing S3 broker completion-result pass-through, multipart ETag non-verification, matching checksum, and conflict tests in tests/s3.test.ts
- [x] T024 [P] [US3] Add failing optional tus final-verification callback, no-callback compatibility, and sensitive-result containment tests in tests/tus.test.ts
- [x] T025 [P] [US3] Add failing Node/NAS stored-file verification completion-result example type coverage in tests/node-verification.test.ts and tsconfig.examples.json

### Implementation for User Story 3

- [x] T026 [US3] Allow S3 multipart brokers to return normalized completion results and pass them through in src/s3.ts
- [x] T027 [US3] Add an optional application-owned final verification callback after tus offset completion in src/tus.ts
- [x] T028 [US3] Add a stored-file verification to completion-result helper in src/node-verification.ts and export it through src/node.ts
- [x] T029 [US3] Update the S3, tus, and NAS/custom examples to demonstrate verified and unverified completion boundaries in examples/s3-multipart.ts, examples/tus-transport.ts, and examples/nas-gateway-route.ts

**Checkpoint**: Provider evidence is normalized by adapters, classified by core, and never mistaken for proof when it is not equivalent.

---

## Phase 6: User Story 4 - Consume Stable Versioned Artifacts (Priority: P2)

**Goal**: Ship current JSON Schemas, exact producer attribution, compatibility fixtures, and package exports for long-lived consumers.

**Independent Test**: Validate current and malformed artifacts against packaged schemas, check supported legacy behavior, and consume schema files and APIs from packed ESM and CommonJS installs.

### Tests for User Story 4

- [x] T030 [P] [US4] Add failing JSON Schema 2020-12 fixture validation for manifest v1, resume v0.3, and completion v1 in tests/schema-contracts.test.ts
- [x] T031 [P] [US4] Add failing exact producer-version and manifest compatibility assertions in tests/manifest.test.ts and tests/package-exports.test.ts
- [x] T032 [P] [US4] Add failing unsupported schema, additive-field, and v0.1/v0.2 migration outcome coverage in tests/resume.test.ts and tests/completion-evidence.test.ts

### Implementation for User Story 4

- [x] T033 [P] [US4] Add the published manifest v1 JSON Schema in schemas/manifest.v1.schema.json
- [x] T034 [P] [US4] Add the published resume v0.3 JSON Schema in schemas/resume.v0.3.schema.json
- [x] T035 [P] [US4] Add the published completion v1 JSON Schema in schemas/completion.v1.schema.json
- [x] T036 [US4] Add schema subpath exports, packaged files, and ESM/CommonJS consumption assertions in package.json and scripts/verify-package-consumption.cjs
- [x] T037 [US4] Apply the centralized producer identity to manifest, resume v0.3, and completion evidence creation in src/manifest.ts, src/resume.ts, and src/completion-evidence.ts

**Checkpoint**: Current artifacts validate against shipped schemas and identify the exact package producer.

---

## Phase 7: User Story 5 - Operate Without Leaking Evidence Data (Priority: P3)

**Goal**: Provide useful completion telemetry without leaking source, checksum, upload, storage, or provider values.

**Independent Test**: Summarize sensitive verified, unverified, and conflict fixtures and verify only the documented safe fields remain.

### Tests for User Story 5

- [x] T038 [P] [US5] Add failing safe completion summary, checksum conflict, nested-sensitive-value, and regression tests in tests/diagnostics.test.ts

### Implementation for User Story 5

- [x] T039 [US5] Implement and export `createSafeCompletionSummary()` with explicit allowlisted fields in src/diagnostics.ts and src/core.ts
- [x] T040 [US5] Document completion evidence sensitivity, safe summaries, storage responsibilities, and support handling in docs/server-operational-guide.md and SECURITY.md

**Checkpoint**: Completion outcomes are operationally useful and safe by default.

---

## Phase 8: Documentation, Compatibility, And Release Gates

**Purpose**: Finish the minor release with exact migration guidance and reproducible verification.

- [x] T041 [P] Add strict resume, verified completion, unverified completion, and migration examples in README.md and docs/quickstart.md
- [x] T042 [P] Add the 1.4.0 evidence-grade integrity release entry and update completed/future scope in CHANGELOG.md and docs/roadmap.md
- [x] T043 [P] Add a focused 1.4.0 migration guide for resume v0.3, completion v1, producer version, and unsafe legacy rejection in docs/migration-1.4.md
- [x] T044 Verify and correct stale implemented statuses in specs/002-node-verification-integrity/spec.md, specs/002-tus-transport-adapter/spec.md, specs/003-operational-safety/spec.md, and specs/004-derivatives-preview-foundations/spec.md
- [x] T045 Run all focused commands from specs/011-evidence-grade-ingest-integrity/quickstart.md and reconcile contract names in specs/011-evidence-grade-ingest-integrity/contracts/evidence-integrity-contracts.md
- [x] T046 Run npm run typecheck and npm run typecheck:examples
- [x] T047 Run npm test and confirm all legacy, new evidence, schema, and redaction suites pass
- [ ] T048 Run npm run build, npm run test:reference, npm pack --dry-run, and npm audit --audit-level=moderate
- [ ] T049 Mark specs/011-evidence-grade-ingest-integrity/spec.md implemented and all tasks complete only after every acceptance scenario and release gate has evidence

---

## Dependencies And Execution Order

### Phase Dependencies

- **Setup**: Starts immediately.
- **Foundational**: Depends on setup and blocks all story work.
- **User Story 1**: First implementation slice because it closes the unsafe resume gap.
- **User Story 2**: Depends on foundational contracts but is independently testable with custom transports.
- **User Story 3**: Depends on the completion result and evidence contracts from User Story 2.
- **User Story 4**: Depends on final artifact shapes from User Stories 1 and 2.
- **User Story 5**: Depends on completion evidence shape and is otherwise isolated.
- **Release**: Depends on all desired stories and their focused tests.

### User Story Dependencies

- **US1 (P1)**: No story dependency after foundational contracts.
- **US2 (P1)**: No dependency on US1 behavior, but shares producer and checksum types.
- **US3 (P2)**: Depends on US2 transport completion-result contract.
- **US4 (P2)**: Depends on stable US1 resume v0.3 and US2 completion v1 shapes.
- **US5 (P3)**: Depends on US2 evidence shape; does not affect upload control flow.

### Within Each User Story

- Add the failing tests before implementation.
- Define and validate data shapes before session or adapter integration.
- Keep core classification provider-neutral.
- Run focused tests at each checkpoint before moving to the next story.

### Parallel Opportunities

- T002 and T003 affect separate setup files.
- T008-T010 cover separate US1 test files.
- T016-T018 cover evidence, session, and React behavior in separate files.
- T023-T025 cover separate adapter and Node test files.
- T030-T032 cover distinct schema, producer, and migration concerns.
- T033-T035 create independent schema documents after artifact shapes stabilize.
- T041-T043 update separate release documents.

## Parallel Example: User Story 2

```text
Task: "Add completion evidence classification tests in tests/completion-evidence.test.ts"
Task: "Add session completion integration tests in tests/session.test.ts"
Task: "Add React evidence state tests in tests/react-controller.test.ts and tests/react.test.ts"
```

## Implementation Strategy

### MVP First

1. Complete setup and foundational contracts.
2. Implement US1 content-bound resume.
3. Run the adversarial same-metadata and matching-source tests.
4. Confirm no transport call occurs for mismatched content and no acknowledged chunk is retransmitted for matching content.

### Incremental Delivery

1. Close the unsafe resume gap.
2. Add truthful completion evidence without breaking existing custom transports.
3. Connect official adapters to normalized stored-object evidence.
4. Publish and validate schemas and exact producer versions.
5. Add safe operational summaries and release documentation.
6. Run focused, full, reference, package, and audit gates before marking implemented.

## Notes

- No real cloud account, network service, NAS mount, or credential is required by default.
- `verified` is reserved for equivalent stored-object size and checksum proof.
- TUS PATCH checksums and multipart ETags remain transfer receipts, not whole-file verification by themselves.
- Applications own completion evidence persistence, retention, signing, and audit policy.
- Every completed task must be marked `[x]` only after its stated file change or verification succeeds.
