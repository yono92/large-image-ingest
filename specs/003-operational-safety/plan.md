# Implementation Plan: 1.1.0 Operational Safety

**Branch**: `003-operational-safety` | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-operational-safety/spec.md`

## Summary

Add operational-safety improvements for the 1.1.0 minor release: safe summaries and redaction helpers for events, snapshots, resume records, and verification reports; additive retry policy configuration for transient upload failures; opt-in integration test entry points for real TUS, S3-compatible, and NAS-backed environments; and minimal server-side example guidance. The release should remain source-compatible with 1.0.0 and preserve the current single-package subpath export model.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js >=20 for build/test, ESM-first with existing CJS output.

**Primary Dependencies**: Existing runtime APIs only. No new runtime dependency planned for safe summaries, redaction helpers, retry policy, or integration harness scaffolding.

**Storage**: No new SDK-owned durable storage. Resume records remain application-owned through the existing `ResumeStore` contract. Integration tests may use external storage only when explicitly configured.

**Testing**: Vitest for unit and fake-transport behavior. Opt-in integration tests must be gated by explicit environment variables and excluded from default verification.

**Target Platform**: Browser-safe SDK core, browser-safe transport adapters, and Node.js-only helpers under `large-image-ingest/node`.

**Project Type**: TypeScript library/SDK with a single npm package and subpath exports.

**Performance Goals**: Safe summaries and redaction helpers operate on metadata-sized objects without reading original file bytes. Retry policy must not add delay to non-retryable failures, pause, cancel, or resume conflicts.

**Constraints**: Preserve original bytes, avoid logging sensitive values by default, keep core provider-neutral, keep default tests credential-free, and avoid breaking existing 1.0.0 public API shapes.

**Scale/Scope**: Operational safety for sequential multi-GB ingest flows. Parallel upload, derivative generation, React adapters, and scoped package migration remain out of scope for 1.1.0.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Original preservation: PASS. The feature adds summaries, retry policy, tests, and examples; it does not transform original bytes.
- Recoverability: PASS. Retry and resume boundaries are explicit, and safe summaries retain recovery state without exposing sensitive payloads.
- Adapter boundaries: PASS. Core helpers remain provider-neutral; TUS/S3/NAS integration checks and examples stay adapter- or application-owned.
- TypeScript contracts: PASS. Additive helper types and retry policy contracts are planned for public exports without removing existing event or snapshot shapes.
- Validation and security: PASS. Redaction and safe-summary behavior directly reduces sensitive-data exposure in logs and diagnostics.
- Documentation and tests: PASS. Plan includes README/docs updates, focused redaction tests, retry tests, and opt-in integration documentation.

## Project Structure

### Documentation (this feature)

```text
specs/003-operational-safety/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- operational-safety-contracts.md
`-- checklists/
    `-- requirements.md
```

### Source Code (repository root)

```text
src/
|-- core.ts
|-- session.ts
|-- resume.ts
|-- verification.ts
|-- types.ts
|-- diagnostics.ts          # planned additive safe summary/redaction helpers
`-- existing transport and node modules

tests/
|-- diagnostics.test.ts     # planned safe summary/redaction coverage
|-- session.test.ts
|-- session-resume.test.ts
|-- tus.test.ts
|-- s3.test.ts
`-- existing tests

docs/
|-- integration-tests.md
`-- roadmap.md

examples/
|-- tus-transport.ts
|-- s3-multipart.ts
|-- nas-gateway-route.ts
`-- planned server-side operational example or guide
```

**Structure Decision**: Keep 1.1.0 inside the current package. Add operational helpers as a small core module and export them through existing subpaths. Keep integration behavior opt-in and documented so default builds remain local and credential-free.

## Complexity Tracking

No constitution violations are required for this feature.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |

## Phase 0 Output

Research decisions are captured in [research.md](./research.md). No unresolved clarification markers remain.

## Phase 1 Output

- Data model: [data-model.md](./data-model.md)
- Public contract draft: [contracts/operational-safety-contracts.md](./contracts/operational-safety-contracts.md)
- Validation guide: [quickstart.md](./quickstart.md)

## Post-Design Constitution Check

- Original preservation: PASS. Contracts do not add any operation that reads beyond metadata objects or original file slices already used by sessions.
- Recoverability: PASS. Retry policy and summaries preserve observable state for retry, pause, cancel, resume conflicts, failure, and completion.
- Adapter boundaries: PASS. Integration targets and server examples document application-owned provider behavior without moving providers into core.
- TypeScript contracts: PASS. Additive helper and retry types are version-compatible with existing manifest, event, resume, and verification contracts.
- Validation and security: PASS. Redaction categories cover manifests, metadata, resume handles, remote data, presigned URLs, credentials, and opaque transport state.
- Documentation and tests: PASS. Quickstart defines default checks, opt-in integration behavior, and documentation updates for safe logging.
