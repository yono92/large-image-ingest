# Implementation Plan: Resume Integrity Hardening

**Branch**: `main` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-resume-integrity-hardening/spec.md`

## Summary

Complete durable multipart recovery for the 1.2.0 release by evolving the resume record to persist validated chunk receipts, recognizing supported legacy records without fabricating provider evidence, validating untrusted persisted state before it affects control flow, and advertising snapshot versus persistent resume capabilities explicitly. The change remains additive at package entrypoints and keeps provider-specific receipt interpretation inside transport adapters.

## Technical Context

**Language/Version**: TypeScript 5.x, ESM-first package, CommonJS compatibility output, Node.js >=20 for tests/build

**Primary Dependencies**: Existing native `Blob`, `Storage`, `AbortSignal`, `fetch`, and local helpers. No runtime dependency is added.

**Storage**: Versioned `ResumeRecord` values through the existing async `ResumeStore`; built-in Web Storage adapter; application-owned IndexedDB, encrypted, or server-side stores remain supported.

**Testing**: Vitest with synthetic files, malformed JSON/record fixtures, memory stores, fake transports, mocked S3 broker/fetch, and package consumption smoke checks.

**Target Platform**: Browser-compatible core and transport modules plus Node.js test/build environments.

**Project Type**: TypeScript library/SDK in one npm package with subpath exports.

**Performance Goals**: Record validation is linear in bounded chunk and receipt counts; malformed ranges never cause iteration beyond the active chunk plan; no original file bytes are read for this feature.

**Constraints**: Preserve existing import paths and common custom transport implementations; never invent S3 ETags or part numbers; never expose full records or sensitive transport fields through default events; keep provider rules out of core.

**Scale/Scope**: Sequential multi-GB uploads with up to provider-advertised chunk limits, including S3 multipart's 10,000-part ceiling. Content-level file identity, concurrent resume claims, remote-completion reconciliation, parallel upload, and worker checksum execution are deferred to future features.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Original preservation: PASS. The feature reads and validates metadata-sized resume records only and never mutates or rewrites original bytes.
- Recoverability: PASS. Durable resume is explicitly separated from retry and snapshot resume; checkpoint evidence, legacy handling, conflicts, and cleanup behavior are specified.
- Adapter boundaries: PASS. Core validates generic receipt identity and bounds; S3 continues to own ETag/part requirements and tus continues to own offset reconciliation.
- TypeScript contracts: PASS. Resume schema v0.2, legacy v0.1 recognition, additive transport capabilities, receipt persistence, and new typed conflicts are documented.
- Validation and security: PASS. Persisted values are parsed as untrusted input, bounded before iteration, and redacted in default diagnostics.
- Documentation and tests: PASS. Plan includes focused parser, session, S3, tus, Web Storage, documentation, and package verification work.

## Project Structure

### Documentation (this feature)

```text
specs/005-resume-integrity-hardening/
- spec.md
- plan.md
- research.md
- data-model.md
- quickstart.md
- contracts/
  - resume-integrity-contracts.md
- checklists/
  - requirements.md
- tasks.md
```

### Source Code (repository root)

```text
src/
- core.ts
- diagnostics.ts
- resume.ts
- s3.ts
- session.ts
- tus.ts
- types.ts
- web-storage-resume-store.ts

tests/
- diagnostics.test.ts
- resume.test.ts
- s3.test.ts
- session-resume.test.ts
- tus.test.ts
- web-storage-resume-store.test.ts

docs/
- quickstart.md
- roadmap.md

README.md
CHANGELOG.md
package.json
package-lock.json
```

**Structure Decision**: Keep the current single-package subpath layout. Resume record parsing and generic receipt validation remain in core modules; transport-specific persistent recovery remains in the existing S3 and tus modules.

## Complexity Tracking

No constitution violations are required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |

## Phase 0 Output

Research decisions are recorded in [research.md](./research.md). No unresolved clarification markers remain.

## Phase 1 Output

- Data model: [data-model.md](./data-model.md)
- Public contracts: [contracts/resume-integrity-contracts.md](./contracts/resume-integrity-contracts.md)
- Validation guide: [quickstart.md](./quickstart.md)

## Post-Design Constitution Check

- Original preservation: PASS. The v0.2 record stores receipts and operational metadata, never source bytes.
- Recoverability: PASS. Receipt-backed persistent resume and safe legacy rejection are complete, observable paths.
- Adapter boundaries: PASS. The contract adds generic evidence without moving provider-specific validation into core.
- TypeScript contracts: PASS. The union schema and optional capability additions preserve supported 1.x entrypoints.
- Validation and security: PASS. Both built-in and custom store results pass through bounded validation before use.
- Documentation and tests: PASS. The quickstart and task plan require migration examples and full local verification.
