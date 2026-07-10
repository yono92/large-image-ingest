# Implementation Plan: Completion Integrity

**Branch**: `agent/sdk-1-3-0` | **Date**: 2026-07-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-completion-integrity/spec.md`

## Summary

Make successful transport completion authoritative by persisting a completed resume marker before best-effort deletion and converting post-completion store failures into typed non-fatal events. Isolate caller-owned event and snapshot observer exceptions behind a single optional observer-error callback so UI or telemetry code cannot alter session state.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20+ and browser runtimes with modern Web APIs

**Primary Dependencies**: Native Web APIs; no runtime dependencies; Vitest 4.x for tests

**Storage**: Caller-provided `ResumeStore` implementations, including browser Web Storage

**Testing**: Vitest unit tests with fake transports and fault-injecting resume stores; package consumption smoke tests

**Target Platform**: Framework-agnostic browser and Node-compatible JavaScript runtimes

**Project Type**: Published TypeScript library with ESM and CommonJS outputs

**Performance Goals**: No additional file reads or transport calls; at most one completion marker write plus configured deletion per resumed session

**Constraints**: Preserve source compatibility, resume schema v0.2, manifest v1, existing import paths, original bytes, and provider-neutral core behavior

**Scale/Scope**: One upload session at a time with arbitrary chunk counts already accepted by the active transport; this patch changes only terminal reconciliation and observer isolation

## Constitution Check

*GATE: Passed before research and rechecked after design.*

- Original preservation: PASS. No file reads or mutations are added; the feature only reconciles terminal state and observers.
- Recoverability: PASS. Remote completion becomes authoritative, completed resume state is persisted before deletion, and cleanup failure is explicitly observable.
- Adapter boundaries: PASS. All behavior remains provider-neutral in core and uses the existing `ResumeStore` contract.
- TypeScript contracts: PASS. Additive event and observer-error types are exported; manifest and resume schema versions do not change.
- Validation and security: PASS. Cleanup and observer failures use typed summaries and existing diagnostic sanitization without exposing full records.
- Documentation and tests: PASS. README, changelog, roadmap, package assertions, fake-store tests, and observer-failure tests are included.

## Project Structure

### Documentation (this feature)

```text
specs/006-completion-integrity/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- completion-integrity-contracts.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/
|-- types.ts
|-- session.ts
|-- diagnostics.ts
`-- core.ts

tests/
|-- session.test.ts
|-- session-resume.test.ts
|-- diagnostics.test.ts
`-- package-exports.test.ts

package.json
package-lock.json
README.md
CHANGELOG.md
docs/roadmap.md
```

**Structure Decision**: Keep the patch in the current single package. Completion reconciliation is core session behavior; React and TIFF work remain separate features and packages.

## Complexity Tracking

No constitution violations or additional architectural layers are required.
