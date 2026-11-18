# Feature Specification: Hash Performance, Release Integrity And Scope Clarity

**Feature Branch**: `roadmap/v1.9-v1.11`
**Created**: 2026-11-18
**Status**: Implemented (unreleased); deferred items listed below
**Input**: Execute the "large-image-ingest 개선 플랜" roadmap: provenance releases and size guard, faster hashing, stability tiers and a shorter README, and an internal split of `session.ts` with no behavior change.

## User Scenarios & Testing

### User Story 1 - Shorter wait before upload (Priority: P1)

An application ingesting multi-GiB originals spends less time hashing before transfer starts.
**Independent Test**: Hash fixtures of boundary sizes with every executor and compare with `node:crypto`; measure 256 MiB throughput.
**Acceptance Scenarios**:
1. The built-in JavaScript SHA-256 returns identical digests and is measurably faster than 1.8.2.
2. `createNodeChecksumExecutor()` (`large-image-ingest/node`) returns the same `FileChecksum` evidence using `node:crypto`, honours `AbortSignal` with `ChecksumCanceledError`, and reports monotonic progress ending at the file size.
3. `createBrowserWasmChecksumExecutor()` (`large-image-ingest/browser-wasm`) does the same with the optional `hash-wasm` peer; applications that do not import the subpath need no peer.

### User Story 2 - Verifiable releases (Priority: P2)

A consumer can check that a published version was built by the repository's CI.
**Acceptance Scenarios**:
1. Pushing a `v<version>` tag publishes with `npm publish --provenance` from GitHub Actions after the full `prepublishOnly` verification, and refuses when the tag differs from `package.json`.
2. CI fails when the `core` bundle grows beyond 10% of the 24 kB gzip baseline.

### User Story 3 - Know what is stable (Priority: P3)

A first-time reader learns from the README which import paths are covered by semver.
**Acceptance Scenarios**:
1. The README states Stable, Experimental and Compatibility tiers for every import path and fits in 150 lines.
2. Runtime exports of Experimental paths carry an `@experimental` TSDoc tag.
3. Detailed feature sections remain available unchanged in `docs/guide.md`.

### User Story 4 - Maintainable session core (Priority: P3)

Maintainers can change retry, receipt or snapshot helpers without editing the 2,326-line session file.
**Acceptance Scenarios**:
1. Module-level helpers move to `session-retry.ts`, `session-receipts.ts` and `session-state.ts` without code changes.
2. All existing tests pass and the emitted `session.d.ts` is byte-identical to 1.8.2.

## Requirements

- **FR-001**: Executors MUST return `FileChecksum` values accepted by `calculateChecksum` validation (algorithm, scope `whole-file`, matching `chunkSizeBytes`, 64-hex value).
- **FR-002**: Executors MUST read at most one `chunkSize` slice at a time.
- **FR-003**: Runtime dependencies MUST stay empty; `hash-wasm` is an optional peer.
- **FR-004**: No public type or behavior of existing exports changes.
- **FR-005**: Release publication MUST run in CI with OIDC (`id-token: write`) and provenance.

## Success Criteria (measured 2026-11-18, Apple Silicon, Node.js 22.14.0, Chromium via Playwright, 256 MiB)

| Path | 1.8.2 | Now | Target |
| --- | ---: | ---: | ---: |
| Built-in JavaScript, Node.js | 122 MiB/s | 235 MiB/s | faster |
| Node executor | — | 2,478 MiB/s | ≥ 1 GiB/s (met) |
| Browser WASM executor | — | 393 MiB/s | ≥ 500 MiB/s (not met) |
| Built-in JavaScript Worker, Chromium | — | 283 MiB/s | faster |

## Deferred (with reason)

- **Single read for parallel upload** and **hash/upload overlap**: both change when chunk evidence is bound relative to transfer and need a spec amendment to 020 before code.
- **Main-thread-free WASM**: a Worker cannot resolve the bare `hash-wasm` import without a bundler; the executor runs on the main thread one chunk at a time.
- **changesets**: its version command does not update `src/package-version.ts` (checked by `prebuild`) and would replace the curated changelog format.
- **TypeDoc site**: `typedoc@0.28.20` pulls a `minimatch` version with an open moderate advisory, which fails the release audit gate.
- **v0.1/v0.2 resume deprecation**: `createResumeRecord` (public) and the in-memory snapshot resume path still write v0.2 records, so a deprecation warning would fire for current users. Decide the v0.2 replacement before announcing removal.
- **Four-module session split** (lifecycle, sequential, parallel, resume): the class shares mutable state across these roles; split after the helper extraction lands and is released.
