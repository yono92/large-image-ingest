# Tasks: Production Orchestration

## Phase 1: Release And Contracts

- [x] T001 Bump release metadata and producer version to 1.6.0
- [x] T002 Define queue records, snapshots, events, store, factory, lifecycle, and issue contracts in src/types.ts
- [x] T003 Export queue contracts from root/core and publish queue v0.1 JSON Schema

## Phase 2: Contract Tests And Persistence

- [x] T004 [P] Add failing queue record validation/schema/clone tests
- [x] T005 [P] Add failing WebStorageQueueStore isolation and malformed-storage tests
- [x] T006 Implement strict queue v0.1 parser/validator and clone helpers
- [x] T007 Implement WebStorageQueueStore with configurable namespace and clone boundaries

## Phase 3: Scheduler And Lifecycle

- [x] T008 [P] Add failing defaults, limits, FIFO, byte budget, oversized item, and capacity tests
- [x] T009 [P] Add failing pause, resume, retry, cancel, removal, and race tests
- [x] T010 Implement queue construction, enqueue, immutable snapshots, and validated policy
- [x] T011 Implement deterministic bounded admission and drain coordination
- [x] T012 Implement queue/item pause, resume, retry, cancel, attach, and remove transitions
- [x] T013 Forward session events/snapshots and persist resume record references

## Phase 4: Durable Recovery And Failure Semantics

- [x] T014 [P] Add failing restore normalization, unresolved/mismatched source, and zero-session-call tests
- [x] T015 [P] Add failing store failure and remote-completion preservation tests
- [x] T016 Implement untrusted restore, source resolver, source attachment, and metadata precheck
- [x] T017 Implement safe store failure boundaries before admission and after completion

## Phase 5: Telemetry And Documentation

- [x] T018 [P] Add observer isolation, mutation isolation, aggregate telemetry, and redaction tests
- [x] T019 Implement queue observer isolation and allowlisted safe diagnostics
- [x] T020 Add queue and recovery examples and typecheck them
- [x] T021 Update README, quickstart, operational guide, roadmap, changelog, and migration guide for 1.6.0

## Phase 6: Verification And Convergence

- [x] T022 Run focused queue, store, schema, and diagnostics suites and reconcile public contracts
- [x] T023 Run typecheck, examples, all tests, build, reference, package dry-run, and dependency audit gates
- [x] T024 Converge implementation against spec/plan/tasks and mark implemented only with evidence

## Verification Evidence

- TypeScript and examples: `npm run typecheck` and `npm run typecheck:examples` passed.
- Tests: 33 files and 198 tests passed, including queue bounds, lifecycle, durable recovery, source attachment, active cancellation, schema, storage, observer, and redaction coverage.
- Package: ESM/CJS build and packaged-consumer smoke checks passed; `npm pack --dry-run` produced 153 files at 126.5 kB packed, including queue modules, docs, example, and queue v0.1 schema.
- Reference: the 64 MiB transfer/resume benchmark completed with zero duplicate acknowledged bytes and verified stored integrity.
- Dependencies: `npm audit --offline --audit-level=moderate` reported zero vulnerabilities. Registry-backed online audit remains an external prepublish action because registry dependency-tree disclosure was not authorized in this environment.
