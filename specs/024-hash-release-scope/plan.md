# Implementation Plan: Hash Performance, Release Integrity And Scope Clarity

## Approach

- **Hashing**: remove per-access fallbacks from the SHA-256 compression loop (indices are always in bounds) and use 32-bit integer arithmetic; add executors that plug into the existing `ChecksumExecutor` contract rather than a new API.
- **Node executor** lives in `node-verification.ts` beside `calculateNodeFileChecksum` and is exported from `large-image-ingest/node`. Core does not detect Node.js, keeping it framework- and runtime-agnostic.
- **Browser**: keep the existing Worker executor; it benefits from the faster built-in loop. A `hash-wasm` subpath was measured and dropped (see spec).
- **Review fixes**: decimal-only tus `Upload-Offset`; NAS finalize checks the real path of the target directory against the real root and accepts in-root names starting with `..`.
- **Release**: `release.yml` on `v*` tags, npm 11.21.1 for Trusted Publishing, Playwright Chromium for `prepublishOnly` browser checks. Size guard via `size-limit` (dev dependency) in CI and release.
- **Scope**: README rewritten around install, first upload, executors, stability tiers and provenance verification; prior sections moved verbatim to `docs/guide.md`; `docs/glossary.md` for recurring terms; `@experimental` tags added mechanically to runtime exports of Experimental modules.
- **Session**: move top-level helpers only; class methods untouched.

## Verification

`npm run typecheck`, `npm test`, `npm run build`, `npm run size`, `tests/hash-executors.test.ts`, and a declaration diff of `dist/esm/*.d.ts` against `main`.
