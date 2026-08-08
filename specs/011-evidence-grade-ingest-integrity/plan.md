# Implementation Plan: Evidence-Grade Ingest Integrity

**Branch**: `main` | **Date**: 2026-08-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-evidence-grade-ingest-integrity/spec.md`

## Summary

Bind persistent resume to the source's whole-file SHA-256, introduce resume schema v0.3, and reject unsafe or mismatched sources before transport access. Extend the provider-neutral completion contract with optional normalized stored-object evidence, derive one immutable `large-image-ingest.completion.v1` record per successful session, and classify it as verified only when stored size and an equivalent checksum match the original. Ship JSON Schema 2020-12 artifacts for manifest v1, resume v0.3, and completion v1, expose safe completion summaries, and enforce exact package producer-version alignment while preserving existing custom transports and the manifest-returning session API.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20+ with browser Web APIs

**Primary Dependencies**: Native `Blob.slice`, existing bounded SHA-256 implementation, native Web Crypto UUID support when available, and Ajv 8 as a development-only JSON Schema test dependency; no new runtime dependency

**Storage**: Versioned JSON-compatible manifest, resume, and completion records; application-provided `ResumeStore`; packaged JSON Schema files

**Testing**: Vitest unit and fake-transport suites, Ajv schema fixture checks, package-consumption checks, credential-free reference integration

**Target Platform**: Modern browsers and Node.js 20+ through current ESM and CommonJS entrypoints

**Project Type**: Published TypeScript library

**Performance Goals**: Content verification remains linear in source bytes with bounded memory; completion evidence generation remains linear in receipt count; matching resume retransmits zero acknowledged bytes

**Constraints**: Preserve original bytes; no provider logic in core; no new runtime dependency; keep `start()` and `resume()` manifest return types source-compatible; do not expose sensitive evidence fields in safe diagnostics; reject persistent resume when trustworthy content identity is unavailable

**Scale/Scope**: One minor release touching core types, checksum/resume/session/evidence logic, official transport completion adapters, React state, schemas, focused tests, package metadata, and release documentation

## Constitution Check

*GATE: Passed before research and re-checked after design.*

- Original preservation: PASS. The design only reads bounded source slices for identity and never decodes or rewrites the original. Completion evidence is a separate artifact, not a derivative or source replacement.
- Recoverability: PASS. Resume v0.3 records bind progress to content identity, unsafe legacy progress is rejected before transport access, and completion truth remains explicitly observable.
- Adapter boundaries: PASS. Core accepts normalized completion facts and performs provider-neutral classification. S3, tus, NAS, and custom verification remain adapter- or application-owned.
- TypeScript contracts: PASS. New exported types, typed errors, versioned resume/completion artifacts, JSON Schemas, legacy fixtures, and compatibility tests are required. Existing manifest-returning methods remain intact.
- Validation and security: PASS. Untrusted records and completion details are validated before use. Safe summaries omit checksum values, storage locations, upload identifiers, filenames, metadata, and opaque provider data.
- Documentation and tests: PASS. The design requires adversarial resume tests, completion classification tests, schema fixtures, diagnostics tests, package checks, README/migration examples, and full release gates.

Post-design re-check: PASS. No design artifact weakens original preservation, recovery, adapter neutrality, versioning, or safe-data requirements.

## Project Structure

### Documentation (this feature)

```text
specs/011-evidence-grade-ingest-integrity/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- evidence-integrity-contracts.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/
|-- checksum.ts
|-- completion-evidence.ts
|-- core.ts
|-- diagnostics.ts
|-- manifest.ts
|-- react-controller.ts
|-- resume.ts
|-- s3.ts
|-- session.ts
|-- tus.ts
|-- types.ts
`-- version.ts

schemas/
|-- completion.v1.schema.json
|-- manifest.v1.schema.json
`-- resume.v0.3.schema.json

tests/
|-- completion-evidence.test.ts
|-- diagnostics.test.ts
|-- manifest.test.ts
|-- package-exports.test.ts
|-- react-controller.test.ts
|-- resume.test.ts
|-- schema-contracts.test.ts
|-- session-resume.test.ts
|-- session.test.ts
|-- s3.test.ts
`-- tus.test.ts

scripts/
`-- verify-version-sync.cjs

README.md
CHANGELOG.md
docs/quickstart.md
docs/roadmap.md
package.json
package-lock.json
```

**Structure Decision**: Keep the existing single-package and subpath-export layout. Add one focused core evidence module and packaged schema directory. Do not create scoped packages, a monorepo, a persistence service, or a provider-specific verification framework for this feature.

## Complexity Tracking

No constitution violations require justification.
