# Implementation Plan: 1.2.0 Derivatives And Preview Foundations

**Branch**: `004-derivatives-preview-foundations` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-derivatives-preview-foundations/spec.md`

## Summary

Add derivative and preview foundations for the 1.2.0 minor release: evolve the existing manifest derivative placeholder into a validated derivative reference contract, add helper boundaries for previews, thumbnails, tile metadata, and metadata enrichment, and document how derivatives remain separate from the original source artifact. The release should stay additive for 1.1.x consumers, avoid image processing dependencies in core, and preserve the current single-package subpath export model.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js >=20 for build/test, ESM-first with existing CJS output.

**Primary Dependencies**: Existing runtime APIs only for core derivative references and validation. No runtime image decoder, thumbnailer, tile generator, cloud SDK, or UI framework dependency planned for core.

**Storage**: No SDK-owned derivative storage. Derivative records contain external references or caller-owned storage hints only; uploaded derivative assets remain application- or adapter-owned.

**Testing**: Vitest for unit behavior, synthetic large-file fixtures, manifest immutability checks, derivative validation fixtures, and package export/typecheck coverage.

**Target Platform**: Browser-safe core APIs and browser-safe preview descriptors, with server-only metadata enrichment helpers exposed through the existing Node subpath if implementation requires server APIs.

**Project Type**: TypeScript library/SDK with a single npm package and subpath exports.

**Performance Goals**: Derivative attachment and validation operate on metadata-sized objects without reading original file bytes. Browser preview foundations must not require full-file reads, full-image decode, or derivative binary embedding by default.

**Constraints**: Preserve original bytes and identity, keep derivative binaries outside manifests, avoid logging credentials or presigned URLs, keep core provider-neutral, keep default tests credential-free, and avoid breaking existing 1.1.x public API shapes.

**Scale/Scope**: Foundation for derivative references and metadata for multi-GB inspection images. Actual image decoding, thumbnail rendering, tile generation, React adapters, parallel upload, and scoped package migration remain out of scope for 1.2.0 unless separately specified.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Original preservation: PASS. The feature models previews, thumbnails, tiles, and metadata enrichments as derivative references and does not transform original bytes.
- Recoverability: PASS. No new upload resume behavior is introduced. Failed or missing derivatives are represented separately from original ingest state.
- Adapter boundaries: PASS. Core owns derivative references, attachment, and validation only; image processing, storage upload, UI, and provider behavior stay caller- or adapter-owned.
- TypeScript contracts: PASS. Planned public types and helpers are additive to the existing manifest derivative placeholder and avoid a breaking manifest migration.
- Validation and security: PASS. Validation covers stale source relationships, unsafe references, and sensitive fields while keeping derivative bytes and secrets out of manifests.
- Documentation and tests: PASS. Plan includes README/docs updates, manifest immutability tests, derivative validation tests, and default credential-free verification.

## Project Structure

### Documentation (this feature)

```text
specs/004-derivatives-preview-foundations/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- derivatives-preview-contracts.md
`-- checklists/
    `-- requirements.md
```

### Source Code (repository root)

```text
src/
|-- types.ts                 # expand additive derivative reference types
|-- manifest.ts              # preserve empty derivatives on initial manifest creation
|-- derivatives.ts           # planned derivative attachment and validation helpers
|-- preview.ts               # planned browser-safe preview/thumbnail descriptors
|-- node-metadata.ts         # planned server-side metadata enrichment helpers if needed
|-- core.ts                  # planned core exports for derivative helpers
`-- node.ts                  # planned server-only exports when applicable

tests/
|-- manifest.test.ts
|-- derivatives.test.ts      # planned attachment, validation, and immutability coverage
|-- preview.test.ts          # planned browser-safe descriptor fixtures
|-- node-metadata.test.ts    # planned server-only metadata fixtures if needed
`-- package-exports.test.ts

docs/
|-- roadmap.md
`-- derivatives.md           # planned derivative usage guide if README becomes too large
```

**Structure Decision**: Keep 1.2.0 inside the current package. Add derivative foundations as small core helpers and optional subpath exports only when the implementation needs an environment-specific boundary. Do not introduce a workspace or scoped-package migration for this feature.

## Complexity Tracking

No constitution violations are required for this feature.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |

## Phase 0 Output

Research decisions are captured in [research.md](./research.md). No unresolved clarification markers remain.

## Phase 1 Output

- Data model: [data-model.md](./data-model.md)
- Public contract draft: [contracts/derivatives-preview-contracts.md](./contracts/derivatives-preview-contracts.md)
- Validation guide: [quickstart.md](./quickstart.md)
- Agent context update: no dedicated update-agent script exists in `.specify/scripts/powershell`; existing AGENTS.md guidance already covers Spec Kit and derivative boundaries.

## Post-Design Constitution Check

- Original preservation: PASS. Derivative contracts are separate from original identity and do not provide any operation that mutates or rewrites the source artifact.
- Recoverability: PASS. Planned, created, and failed derivative states are explicit and do not change existing upload resume semantics.
- Adapter boundaries: PASS. Preview generation, tile generation, metadata extraction, storage, and UI behavior remain adapter- or caller-owned.
- TypeScript contracts: PASS. The plan evolves the existing derivative placeholder additively and keeps a path to future subpath or scoped-package boundaries.
- Validation and security: PASS. Contracts exclude derivative bytes, credentials, presigned URLs, and sensitive metadata from default manifest records.
- Documentation and tests: PASS. Quickstart defines focused checks for derivative immutability, validation, preview descriptors, metadata enrichment, and default credential-free verification.
