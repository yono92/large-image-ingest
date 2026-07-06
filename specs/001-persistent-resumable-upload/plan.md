# Implementation Plan: Persistent Resumable Upload

**Branch**: `001-persistent-resumable-upload` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-persistent-resumable-upload/spec.md`

## Summary

Add durable resume persistence to the existing framework-agnostic ingest session model. The core will persist versioned resume records through a store interface, validate file and chunking identity before resume, require transports to validate remote resume state, checkpoint only after confirmed chunk success, and expose typed resume lifecycle events/errors.

## Technical Context

**Language/Version**: TypeScript 5.x, ESM-first package, Node.js >=20 for tests/build

**Primary Dependencies**: Existing runtime APIs plus native `Blob`, `Storage`, `AbortSignal`, and small local helpers. No new runtime dependency is planned for the core release.

**Storage**: Versioned resume records through an async `ResumeStore` contract; small Web Storage adapter for browser `localStorage`/`sessionStorage`; custom stores for IndexedDB, encrypted, or server-backed persistence.

**Testing**: Vitest with synthetic `File`/`Blob`, fake resume stores, and fake transports. No real cloud credentials or network services in default tests.

**Target Platform**: Browser-compatible core package and Node.js test/runtime environment. Browser resume requires the application to provide the same original file again.

**Project Type**: TypeScript library/SDK, currently single package with future modular package path.

**Performance Goals**: Avoid whole-file reads or decoded image persistence. Resume checkpoint writes are small metadata operations. Interrupted sequential upload loses at most the current in-flight chunk.

**Constraints**: Original bytes must not be mutated or persisted. Resume records may contain sensitive metadata or transport handles and must not be logged by default. Core remains provider-neutral and framework-agnostic.

**Scale/Scope**: Multi-GB inspection images split into deterministic sequential chunks. Parallel upload and sparse reconciliation are out of scope for this feature.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Original preservation: PASS. Resume records explicitly exclude original bytes, decoded image data, generated derivatives, and transformed original content.
- Recoverability: PASS. The spec defines persistent resume separately from transient retry, including checkpoint timing, conflicts, pause, cancel, completion cleanup, and typed observable states.
- Adapter boundaries: PASS. Core owns resume contracts and orchestration; transports own remote session validation; storage is behind a store contract.
- TypeScript contracts: PASS. Plan defines exported resume records, store contracts, transport result changes, lifecycle state, and typed resume conflicts.
- Validation and security: PASS. File/chunking/transport validation happens before upload; sensitive handles and metadata are not logged by default; cloud/network tests remain opt-in.
- Documentation and tests: PASS. README updates, focused fake-store/fake-transport tests, and package checks are complete for the released baseline.

## Project Structure

### Documentation (this feature)

```text
specs/001-persistent-resumable-upload/
- spec.md
- plan.md
- research.md
- data-model.md
- quickstart.md
- contracts/
  - resume-contracts.md
- checklists/
  - requirements.md
- tasks.md
```

### Source Code (repository root)

```text
src/
- chunks.ts
- fingerprint.ts
- index.ts
- manifest.ts
- resume.ts
- session.ts
- types.ts
- validation.ts
- web-storage-resume-store.ts

tests/
- chunks.test.ts
- manifest.test.ts
- resume.test.ts
- session-resume.test.ts
- validation.test.ts
- web-storage-resume-store.test.ts
```

**Structure Decision**: Keep the 1.0 release in the existing single package. Add focused resume modules and tests at the repository root, preserving a future split into core and browser persistence adapters.

## Complexity Tracking

No constitution violations are required for this feature.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |

## Phase 0 Output

Research decisions are captured in [research.md](./research.md). No unresolved clarification markers remain.

## Phase 1 Output

- Data model: [data-model.md](./data-model.md)
- Public contract: [contracts/resume-contracts.md](./contracts/resume-contracts.md)
- Validation guide: [quickstart.md](./quickstart.md)

## Post-Design Constitution Check

- Original preservation: PASS. Data model prevents original byte persistence.
- Recoverability: PASS. State transitions and contracts define retry/resume separation.
- Adapter boundaries: PASS. Contracts require transport validation but not provider-specific logic.
- TypeScript contracts: PASS. Contract names exported types and schema versions.
- Validation and security: PASS. Conflict states and sensitive field handling are documented.
- Documentation and tests: PASS. Quickstart and tasks require README, fake transports, fake stores, and package checks.
