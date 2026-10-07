# Implementation Plan: Executable Onboarding And Adoption Validation

**Branch**: `codex/onboarding-adoption` | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)

## Summary
Two executable public-package examples, progressive introductory documentation, and explicit local adoption observations/reporting. Reuse the existing real HTTP/filesystem reference target. Keep core APIs unchanged.

## Technical Context
**Language/Version**: TypeScript SDK; ESM JavaScript examples, Node.js 20+
**Primary Dependencies**: Existing SDK/native Node APIs; no added runtime dependencies
**Storage**: Local originals and private JSON records; single owning process
**Testing**: Vitest integration tests and isolated packed consumer smoke
**Target Platform**: Node loopback; existing browser guides remain available
**Project Type**: SDK examples, documentation and maintainer tooling
**Performance Goals**: Bounded slicing/streams instead of whole-file buffering
**Constraints**: No credentials, telemetry, customer-data output or invented adoption
**Scale/Scope**: Two local onboarding journeys and local observation reports

## Constitution Check
- Original preservation: PASS; exact source transfer plus mandatory stored SHA-256 verification.
- Recovery: PASS; explicit durable client records, exact source identity, same running server.
- Adapter boundaries: PASS; persistence and transport examples outside core.
- TypeScript contracts: PASS; public imports, no SDK type or schema modifications.
- Security: PASS; generated paths, hashed IDs, private records, safe output.
- Documentation/tests: PASS; staged README, examples, focused and standard checks.
- Post-design gate: PASS; persistence is single-process; server crash recovery is not claimed.

## Project Structure
- `examples/onboarding/`: minimal-upload.mjs, verified-workflow.mjs, transport.mjs, file-stores.mjs, fixture.mjs, README.md
- `examples/reference-local/local-server.mjs`: public verifier import and trusted completed-file lookup
- `scripts/adoption-report.cjs`, `docs/adoption-observations.template.json`, `docs/adoption-validation.md`
- `tests/onboarding-examples.test.ts`, `tests/adoption-observations.test.ts`
- `scripts/verify-onboarding-package.cjs`: packed consumer verification
- README, quickstart, changelog, package scripts and ignore rules

## Implementation Strategy
Implement examples/storage, then progressive documentation and explicit adoption reporting. Validate recovery/source mismatch, stale CAS, immutable revision conflict, corrupt stored bytes, empty/duplicate observations, and packed consumer execution.

## Complexity Tracking
No exceptions. Distributed locking, hosted storage, server crash recovery and automatic participant recruitment are outside scope.
