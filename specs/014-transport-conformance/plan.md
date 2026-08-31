# Implementation Plan: Official Transport Conformance

**Branch**: `[014-transport-conformance]` | **Date**: 2026-08-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/014-transport-conformance/spec.md`

## Summary

Add a provider-neutral, versioned transport-conformance catalog and report runner that evaluates official S3 multipart, tus, and NAS paths by safety outcome rather than protocol shape. A new additive `large-image-ingest/conformance` subpath will expose stable TypeScript contracts, catalog definitions, report evaluation, safe diagnostics, and target-driver boundaries. Credential-free representative drivers will exercise the actual official adapters in release tests; real-target execution will remain an explicit repository qualification command that loads an operator-supplied driver and never infers conformance from a preflight or capability declaration alone.

## Technical Context

**Language/Version**: TypeScript 5.x targeting ES2022; Node.js 20+ for repository qualification runners

**Primary Dependencies**: Existing SDK core, S3 multipart transport, tus transport, NAS gateway, checksum/verification helpers, native Web/Node APIs; no new runtime dependency

**Storage**: In-memory and temporary-directory representative targets by default; operator-owned object storage, tus service, or mounted filesystem only through explicit opt-in drivers

**Testing**: Vitest contract/unit/integration tests, built-package consumption checks, deterministic ten-run conformance gate, opt-in target qualification script

**Target Platform**: Browser-safe transport adapters plus Node.js conformance orchestration and NAS qualification

**Project Type**: TypeScript SDK with additive package subpath and repository verification tools

**Performance Goals**: Record timing for diagnosis without provider ranking; default representative catalog completes within the existing release-test envelope and produces deterministic statuses in ten consecutive runs

**Constraints**: Original bytes never mutate; strong source identity precedes recovery mutation; stored completion requires independent size and whole-file SHA-256 verification; reports contain no secret URLs, keys, paths, receipts, manifests, or recovery records; default checks require no credentials or external services

**Scale/Scope**: One active upload session per source, three official transport categories, one catalog/report schema version, common plus capability-scoped scenarios, sequential deterministic execution for the first release

## Constitution Check

*GATE: Passed before research and re-checked after design.*

- **Original preservation — PASS**: scenarios compare source/stored bytes and checksums; no scenario transforms the source. Temporary resources are target-owned staging artifacts, not derivatives.
- **Recoverability — PASS**: interruption, acknowledgement, persistent recovery, reconciliation, cancellation, completion, and cleanup are explicit catalog scenarios with typed outcomes.
- **Adapter boundaries — PASS**: the conformance runner consumes a provider-neutral driver contract. Protocol evidence stays in official/opt-in drivers; core ingest behavior is unchanged.
- **TypeScript contracts — PASS**: catalog, target profile, capability claim, observation, result, cleanup, and report schemas are versioned and exported from an additive subpath.
- **Validation and security — PASS**: report values are bounded to safe categories/counters; arbitrary provider errors and sensitive target values are never copied. External mutation requires two-part opt-in.
- **Documentation and tests — PASS**: focused tests cover catalog evaluation, unsafe evidence, source mismatch, resume, completion, cleanup isolation, redaction, capabilities, package exports, and all official representative targets.

Post-design re-check: **PASS**. No constitution exception or complexity waiver is required.

## Architecture

### Provider-Neutral Conformance Layer

`src/conformance.ts` owns immutable v1 scenario definitions, public types, observation validation, result evaluation, report aggregation, safe failure mapping, and conformance-status calculation. It does not open sockets, inspect provider credentials, or implement S3/tus/NAS operations.

Each scenario declares:

- a stable scenario ID and version;
- whether it is common or capability-scoped;
- prerequisites and advertised capabilities that make it applicable;
- the structured observation fields needed to prove the expected safety outcome;
- deterministic pass/fail/unsupported rules.

### Target Drivers

A `TransportConformanceTarget` describes one safe target profile and executes isolated catalog scenarios through the official SDK path. Drivers return structured counters and booleans, never raw receipts, locations, manifests, records, or provider error text. The runner validates every observation before evaluating it.

Credential-free representative drivers live in the test/reference harness and use:

- the public S3 multipart adapter with a test-owned in-memory broker and fetch boundary;
- the public tus adapter with a deterministic test-owned HTTP protocol model;
- the public NAS gateway with isolated operating-system temporary roots.

Real-target qualification uses the same target interface through an operator-supplied module. The repository runner requires both an explicit opt-in flag and a module path, writes a versioned report, and leaves credential loading and resource provisioning to the driver.

### Result Authority

Scenario status is runner-owned:

- `passed`: the observation satisfies every required invariant;
- `failed`: the scenario ran but one or more required invariants did not hold;
- `unsupported`: the target explicitly does not advertise the capability and the catalog permits non-applicability;
- `skipped`: prerequisites or operator configuration prevented execution.

Overall status is `conformant` only when every applicable scenario passes and all non-applicable cases are legitimate `unsupported` results. Any failure yields `non_conformant`; any skip without failure yields `incomplete`. Static capability metadata alone can never create a passing result.

## Project Structure

### Documentation (this feature)

```text
specs/014-transport-conformance/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── conformance-api.md
│   └── qualification-report.schema.json
├── checklists/requirements.md
├── spec.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── conformance.ts                 # catalog, contracts, evaluator, report aggregation
├── s3.ts                          # existing official S3 path; only evidence fixes if tests expose gaps
├── tus.ts                         # existing official tus path; only evidence fixes if tests expose gaps
├── nas.ts                         # existing official NAS path; only evidence fixes if tests expose gaps
└── package-version.ts             # report producer version

tests/
├── conformance.test.ts            # catalog/evaluator/report/security contract tests
├── conformance-fixtures.ts        # safe observations and representative target helpers
├── conformance-s3.test.ts         # official S3 representative scenarios
├── conformance-tus.test.ts        # official tus representative scenarios
├── conformance-nas.test.ts        # official NAS representative scenarios
├── integration-harness.test.ts    # opt-in and report behavior
└── package-exports.test.ts         # conformance subpath consumption

scripts/
├── run-conformance.cjs            # credential-free and opt-in qualification entrypoint
├── run-integration-tests.cjs      # delegates enabled target qualification; no preflight-as-proof
└── verify-package-consumption.cjs # export/report producer verification

docs/
├── transport-conformance.md
├── integration-tests.md
└── roadmap.md
```

**Structure Decision**: Keep the existing single package and add one focused subpath. This preserves adapter boundaries without introducing scoped packages or provider SDK dependencies.

## Implementation Phases

### Phase 1 — Versioned Contracts And Catalog

Create the public catalog/report types, stable scenario IDs, safe bounded observations, deterministic evaluation rules, overall-status reducer, and JSON schema. Add the export without changing existing root/core/transport contracts.

### Phase 2 — Credential-Free Official Evidence

Build deterministic representative target drivers around the actual S3, tus, and NAS implementations. Run every applicable common scenario, verify source-mismatch ordering, zero acknowledged retransmission, malformed evidence rejection, reconciliation, exactly one authoritative completion, stored-original SHA-256, and cleanup isolation.

### Phase 3 — Capability And Report Integrity

Cross-check official capability declarations against passing scenario IDs. Reject reports with unproven positive claims, invalid observations, duplicate scenario IDs, missing required fields, sensitive-shaped values, or incomplete scenario coverage.

### Phase 4 — Explicit Real-Target Qualification

Replace preflight-only integration claims with a driver-module qualification boundary. Default execution remains all-skip and mutation-free. Opt-in execution creates a report with pass/fail/skip/unsupported distinctions and cleanup status; any incomplete run is never conformant.

### Phase 5 — Documentation And Release Gates

Publish the shared invariants, protocol-specific evidence table, report interpretation, driver contract, limitations, and commands. Add the deterministic ten-run credential-free gate to prepublish verification and retain one reviewed report summary.

## Compatibility Strategy

- Add `large-image-ingest/conformance`; do not remove or alter existing package subpaths.
- Keep `UploadTransport` and existing custom transports source-compatible.
- Do not add a `conformant` flag to transport capabilities; conformance exists only in a generated evidence report.
- Keep the manifest and resume schema versions unchanged.
- Use the shared additive 1.6.0 release baseline for features 014–018 and synchronize embedded producer metadata when the release version changes.

## Verification Strategy

1. Contract tests reject invalid reports, duplicate/missing scenarios, unsafe arbitrary values, fabricated capability evidence, and false completion.
2. Official target tests exercise actual S3/tus/NAS paths with common fixtures and target-specific evidence.
3. Ten consecutive representative runs produce identical scenario and overall statuses.
4. Package checks consume ESM/CJS declarations from the new subpath.
5. Default integration execution performs no external mutation; explicit target drivers must opt in.
6. Final gates: typecheck, examples, unit/UI tests, build, conformance, reference, integration skips, browser checksum, package dry run, and diff check.

## Complexity Tracking

No constitution violations. A separate provider-neutral driver/evaluator is the smallest design that can compare three incompatible protocol evidence models without moving provider logic into core or equating ETags/offsets/filesystem records.
