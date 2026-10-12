# Tasks: Real-File Onboarding And Package Portability

## Setup And Foundation
- [x] T001 Establish spec, clarification scan, plan, research, contracts and quality checklist in specs/023-onboarding-portability/ (FR-001–FR-010).
- [x] T002 Verify constitution and source/package ignore boundaries in .specify/memory/constitution.md, .gitignore and .npmignore.

## US1 Verify My Original
Independent test: supplied spaced-path source uploads untouched and stored checksum verifies; bounded file reads and mutation rejection.
- [x] T003 [US1] Add source-integrity/bounded-read/mutation rejection tests in tests/onboarding-examples.test.ts (FR-001, FR-002, FR-009).
- [x] T004 [US1] Implement file-backed source validation/stability in examples/onboarding/source.mts and integrate examples/onboarding/minimal-upload.mts (FR-001, FR-002).

## US3 Understand Failures
Independent test: help/usage/source/storage/port/validation/verification/unknown cases have safe cause and no private values.
- [x] T005 [US3] Add shared CLI/error/execution tests in tests/onboarding-cli.test.ts (FR-006–FR-009).
- [x] T006 [US3] Implement shared parsing/help/sanitized failures in examples/onboarding/cli.mts and wire both examples plus fixture.mts (FR-006–FR-008).

## US2 Install And Execute
Independent test: actual npm/pnpm/Yarn PnP/Bun local tarball installs, both formats, absent peers, two bins and real-source CLI.
- [x] T007 [US2] Add portable bins/shebangs and synchronize package.json/package-lock.json plus tests/package-exports.test.ts (FR-003).
- [x] T008 [US2] Replace extracted consumer with actual manager installation/safe stage verification in scripts/verify-onboarding-package.cts; preserve working PnP disk synchronization in examples/reference-local/local-server.mts and examples/onboarding/file-stores.mts (FR-003, FR-004, FR-008, FR-009).
- [x] T009 [US2] Add pinned four-manager consumer matrix in .github/workflows/ci.yml and script alias in package.json (FR-005).

## Polish And Verification
- [x] T010 Update README.md, examples/onboarding/README.md, docs/development.md, docs/roadmap.md and CHANGELOG.md for 1.8.2 commands, errors and qualification scope (FR-010).
- [x] T011 Run required package checks, focused and actual four-manager consumer checks; record versions/results in specs/023-onboarding-portability/tasks.md (FR-009, SC-001–SC-004).
- [x] T012 Run existing reference/browser release checks, inspect package and reconcile final implementation against specs/023-onboarding-portability/spec.md and plan.md (FR-009, FR-010).

## Dependencies And Strategy
T001/T002 → T003/T005 tests → T004/T006 implementation → T007 → T008/T009 → T010 → T011/T012. Source and CLI are independently testable but share minimal-upload.mts integration, so edit sequentially. US1 is the standalone MVP; the authorized deliverable includes all three stories. Independent reads/consumer jobs may overlap; shared dist builds stay sequential. All tasks map to explicit requirements, no core API/schema change.

## Completed Validation — 2026-10-12
- Spec quality: 16/16; pre-implementation analysis: 10/10 functional requirements covered by 12 tasks, no critical/high findings, constitution gates pass. External helpers were provisioned from official Spec Kit 1.0.2 into /tmp only after review; none restored to repository/history.
- Node 22.14.0: SDK/tooling and three example typechecks pass; build/ESM/CommonJS consumption pass; 89 test files / 449 tests pass (39 added), including source preservation/change rejection and safe CLI outcomes.
- The same local 1.8.2 tarball passes actual npm 10.8.2, pnpm 10.32.1, Yarn 4.12.0 PnP and Bun 1.3.5 installation/consumption on both Node 22.14.0 and Node 20.15.1. Both module formats, absent React/geotiff, both bins, workflow reconstruction/evidence reload and spaced-path real-file byte preservation pass. Yarn has its PnP loader and no node_modules.
- PnP qualification reproduced its unimplemented FileHandle.sync; descriptor fsync fixes both local upload acknowledgements and example persistence while retaining disk synchronization.
- Existing browser UI 4/4 passes; 64 MiB browser checksum/cancel checks pass (zero late progress). 64 MiB HTTP interruption/resume passes (zero duplicate acknowledged bytes, stored integrity verified). Official S3/tus/NAS conformance passes 10/9/10 with tus chunk-integrity explicitly unsupported.
- Package inspection: 341 entries, compiled example binaries present, no private local records/test/Spec Kit/tool sources. Whitespace checks pass. SDK runtime dependencies, exports and artifact schemas remain unchanged.
- CI matrix is configured; GitHub release and npm publication are separate distribution steps following these implementation checks.

## Release Preflight — 2026-10-12
- The user authorized the 1.8.2 release, commit, push and annotated version tag.
- Full npm run prepublishOnly passes: all TypeScript checks, 449 tests, UI unit/browser checks, packed npm consumption, transport conformance, browser checksum, HTTP recovery, adoption evidence and npm audit (zero vulnerabilities).
- Release documentation, package/lockfile/producer versions and examples describe 1.8.2. Four-manager Node 20/22 qualification remains the recorded distribution compatibility evidence.
- Initial Linux CI hit the default 5-second timeout in the real file-backed HTTP/fsync test (about 7 seconds under shared load). The integration test alone receives a 20-second timeout; SDK/runtime behavior and other test limits remain unchanged.
