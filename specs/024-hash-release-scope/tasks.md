# Tasks: Hash Performance, Release Integrity And Scope Clarity

- [x] T001 Add `size-limit` config and `size` script; run in `.github/workflows/ci.yml` (US2).
- [x] T002 Add `.github/workflows/release.yml` with provenance publish and tag/version check (US2, FR-005).
- [x] T003 Speed up the built-in SHA-256 loop in `src/checksum.ts` (US1).
- [x] T004 Add `createNodeChecksumExecutor` to `src/node-verification.ts` and export from `src/node.ts` (US1, FR-001, FR-002).
- [x] T005 Measure a `hash-wasm` executor; drop it because it was no faster than the built-in Worker (US1, FR-003).
- [x] T006 Add digest-equivalence, progress and cancellation tests in `tests/hash-executors.test.ts` (US1).
- [x] T007 Rewrite `README.md`, move details to `docs/guide.md`, add `docs/glossary.md` (US3).
- [x] T008 Tag Experimental runtime exports with `@experimental` (US3).
- [x] T009 Extract `session-retry.ts`, `session-receipts.ts`, `session-state.ts` from `src/session.ts` (US4, FR-004).
- [x] T010 Update `docs/roadmap.md`, `docs/benchmarks.md`, `CHANGELOG.md` (all).
- [x] T011 Run typecheck, tests, build, size; diff declarations against `main` (FR-004).
- [x] T012 Pass workflow `session.checksum` options to the restart re-hash in `src/workflow.ts`.
- [x] T013 Review fixes in `src/tus.ts` and `src/nas.ts` with regression tests.
