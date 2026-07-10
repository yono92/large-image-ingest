# Tasks: Resume Integrity Hardening

**Input**: Design documents from `/specs/005-resume-integrity-hardening/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Focused tests are required because this feature changes persisted schemas, chunk-skipping decisions, provider completion evidence, and security-sensitive parsing.

## Phase 1: Setup

**Purpose**: Establish 1.2.0 release metadata and feature tracking.

- [X] T001 Update package version metadata to 1.2.0 in package.json and package-lock.json
- [X] T002 Add the resume integrity feature entry and release scope to CHANGELOG.md and docs/roadmap.md

---

## Phase 2: Foundational Contracts

**Purpose**: Add the versioned and typed contracts required by all user stories.

**Critical**: Complete before story implementation.

- [X] T003 Add v0.1/v0.2 resume record variants, durable receipts, granular resume capabilities, and new conflict codes in src/types.ts
- [X] T004 Update core exports for new resume record validation types and helpers in src/core.ts
- [X] T005 Update resume fixtures to create v0.2 records while retaining explicit v0.1 legacy fixtures in tests/resume-fixtures.ts

**Checkpoint**: Public contracts compile and fixtures can represent current and legacy records.

---

## Phase 3: User Story 2 - Reject Corrupt Or Untrusted Resume State (Priority: P1)

**Goal**: Validate persisted values before they affect range iteration or transport calls.

**Independent Test**: Malformed JSON and invalid record fixtures produce typed conflicts before `resumeSession`, `uploadChunk`, or `completeSession` is called.

### Tests

- [X] T006 [P] [US2] Add structural parser and invariant validation cases for both record versions in tests/resume.test.ts
- [X] T007 [P] [US2] Add malformed JSON, invalid stored value, and mixed-key listing cases in tests/web-storage-resume-store.test.ts
- [X] T008 [P] [US2] Add custom-store invalid range, receipt, total, and transport preflight cases in tests/session-resume.test.ts

### Implementation

- [X] T009 [US2] Implement bounded parseResumeRecord and validateResumeRecord helpers with detached normalized output in src/resume.ts
- [X] T010 [US2] Route WebStorageResumeStore get/list values through the shared parser and typed failures in src/web-storage-resume-store.ts
- [X] T011 [US2] Validate custom ResumeStore results and active-plan receipt invariants before transport resume in src/session.ts

**Checkpoint**: Untrusted persisted state is rejected deterministically and no invalid range can drive unbounded iteration.

---

## Phase 4: User Story 1 - Resume Multipart Upload After Restart (Priority: P1)

**Goal**: Persist authoritative receipts and complete S3 multipart uploads from a new process without a snapshot.

**Independent Test**: Interrupt after one S3 part, discard in-memory state, resume by record ID, skip the first part, and complete with all original and new ETags in order.

### Tests

- [X] T012 [P] [US1] Add v0.2 receipt checkpoint, restore, deduplication, and legacy range recovery cases in tests/session-resume.test.ts
- [X] T013 [P] [US1] Add persistent S3 restart recovery, progressed v0.1 rejection, and zero-progress legacy cases in tests/s3.test.ts
- [X] T014 [P] [US1] Extend tus persistent resume coverage to prove v0.1 compatibility and v0.2 receipt restoration in tests/tus.test.ts

### Implementation

- [X] T015 [US1] Create v0.2 records and checkpoint validated sorted receipts together with derived progress in src/resume.ts and src/session.ts
- [X] T016 [US1] Hydrate v0.2 sessions from persisted receipts and retain bounded legacy range hydration only for accepted v0.1 records in src/session.ts
- [X] T017 [US1] Implement record-based S3 multipart session restoration and required legacy receipt rejection in src/s3.ts
- [X] T018 [US1] Advertise explicit snapshot and persistent resume capabilities for official transports in src/s3.ts and src/tus.ts

**Checkpoint**: S3 and tus persistent recovery pass after all in-memory snapshot state is discarded.

---

## Phase 5: User Story 3 - Preserve Sensitive Resume Material (Priority: P2)

**Goal**: Keep newly persisted receipt evidence out of default diagnostics and events.

**Independent Test**: Safe outputs contain stable IDs, progress, and typed codes but no ETags, locations, opaque values, tokens, full manifests, or customer metadata.

### Tests

- [X] T019 [P] [US3] Add v0.2 receipt redaction and invalid-record error sanitization cases in tests/diagnostics.test.ts
- [X] T020 [US3] Update redacted resume record and safe event handling for v0.2 receipts in src/diagnostics.ts

**Checkpoint**: Receipt persistence adds no sensitive values to default observability surfaces.

---

## Phase 6: Documentation And Release Verification

**Purpose**: Align public guidance and prove package compatibility.

- [X] T021 [P] Document v0.2 migration, persistent S3 recovery, legacy rejection, and storage sensitivity in README.md and docs/quickstart.md
- [X] T022 [P] Update package contract and version assertions for 1.2.0 in tests/package-exports.test.ts
- [X] T023 Run npm run typecheck, npm run typecheck:examples, npm test, npm run build, and npm pack --dry-run
- [X] T024 Reconcile implementation against specs/005-resume-integrity-hardening/spec.md, plan.md, and tasks.md and record any remaining work
- [X] T025 Audit public API and high-risk boundary coverage and add focused tests in tests/chunks.test.ts, tests/checksum.test.ts, tests/validation.test.ts, tests/manifest.test.ts, tests/verification.test.ts, tests/fingerprint.test.ts, and tests/errors.test.ts
- [X] T026 Add granular resume capability and zero-progress legacy recovery coverage in tests/session-resume.test.ts, tests/s3.test.ts, and tests/tus.test.ts
- [X] T027 Add NAS collision/target protection and Node verification policy boundary coverage in tests/nas.test.ts and tests/node-verification.test.ts

---

## Dependencies And Execution Order

- Phase 1 has no dependencies.
- Phase 2 depends on Phase 1 and blocks all story work.
- User Story 2 depends on Phase 2 and provides the safe parser boundary required by User Story 1.
- User Story 1 depends on User Story 2 for untrusted record validation.
- User Story 3 depends on the v0.2 receipt shape from User Story 1 but can begin once T015 is stable.
- Documentation and release verification depend on all stories.

## Parallel Opportunities

- T006, T007, and T008 can run in parallel because they touch separate test files.
- T012, T013, and T014 can run in parallel after foundational contracts are stable.
- T019 can be prepared while S3 implementation work continues after the receipt shape is fixed.
- T021 and T022 can run in parallel after public behavior is final.

## Implementation Strategy

1. Introduce the additive v0.2 type union and explicit legacy fixtures.
2. Make malformed persisted state fail closed before changing upload behavior.
3. Persist real receipts and restore them generically in core.
4. Enable S3 record-based recovery without changing tus offset semantics.
5. Recheck redaction and publish 1.2.0-aligned documentation only after behavior is verified.

## Format Validation

All implementation tasks use the required checkbox, sequential task ID, optional parallel marker, story label for story phases, and explicit file paths.
