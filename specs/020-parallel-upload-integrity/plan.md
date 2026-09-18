# Implementation Plan: Parallel Upload Integrity

**Branch**: `[020-parallel-upload-integrity]` | **Date**: 2026-09-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/020-parallel-upload-integrity/spec.md`

## Summary

Extend the existing single-source `LargeImageIngestSession` with one opt-in bounded worker pool (requested concurrency 2–16), while retaining the current sequential loop when parallel mode is absent. Parallel completions flow through a serialized acknowledgement/checkpoint commit boundary so sparse progress, receipts, events, and finalization remain authoritative despite out-of-order requests. Every parallel chunk receives a local SHA-256 evidence record; transports may require a supported negotiated algorithm and must return matching remote attestation when they advertise it. The first qualified official implementation is S3 multipart; tus and NAS continue to advertise sequential capability only.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ build/runtime support, browser Web APIs

**Primary Dependencies**: Native `Blob`, `AbortSignal`, `fetch`, existing dependency-free SHA-256 implementation; no new runtime dependency

**Storage**: Application-owned `ResumeStore`; versioned JSON-like resume records; provider-owned multipart state

**Testing**: Vitest 4.x, local fakes, credential-free S3 broker/fetch fixtures, package-consumption checks, existing benchmark harness

**Target Platform**: Modern browsers and Node.js 20+; ESM-first plus existing CommonJS-compatible subpaths

**Project Type**: TypeScript SDK/library with provider-neutral core and transport adapters

**Performance Goals**: At concurrency four, at least 2x sequential throughput on the controlled 32-chunk latency fixture; never exceed effective concurrency; zero retransmission of remotely proven chunks

**Constraints**: Preserve original bytes; bounded memory proportional to `chunkSize × effectiveConcurrency`; concurrency 2–16; default remains sequential; one completion authority; no blind retry of integrity/finalization ambiguity; no secrets in safe outputs

**Scale/Scope**: One multi-GB source, up to existing transport chunk-count limits, sparse completion across process restart, provider-neutral core plus the official S3 multipart adapter

## Constitution Check

*GATE: Passed before research and re-checked after design.*

- **Preserve originals and separate derivatives**: PASS. Chunks are exact `Blob.slice` views; no source decode, rewrite, normalization, or derivative behavior is introduced.
- **Observable and recoverable ingest state**: PASS. The design adds explicit effective concurrency, per-chunk outcome, sparse progress, ambiguity, integrity evidence, pause/cancel settlement, and v0.4 recovery identity.
- **Adapter-based, framework-agnostic core**: PASS. Scheduling and policy remain provider-neutral; S3 headers, checksum response fields, reconciliation, and multipart completion remain in `src/s3.ts` and the broker boundary.
- **Stable TypeScript contracts and versioned artifacts**: PASS. Changes are additive for ordinary sequential callers; parallel persistence uses resume v0.4 while v0.1–v0.3 readers remain deterministic.
- **Validation, verification, and sensitive data**: PASS. Admission rejects incompatible capability/policy combinations before mutation; integrity mismatches are non-transient; safe projections redact operational receipts and provider details.
- **Focused verification**: PASS. Unit, race, persistence, S3, conformance, package, and controlled throughput tests are planned without cloud credentials.

Post-design re-check: PASS. The data model keeps whole-file identity, chunk transfer evidence, and stored-object verification distinct. No complexity exception is required.

## Project Structure

### Documentation (this feature)

```text
specs/020-parallel-upload-integrity/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── requirements.md
├── contracts/
│   └── parallel-upload-contracts.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── types.ts                 # additive policies, evidence, capabilities, events, resume v0.4
├── checksum.ts              # bounded checksum calculation for exact chunk blobs
├── chunks.ts                # unchanged fixed-size source plan
├── resume.ts                # v0.4 validation, identity, compatibility, sparse evidence
├── session.ts               # bounded scheduler and serialized acknowledgement/checkpoint commit
├── s3.ts                    # qualified parallel multipart and SHA-256 part attestation
├── diagnostics.ts           # safe projections for new state/evidence
├── conformance.ts           # provider-neutral parallel/integrity scenarios
└── index.ts/core.ts         # additive exports only

tests/
├── parallel-session.test.ts
├── parallel-races.test.ts
├── parallel-resume.test.ts
├── parallel-integrity.test.ts
├── s3.test.ts
├── conformance-s3.test.ts
├── diagnostics.test.ts
├── package-exports.test.ts
└── compatibility fixtures/tests already covering sequential behavior

benchmarks/
└── parallel/                # deterministic latency-limited sequential/parallel comparison
```

**Structure Decision**: Keep the existing single-package subpath architecture. Add scheduling to the authoritative core session and S3-specific negotiation/attestation to the existing S3 adapter rather than introducing a second engine or new package.

## Design Sequence

1. Freeze current sequential, retry, pause/cancel, resume, completion, and S3 fixtures.
2. Add versioned types and pure validators for parallel policy, integrity evidence, and resume v0.4.
3. Add bounded chunk hashing and receipt normalization without changing the sequential path.
4. Replace only the parallel branch of `uploadRemainingChunks` with a fixed worker pool; serialize acknowledgement and persistence commits.
5. Add lifecycle settlement and fail-fast sibling interruption around the worker pool.
6. Qualify S3 multipart with SHA-256 composite part checksums and ordered completion receipts.
7. Add conformance, safe-output, package, and controlled throughput evidence; update documentation and roadmap only after gates pass.

## Complexity Tracking

No constitution violations or additional architectural layers are required.
