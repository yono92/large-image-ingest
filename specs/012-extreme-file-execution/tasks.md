# Tasks: Extreme-File Execution

## Phase 1: Setup And Contracts

- [x] T001 Bump release metadata and producer version to 1.5.0 in package.json, package-lock.json, src/version.ts, and version gates
- [x] T002 Define checksum executor, worker protocol, execution options, and typed issue contracts in src/types.ts
- [x] T003 Export worker and execution contracts through src/core.ts and root entrypoints

## Phase 2: Worker Checksum

- [x] T004 [P] Add failing parity, progress, abort, malformed response, late message, factory failure, and preservation tests in tests/checksum-worker.test.ts
- [x] T005 [P] Add failing default-path AbortSignal tests in tests/checksum.test.ts
- [x] T006 Implement AbortSignal-aware bounded checksum calculation in src/checksum.ts
- [x] T007 Implement the validated one-worker-per-calculation executor in src/checksum-worker.ts
- [x] T008 Implement and export the versioned worker runtime installer in src/checksum-worker-runtime.ts
- [x] T009 Add and typecheck the bundler-owned worker construction example in examples/worker-checksum.ts and tsconfig.examples.json

## Phase 3: Bounded Parallel Upload

- [x] T010 [P] Add failing default/explicit concurrency, hard-limit, unsupported capability, ordering, and deterministic evidence tests in tests/session-parallel.test.ts
- [x] T011 [P] Add failing mixed outcome, successful-sibling checkpoint, exact-source resume, pause, cancel, and original-preservation tests in tests/session-parallel.test.ts
- [x] T012 Validate execution policy before remote creation in src/session.ts
- [x] T013 Replace sequential remaining-chunk iteration with bounded batch settlement in src/session.ts
- [x] T014 Serialize successful result validation, snapshot updates, events, and resume checkpoints by chunk index in src/session.ts
- [x] T015 Preserve per-chunk retry and lifecycle semantics across parallel batches in src/session.ts

## Phase 4: Compatibility And Documentation

- [x] T016 Add execution and worker safe-diagnostic regression coverage in tests/diagnostics.test.ts
- [x] T017 Update README.md, docs/quickstart.md, docs/server-operational-guide.md, CHANGELOG.md, and docs/roadmap.md for 1.5.0
- [x] T018 Add focused migration and worker bundler guidance in docs/migration-1.5.md
- [x] T019 Run focused worker and parallel suites and reconcile public contract names
- [x] T020 Run typecheck, example typecheck, all tests, build, reference, package dry-run, and dependency audit gates
- [x] T021 Mark the feature implemented only after all acceptance scenarios and gates have evidence

## Verification Evidence

- TypeScript and examples: `npm run typecheck` and `npm run typecheck:examples` passed.
- Tests: 29 files and 181 tests passed in the full suite; the added empty-source Worker parity case also passed in its focused suite.
- Package: dual ESM/CJS build and packaged-consumer smoke checks passed; `npm pack --dry-run` produced 138 files at 113.3 kB packed.
- Reference: the 64 MiB local transfer/resume benchmark completed with zero duplicate acknowledged bytes and verified stored integrity.
- Dependencies: `npm audit --offline --audit-level=moderate` reported zero vulnerabilities. The registry-backed online audit remains an external prepublish action because registry dependency-tree disclosure was not authorized in this environment.
