# Implementation Plan: TUS Transport Adapter

**Branch**: `codex/tus-transport-adapter` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-tus-transport-adapter/spec.md`

## Summary

Add a TUS-compatible transport adapter that plugs into the existing `UploadTransport` contract. The adapter will create remote upload resources, upload deterministic chunk slices with remote offset validation, refresh resume metadata, and map remote protocol failures into typed SDK errors without moving TUS-specific behavior into the provider-neutral core.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js >=20 for tests/build, ESM/CJS package outputs already supported by the repository.

**Primary Dependencies**: Existing runtime APIs plus native `fetch`, `Blob.slice`, `Headers`, and `AbortSignal`. No new runtime dependency is planned for the MVP adapter.

**Storage**: Adapter does not own durable storage. It returns provider-neutral transport resume state to the existing `ResumeStore` path.

**Testing**: Vitest with a local in-memory TUS protocol simulator and no external network or cloud credentials.

**Target Platform**: Browser-compatible SDK code and Node.js test/runtime environment.

**Project Type**: TypeScript library/SDK, currently single package with preserved module boundaries for future transport package extraction.

**Performance Goals**: Stream/slice chunks without whole-file reads. Resume validation should require one remote-state request before skipped chunks continue. Sequential upload loses at most the current in-flight chunk.

**Constraints**: Preserve original bytes, do not log sensitive upload URLs or headers, keep core provider-neutral, and keep default tests local/offline.

**Scale/Scope**: Sequential multi-GB inspection image uploads over TUS-compatible endpoints. Parallel upload, concatenation, and strong checksum verification are out of scope for this feature.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Original preservation: PASS. Adapter uploads `Blob.slice` ranges from the original file and does not transform source bytes.
- Recoverability: PASS. Adapter validates remote offset and remote session state before the core skips completed chunks.
- Adapter boundaries: PASS. TUS behavior is isolated in a transport module and does not alter core session contracts beyond using the existing transport interface.
- TypeScript contracts: PASS. Public adapter options, TUS state, and typed errors will be exported and documented.
- Validation and security: PASS. Sensitive headers, upload URLs, resume handles, and customer metadata are not included in default events or logs.
- Documentation and tests: PASS. Plan requires README updates, public contract documentation, and fake endpoint tests for fresh upload, resume, conflicts, and failure mapping.

## Project Structure

### Documentation (this feature)

```text
specs/002-tus-transport-adapter/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- tus-transport-contracts.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/
|-- tus-transport.ts
|-- index.ts
|-- types.ts
`-- existing core modules

tests/
|-- tus-transport.test.ts
|-- tus-protocol-fixtures.ts
`-- existing tests
```

**Structure Decision**: Keep the adapter in the current package for this MVP. Use a dedicated `src/tus-transport.ts` module and focused test fixtures so the code can later move to `@large-image-ingest/transport-tus` without changing the core session API.

## Complexity Tracking

No constitution violations are required for this feature.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |

## Phase 0 Output

Research decisions are captured in [research.md](./research.md). No unresolved clarification markers remain.

## Phase 1 Output

- Data model: [data-model.md](./data-model.md)
- Public contract draft: [contracts/tus-transport-contracts.md](./contracts/tus-transport-contracts.md)
- Validation guide: [quickstart.md](./quickstart.md)

## Post-Design Constitution Check

- Original preservation: PASS. Contracts require direct byte upload from original slices only.
- Recoverability: PASS. Data model includes remote offset and conflict states before chunk skipping.
- Adapter boundaries: PASS. TUS options and protocol state remain adapter-owned.
- TypeScript contracts: PASS. Adapter options and remote state are explicit exported contracts.
- Validation and security: PASS. Sensitive request data is treated as application-owned and omitted from default events.
- Documentation and tests: PASS. Quickstart and tasks will require local fake endpoint tests and README updates.
