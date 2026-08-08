# Tasks: Inspection Ecosystem

## Phase 1: Release And Contracts

- [x] T001 Bump producer/package metadata to 1.7.0
- [x] T002 Define profile, policy, bundle, signature, verification, issue, and diagnostic types
- [x] T003 Export additive APIs and publish four new JSON Schema subpaths

## Phase 2: Metadata Profiles

- [x] T004 [P] Add profile definition, malicious pattern, built-in, deterministic issue, mutation, and value-redaction tests
- [x] T005 Implement strict profile compilation and metadata validation
- [x] T006 Add frozen semiconductor-wafer and industrial-inspection v1 profiles

## Phase 3: Policy Packs

- [x] T007 [P] Add evidence-grade pass/fail and custom policy matrix tests
- [x] T008 Implement strict policy parsing and deterministic provider-neutral evaluation
- [x] T009 Add frozen evidence-grade inspection policy v1

## Phase 4: Evidence Export And Signing

- [x] T010 [P] Add canonical order, Unicode, invalid JSON, cycle, clone, and linkage tests
- [x] T011 [P] Add sign/verify, tamper, malformed base64url, callback failure, and leak tests
- [x] T012 Implement bundle creation, strict parsing, and recursive canonical UTF-8 serialization
- [x] T013 Implement SHA-256 identity, injected signing, strict envelope parsing, and injected verification

## Phase 5: Diagnostics, Schemas, And Docs

- [x] T014 Add allowlisted profile/policy/bundle/signature safe summaries and redaction tests
- [x] T015 Add and validate profile, policy, bundle, and signed-envelope JSON Schemas
- [x] T016 Add custom policy and WebCrypto reference examples and typecheck them
- [x] T017 Update README, quickstart, operational/security docs, roadmap, changelog, and migration guide

## Phase 6: Verification And Convergence

- [x] T018 Run focused profile, policy, evidence, schema, diagnostics, and export suites
- [x] T019 Run full typecheck, examples, tests, build, reference, package dry-run, and dependency audit gates
- [x] T020 Converge all roadmap artifacts and implementation, then mark implemented with evidence

## Verification Evidence

- TypeScript and examples: `npm run typecheck` and `npm run typecheck:examples` passed, including custom policy and WebCrypto boundary examples.
- Tests: 37 files and 209 tests passed, including profile safety, policy matrices, canonical order/Unicode/invalid JSON, bundle linkage, signing, digest/signature tamper, safe diagnostics, and all prior release regressions.
- Package: dual ESM/CJS build and packaged-consumer smoke checks passed; final `npm pack --dry-run` produced 176 files at 142.2 kB packed with all four new schemas and both reference examples.
- Reference: the 64 MiB transfer/resume benchmark completed with zero duplicate acknowledged bytes and verified stored integrity.
- Dependencies: `npm audit --offline --audit-level=moderate` reported zero vulnerabilities. Registry-backed online audit remains an external prepublish action because registry dependency-tree disclosure was not authorized in this environment.
