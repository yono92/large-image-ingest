# Implementation Plan: Reference Integration And Benchmarks

**Branch**: `agent/sdk-1-3-0` | **Date**: 2026-07-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/009-reference-integration-benchmarks/spec.md`

## Summary

Add a native Node reference harness outside the published package that generates a deterministic file, exposes a temporary HTTP chunk target, forces an interrupted upload, persists resume state to disk, resumes with a replacement session, and verifies the stored file against the manifest. Record versioned JSON evidence and package a concise methodology and result report in `docs/benchmarks.md`. Add a small credential-free run to CI and publish verification.

## Technical Context

**Language/Version**: JavaScript on Node.js 20+ for the harness; existing TypeScript 5.x library

**Primary Dependencies**: Native Node HTTP, filesystem, crypto, performance, and OS APIs; built `large-image-ingest` package entrypoints

**Storage**: Generated temporary files plus an explicit JSON result artifact

**Testing**: Existing Vitest suite plus a 64 MiB end-to-end reference verification command

**Target Platform**: Local and CI Node.js environments; external provider checks remain opt-in

**Project Type**: Published TypeScript library with repository-only validation tooling

**Performance Goals**: Support caller-selected GiB-scale fixtures; process data in bounded chunks; measure rather than assume throughput and memory behavior

**Constraints**: No external credentials, no source mutation, no whole-file application buffer, no new public runtime API, no benchmark fixture in npm tarball

**Scale/Scope**: 64 MiB CI run, at least 1 GiB recorded local run, configurable larger runs

## Constitution Check

*GATE: Passed before implementation.*

- Original preservation: PASS. Source bytes are generated once, read by slices, and verified unchanged at the target.
- Recoverability: PASS. Failure, durable checkpoint, replacement session, resume, and cleanup are explicit measured outcomes.
- Adapter boundaries: PASS. The reference transport and server stay outside `src/` and the npm tarball.
- TypeScript contracts: PASS. No public contract changes are required; the built public entrypoints are consumed as an adopter would consume them.
- Validation and security: PASS. The workflow is local, credential-free, path-isolated, redacted, and self-cleaning.
- Documentation and tests: PASS. CI, prepublish verification, raw JSON evidence, packaged methodology, and README summary cover the change.

## Project Structure

```text
benchmarks/
|-- README.md
|-- run-local.cjs
|-- reference-server.cjs
`-- results/
    `-- 2026-07-local-1g.json

docs/
`-- benchmarks.md

specs/009-reference-integration-benchmarks/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/benchmark-result.schema.json
|-- checklists/requirements.md
`-- tasks.md
```

**Structure Decision**: Keep executable validation outside `files` in package metadata while packaging `docs/benchmarks.md` and README evidence. The harness imports `dist` outputs so export and runtime packaging problems are exercised.

## Complexity Tracking

No constitution violations require justification.
