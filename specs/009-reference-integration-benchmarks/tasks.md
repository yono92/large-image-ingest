# Tasks: Reference Integration And Benchmarks

**Input**: Design documents from `/specs/009-reference-integration-benchmarks/`
**Tests**: A credential-free end-to-end reference run is required because mocked transports cannot prove HTTP, durable resume, filesystem writes, and stored-file verification together.

## Phase 1: Setup

- [x] T001 Create the repository-only benchmark and result directories in benchmarks/
- [x] T002 Register bounded reference and configurable benchmark commands in package.json
- [x] T003 Update `.specify/feature.json` to track specs/009-reference-integration-benchmarks

## Phase 2: Foundational Reference Target

- [x] T004 Implement an isolated local HTTP chunk target with staging, completion, duplicate-byte tracking, and safe cleanup in benchmarks/reference-server.cjs
- [x] T005 Implement a JSON file-backed resume store for replacement-session recovery in benchmarks/run-local.cjs
- [x] T006 Implement deterministic streamed fixture generation and file-backed Blob opening in benchmarks/run-local.cjs

## Phase 3: User Story 1 - Recoverable End-To-End Ingest (Priority: P1)

**Independent Test**: A generated fixture crosses HTTP, fails after acknowledged progress, resumes in a replacement session, completes, and verifies with zero duplicate bytes.

- [x] T007 [US1] Implement the reference upload transport and one-shot interruption in benchmarks/run-local.cjs
- [x] T008 [US1] Implement first-session failure, durable-record discovery, replacement-session resume, and final Node verification in benchmarks/run-local.cjs
- [x] T009 [US1] Add integrity and recovery assertions that fail the command on retransmission, checksum mismatch, incomplete storage, or missing interruption in benchmarks/run-local.cjs

## Phase 4: User Story 2 - Reproducible Measurements (Priority: P1)

**Independent Test**: Caller-selected sizes produce schema-v1 JSON with safe environment, timing, throughput, memory, recovery, and integrity fields.

- [x] T010 [US2] Add CLI validation, memory sampling, timing, throughput, safe environment capture, and JSON output in benchmarks/run-local.cjs
- [x] T011 [US2] Document runner usage, measurement meaning, cleanup, and limitations in benchmarks/README.md
- [x] T012 [US2] Execute the 64 MiB release gate and at least 1 GiB measured run, retaining actual evidence in benchmarks/results/

## Phase 5: User Story 3 - npm Evaluation Evidence (Priority: P2)

**Independent Test**: Packaged README and docs consistently describe optional React/TIFF boundaries and link to measured reproducible evidence.

- [x] T013 [US3] Fix the stale React exclusion and clarify headless/TIFF boundaries in README.md
- [x] T014 [US3] Add measured results, methodology, limitations, and reproduction commands in docs/benchmarks.md and README.md
- [x] T015 [US3] Update CHANGELOG.md, docs/roadmap.md, and docs/integration-tests.md for the completed validation scope

## Phase 6: Release Gates And Verification

- [x] T016 Add the bounded reference run to `.github/workflows/ci.yml` after package build
- [x] T017 Add the bounded reference run to `prepublishOnly` and verify large fixtures and harness code remain outside npm package contents
- [x] T018 Run typecheck, tests, build, reference verification, npm pack dry-run, audit, and documentation drift checks
- [x] T019 Mark the specification implemented and every task complete only after measured evidence and final verification pass
- [x] T020 Commit and push the completed validation work to the existing PR branch

## Dependencies And Execution Order

- Spec and command setup precede implementation.
- The local target, durable store, and fixture generation precede the recovery scenario.
- Measurement wraps the proven recovery scenario.
- Documentation uses actual results and follows benchmark execution.
- CI and publish gates follow a successful bounded local run.

## Parallel Opportunities

- T004 and T006 affect separate files and can be developed independently.
- T011 and T013 can proceed after public command names are stable.
- Final docs and workflow changes can proceed together after actual measurements exist.

## Implementation Strategy

1. Prove the complete local integrity and resume story at a small size.
2. Add measurement without weakening correctness assertions.
3. Run at least 1 GiB and publish only observed evidence.
4. Keep executable harnesses and generated fixtures out of the npm tarball while packaging the evidence.
