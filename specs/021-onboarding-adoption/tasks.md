# Tasks: Executable Onboarding And Adoption Validation

**Input**: spec.md, plan.md, research.md, data-model.md and contracts/onboarding.md

## Phase 1: Setup
- [x] T001 Establish spec/plan/contracts and validate constitution gates in specs/021-onboarding-adoption/ (FR-001–FR-011).

## Phase 2: Foundation
- [x] T002 Define behavioral acceptance checks in tests/onboarding-examples.test.ts (FR-002–FR-005, FR-011).
- [x] T003 Add valid fixture and public-import HTTP bridge in examples/onboarding/fixture.mjs and transport.mjs; expose trusted completed-file lookup in examples/reference-local/local-server.mjs (FR-002).

## Phase 3: US1 Minimum upload
- [x] T004 [US1] Add executable examples/onboarding/minimal-upload.mjs (FR-001, FR-002).
- [x] T005 [US1] Put the minimal path first in README.md and docs/quickstart.md (FR-001, FR-006).

## Phase 4: US2 Complete workflow
- [x] T006 [US2] Add private filesystem adapters in examples/onboarding/file-stores.mjs (FR-003, FR-004).
- [x] T007 [US2] Add examples/onboarding/verified-workflow.mjs and README.md documenting complete adapters and recovery limits (FR-003–FR-006).

## Phase 5: US3 Adoption observation
- [x] T008 [US3] Define counting/security tests in tests/adoption-observations.test.ts (FR-007–FR-011).
- [x] T009 [US3] Implement scripts/adoption-report.cjs and docs/adoption-observations.template.json (FR-007–FR-010).
- [x] T010 [US3] Add docs/adoption-validation.md with real participant protocol and explicit unknown baseline (FR-007–FR-010, SC-005).

## Phase 6: Verification
- [x] T011 Wire package scripts/ignore rules and scripts/verify-onboarding-package.cjs; update CHANGELOG.md (FR-001, FR-006, FR-010, FR-011).
- [x] T012 Run focused/package-consumer tests and typecheck/test/build; record results and complete tasks in specs/021-onboarding-adoption/tasks.md (FR-011).

## Dependencies And Parallel Opportunities
T001 → T002 → T003 → T004 → T005; T003 → T006 → T007. T008 → T009 → T010 is independent after T001. T011 integrates all stories; T012 follows implementation. Independent file reads and test invocations may run in parallel; shared-file edits remain sequential.

## Implementation Strategy
Ship US1 as the minimum path, then full workflow and local adoption reporting. External participant results are post-implementation observations, not fabricated completion tasks.

## Verification Results (2026-10-07)

- `npm run typecheck`: passed.
- `npm run typecheck:examples`: passed.
- `npm run build`: passed, including public package consumption checks.
- `npm test`: 87 files / 409 tests passed, including 18 new onboarding/observation checks.
- `node scripts/verify-onboarding-package.cjs`: both shipped examples passed in an isolated packed consumer with no installed optional peers. Minimal upload completed; full workflow reconstructed the client, resumed, verified the stored original and reloaded persisted evidence. CI now runs this check after build.
- Independent `geotiff` fixture validation: decoded 512 × 512 grayscale TIFF successfully.
- Empty observation CLI: unknown actual adoption, no external observations, null success rates.
- `git diff --check`: passed.

This initial verification used Node.js 22.14.0 and preceded release preparation. The configured CI uses Node.js 20; no CI execution or package publication was part of this initial checkpoint. External first-time trials and actual project observations remain uncollected; the completed work supplies the evaluation protocol, private input schema and reporting tools.

## Release Preflight: 1.8.1

- Synchronized package/lock metadata, embedded producer version and version assertions; refreshed installed-consumer instructions, changelog and roadmap.
- Updated development-only source-map-js to 1.2.2 and undici to 7.30.0 after the initial audit rejected vulnerable locked versions.
- Final `npm run prepublishOnly`: passed, including all four TypeScript checks, 409 tests, 21 UI unit checks, 4 real browser scenarios, packed onboarding, S3/tus/NAS conformance, browser checksum, HTTP interruption/recovery, adoption-evidence checks and audit (0 vulnerabilities).
- npm publication requires restored account authentication; the preflight npm identity check returned 401. External developer/adoption observations remain pending.
