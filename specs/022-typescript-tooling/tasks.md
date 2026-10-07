# Tasks: TypeScript Tooling Sources

## Setup And Foundation
- [x] T001 Establish scope, plan, research and quality gates in specs/022-typescript-tooling/ (FR-001–FR-009).
- [x] T002 Add tsx development loader and strict compiler configurations in package.json, tsconfig.tooling.json and tsconfig.runtime-examples.json (FR-002, FR-004, FR-005).

## US1 Typed Sources
- [x] T003 [US1] Convert scripts/ JavaScript to .cts with typed CLI/report/transport contracts (FR-001, FR-002).
- [x] T004 [US1] Convert benchmarks/ JavaScript to .cts and type candidate/harness/report contracts (FR-001, FR-002).
- [x] T005 [US1] Convert examples/ JavaScript to .mts/.cts and use public SDK adapter contracts (FR-001–FR-003).
- [x] T006 [US1] Convert tests/fixtures/conformance-drivers/ to .mts and cover migrated sources in compiler checks (FR-001, FR-002).

## US2 Executable Package
- [x] T007 [US2] Emit dist/examples, update package commands/docs and packed-consumer verification in package.json, scripts/verify-onboarding-package.cts, README.md and examples/onboarding/README.md (FR-003–FR-006).

## US3 Developer Workflows
- [x] T008 [US3] Update Vitest setup, test imports, native child processes and CI in tests/, scripts/, vitest.config.ts and .github/workflows/ci.yml (FR-005, FR-006, FR-009).
- [x] T009 [US3] Remove six local shell helpers, ignore .cjs/.mjs/.sh and .specify/feature.json; document developer-tool roles in docs/development.md (FR-007).
- [x] T010 [US3] Preserve historical adoption evidence and refresh TypeScript-source measurements/claims in benchmarks/results/, docs/adoption-evidence.md and README.md (FR-008).

## Verification
- [x] T011 Check source inventory, clean-output typechecks/tests/build, package consumers and changed runtime paths; record results in specs/022-typescript-tooling/tasks.md (FR-009).

- [x] T012 Purge .cjs/.mjs/.sh paths from all historical branch/tag commits after explicit user authorization; verify every retained commit tree before pushing.

## Dependencies And Parallel Opportunities
T001 → T002 → T003–T006 → T007/T008 → T010 → T011. T009 is independent after T001. Independent reads and research can overlap; shared-file mutations remain sequential.

## Strategy
Establish executable TS infrastructure, migrate behavior with explicit types, then verify package/developer paths and refresh evidence. Each former JavaScript source has one TypeScript owner; generated output stays ignored.

## Completed Validation — 2026-10-07

- Inventory: all 44 original handwritten JavaScript files replaced with TypeScript; embedded HTML benchmark logic extracted into TypeScript; source-inventory regression test passes.
- Clean output: remove dist, run SDK/tooling and all three existing example typechecks; build succeeds without generated tools.
- Node 22.14.0: 88 test files / 410 tests pass; browser UI 4/4 passes.
- Node 20.20.2: all 410 tests pass without pre-existing dist; SDK/example build, ESM/CommonJS consumption smoke, isolated packed examples and official transport conformance pass.
- Consumer: minimal and full workflow run with plain Node and cleared NODE_PATH/NODE_OPTIONS, no optional peers or development loader; original verification, client reconstruction and evidence reload pass.
- Transport: S3 10 passed; tus 9 passed / optional chunk integrity unsupported; NAS 10 passed. Official matrix tests repeat behavior ten times.
- Reference: 64 MiB HTTP interruption/resume passes with zero duplicate acknowledged bytes and independently verified stored original.
- Browser checksum: 64 MiB completion/cancellation passes, zero late progress, fixed responsiveness/memory gates pass.
- Parallel: 32 canonical receipts, maximum concurrency 4, observed 2.32× speedup.
- Adoption: preserved September report unchanged; October report hashes match all current candidates; 42/42 controlled scenarios / 150 trials retained. Counts: SDK 250, raw tus 151, raw S3 154 non-comment source lines; declarations count under the existing policy.
- Before removal, the Spec Kit prerequisite resolver passed. At the user’s subsequent request, all six local shell helpers were deleted and .cjs/.mjs/.sh files were removed from all local branch/tag histories. The installed skills require separately provisioned helpers; SDK checks do not. Local feature pointer remains untracked.
- Real-provider integration remains explicitly opt-in and skipped without operator configuration. No publish or release tag is part of this change.

- History cleanup: 47 retained commits and 39 distinct commit trees audited with zero .cjs/.mjs/.sh paths; SDK/tooling typecheck, 410 tests and build passed after local helper removal.
