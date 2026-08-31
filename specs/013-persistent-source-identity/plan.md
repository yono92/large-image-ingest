# Implementation Plan: Persistent Source Identity and Responsive Checksum

**Branch**: `main` | **Date**: 2026-08-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/013-persistent-source-identity/spec.md`

## Summary

Harden durable resume so acknowledged source bytes are reused only after a whole-file SHA-256 identity match, add a cancelable browser Worker checksum executor without making Worker support a core or Node requirement, evolve durable records to `large-image-ingest.resume.v0.3` while retaining bounded v0.1/v0.2 readers, align manifest producer metadata with package version `1.5.0`, and normalize transport recovery capabilities conservatively. Changes remain additive at existing entrypoints and preserve the original file byte-for-byte.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+, browser Web APIs (ES2022 target)

**Primary Dependencies**: Native `Blob.slice`, `AbortController`, Web Worker, React 18/19 peer surface; no new runtime dependency

**Storage**: Application-provided `ResumeStore`; browser `WebStorageResumeStore`; provider state remains adapter-owned

**Testing**: Vitest 4, TypeScript compiler, Playwright browser harness, package-consumption smoke scripts, local reference benchmark

**Target Platform**: ESM and CJS core consumers; modern browsers for the optional ESM Worker subpath; Node.js for verification/reference utilities

**Project Type**: TypeScript-first SDK with optional transport, Node, React, React UI, TIFF, and browser subpath exports

**Performance Goals**: Bounded checksum slices; no source-size-linear application buffer; monotonic byte progress; one whole-file traversal when manifest checksum and durable identity use the same evidence; recorded 1 GiB/3 GiB evidence remains bounded

**Constraints**: Original bytes are never decoded or transformed; persistent resume is rejected before transport mutation without strong identity; callback failures are isolated; no real provider credentials in default verification

**Scale/Scope**: Empty files through multi-GiB `Blob`/`File` sources, existing v0.1/v0.2 durable records, current S3/tus/custom transport contracts, one active source per controller/UI coordinator

## Constitution Check

### Pre-Design Gate

- **Original preservation — PASS**: identity reads bounded `Blob.slice` ranges only. No decode, resize, recompression, EXIF change, normalization, or derivative generation is introduced.
- **Recoverability — PASS**: strong source identity, typed compatibility outcomes, cancellation, stale-result invalidation, checkpoint-time migration, and non-destructive legacy handling are explicit.
- **Adapter boundaries — PASS**: the reusable checksum engine and resume classifier stay in core; browser Worker construction is an optional browser subpath; transports only declare/perform their recovery modes.
- **TypeScript contracts — PASS**: source identity, executor, v0.3 record, compatibility result, and normalized recovery capability types are versioned/additive. Manifest schema remains v1.
- **Validation and security — PASS**: mismatches fail before remote work; raw digests, manifests, receipts, URLs, paths, tokens, and provider data are excluded from routine errors/events/UI.
- **Documentation and tests — PASS**: focused checksum, resume matrix, transport mutation ordering, package provenance, browser executor, controller/UI, export, reference, and integration checks are required.

No constitution violation or complexity exception is required.

## Phase 0: Research Decisions

Research is recorded in [research.md](research.md). The plan adopts these decisions:

1. Whole-file SHA-256 is the only initial strong source identity algorithm.
2. `resume.v0.3` is the new writer schema; v0.1/v0.2 remain readable and are never destructively rewritten by list/read.
3. Legacy manifest SHA-256 evidence may be reused only after validating its shape and matching the reselected source.
4. A browser Worker executor is optional and ESM-only; inline bounded execution remains the core/Node path.
5. Manifest checksum and source identity reuse one `FileChecksum` result when equivalent.
6. Missing detailed transport capabilities mean unsupported for snapshot/persistent recovery, while ordinary upload remains usable.
7. Manifest schema version and producer package version remain separate.

## Phase 1: Design

### Data Model

[data-model.md](data-model.md) defines:

- `ContentSourceIdentityV1`
- cancelable checksum execution requests and progress
- `ResumeRecordV0_3`
- legacy compatibility/migration states
- normalized transport recovery capabilities
- manifest provenance invariants

### Public Contracts

- [contracts/public-api.md](contracts/public-api.md) defines additive TypeScript APIs and package exports.
- [contracts/resume-compatibility.md](contracts/resume-compatibility.md) defines the v0.1/v0.2/v0.3 compatibility and migration matrix.

### Validation Guide

[quickstart.md](quickstart.md) records the credential-free end-to-end validation and optional large/provider scenarios.

## Implementation Phases

### Phase A — Contracts And Migration Foundation

- Add public strong identity, compatibility, executor, recovery capability, and v0.3 record types.
- Keep existing upload transport methods and optional fields source-compatible.
- Validate v0.1/v0.2/v0.3 without exposing sensitive payloads.
- Add regression fixtures before changing session behavior.

**Exit**: The version/evidence matrix is executable; metadata-equal byte mismatches are represented; an existing custom transport still typechecks and uploads normally.

### Phase B — Checksum Execution And Cancellation

- Refactor checksum orchestration around the existing incremental SHA-256 implementation.
- Add signal checks before reads, between slices, and before accepting the final result.
- Isolate/clamp progress callbacks and validate executor output.
- Add the browser ESM Worker executor/runtime and explicit inline fallback policy.
- Reuse one whole-file result for manifest checksum and persistent identity.

**Exit**: cancellation and stale completion cannot apply; Worker start/crash/fallback behavior is typed; memory remains slice-bounded; equivalent evidence traverses the source once.

### Phase C — Persistent Identity And Legacy Recovery

- Write v0.3 records with strong identity.
- Classify source, chunking, transport evidence, expiration, terminal state, and legacy evidence before `resumeSession`.
- Promote only safe v0.2/unprogressed legacy records at an authoritative checkpoint; preserve unsafe records.
- Retain v0.1 progressed S3 receipt rejection and make all insufficient-evidence paths pre-transport.

**Exit**: first/middle/final byte mutations are rejected before remote work; exact sources resume from safe records; progressed weak legacy records remain stored and return a typed result.

### Phase D — Provenance And Capability Alignment

- Set release metadata to 1.5.0 and enforce package/runtime producer version synchronization at build time.
- Export conservative capability normalization.
- Align tus, S3, reference, and examples with tested declarations.
- Verify development, ESM, CJS, and packed consumers.

**Exit**: no stale producer version; official transport declarations have behavior tests; missing optional detail does not claim recovery support.

### Phase E — Controller, UI, Examples, And Documentation

- Feed checksum cancellation/progress through the existing session/controller authority.
- Use coordinator generation and session abort signals to reject obsolete results.
- Present restart-only/incompatible recovery guidance without rendering digest/provider state.
- Use the Worker executor in the credential-free first-party browser example.
- Update README, React UI guide, roadmap, changelog, benchmark guidance, and migration documentation.

**Exit**: UI preparation/cancel behavior is authoritative and safe; headless and Uppy paths remain supported; documentation matches exports and runtime behavior.

## Project Structure

```text
src/
├── checksum.ts                    # shared bounded SHA-256 orchestration
├── browser.ts                     # public browser executor entrypoint
├── checksum-worker-runtime.ts     # ESM Worker message runtime
├── manifest.ts                    # checksum reuse and producer metadata
├── package-version.ts             # release producer constant
├── resume.ts                      # v0.3 validation/classification/migration
├── session.ts                     # pre-transport identity gate/checkpoint promotion
├── types.ts                       # additive public contracts
├── react-controller.ts            # authoritative progress/cancellation bridge
├── react-ui/                      # safe recovery presentation
├── tus.ts / s3.ts                 # official capability declarations
└── core.ts / index.ts             # public exports

tests/
├── checksum.test.ts
├── browser-checksum.test.ts
├── manifest.test.ts
├── resume.test.ts
├── session-resume.test.ts
├── react-controller.test.ts
├── react-ui-*.test.*
├── tus.test.ts / s3.test.ts
└── package-exports.test.ts

scripts/
├── verify-package-consumption.cjs
├── verify-package-version.cjs
└── verify-browser-checksum.cjs

specs/013-persistent-source-identity/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

**Structure Decision**: Extend the existing single-package, subpath-export layout. The browser runtime is isolated behind `large-image-ingest/browser`; core, Node, React, and transports do not import or require Worker globals.

## Post-Design Constitution Re-Check

- Original preservation remains byte-read-only and derivative-free.
- Resume is content-authorized and typed before transport work.
- Browser execution remains an adapter; core and Node stay Worker-independent.
- v0.3 and source identity are versioned; v0.1/v0.2 readers remain supported.
- Diagnostics and UI operate on safe summaries only.
- All required documentation and focused tests are mapped to implementation tasks.

**Result**: PASS.

## Agent Context Update

The generated updater cannot run because this Spec Kit installation contains only PowerShell scripts and `pwsh` is unavailable. No manual `AGENTS.md` change is needed: its existing rules already require original preservation, durable resume identity, adapter boundaries, additive public APIs, sensitive-data handling, and the full verification gates.

## Complexity Tracking

No constitution violations require justification.
