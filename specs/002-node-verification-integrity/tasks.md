# Tasks: Node Verification & Integrity

## Phase 1: Spec And Contracts

- [x] T001 Add Phase 6 spec, plan, data model, contracts, quickstart, and requirements checklist in specs/002-node-verification-integrity.
- [x] T002 Update `.specify/feature.json` to point at specs/002-node-verification-integrity.

## Phase 2: Core Verification

- [x] T003 Add verification issue code and option types in src/types.ts.
- [x] T004 Implement manifest, receipt, and combined integrity verification in src/verification.ts.
- [x] T005 Export verification APIs and types from src/core.ts.
- [x] T006 Add core verification unit tests in tests/verification.test.ts.

## Phase 3: Node Verification

- [x] T007 Implement streaming Node file checksum and stored-file manifest verification in src/node-verification.ts.
- [x] T008 Add a Node API barrel in src/node.ts that re-exports NAS and Node verification APIs.
- [x] T009 Update package `./node` exports and package export smoke checks to point at src/node.ts output.
- [x] T010 Add Node verification unit tests in tests/node-verification.test.ts.

## Phase 4: Documentation And Validation

- [x] T011 Update README with Phase 6 verification usage and milestone status.
- [x] T012 Run typecheck, example typecheck, tests, and build.
