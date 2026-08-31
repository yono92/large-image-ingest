# Quickstart: Validate Official Transport Conformance

## Prerequisites

- Node.js 20+
- npm dependencies installed
- no provider credentials for the default path

## Core Verification

```bash
npm run typecheck
npm test
npm run build
npm run test:conformance
git diff --check
```

Expected:

- catalog/report contract tests pass;
- official S3 multipart, tus, and NAS representative targets pass every applicable scenario;
- capability-scoped scenarios are `unsupported` only when the corresponding capability is false;
- all three overall reports are `conformant`;
- no default test opens a connection to an external provider or writes outside test-owned temporary resources.

## Determinism Gate

```bash
npm run test:conformance -- --repeat 10 --output benchmarks/results/transport-conformance-local.json
```

Expected: all ten runs produce identical ordered `(scenarioId, status)` pairs and the same overall status for each transport category. Timing may differ and is excluded from status comparison.

## Required Scenario Evidence

For every official representative target, inspect the generated report and confirm:

- exact source identity is established before recovery mutation;
- metadata-equal altered sources produce zero remote mutation;
- acknowledged bytes are not retransmitted;
- invalid or conflicting recovery evidence cannot authorize skipping or completion;
- reconciliation records matched, missing, expired, local-ahead, remote-ahead, or unverifiable outcomes where applicable;
- transfer finalization and stored-original verification are separate facts;
- exactly one authoritative completion reaches the application;
- final byte count and whole-file SHA-256 match;
- cleanup failure does not reverse a verified completion;
- abandoned resources are counted and safely identifiable without exposing their locations.

## Safe-Output Matrix

Focused fixtures inject credentials, presigned URLs, bearer upload URLs, object keys, filesystem paths, customer metadata, full manifests, resume records, raw receipts, checksum strings, and provider exceptions at the driver boundary.

Expected: generated reports contain none of those values. Only bounded diagnostic categories, safe slug codes, booleans, counts, timestamps, runtime categories, and durations are present.

## Explicit Real-Target Qualification

Real target mutation requires both an opt-in flag and an operator driver module:

```bash
LII_CONFORMANCE_OPT_IN=1 \
LII_CONFORMANCE_DRIVER_MODULE=./private/target-driver.mjs \
npm run qualify:transport -- --output benchmarks/results/private-target-report.json
```

The driver module must export a target conforming to [contracts/conformance-api.md](contracts/conformance-api.md). It owns credentials, test namespace provisioning, provider-specific lifecycle calls, costs, and cleanup. The command must not print the module path, endpoint, bucket, object key, mount path, receipts, manifest, recovery record, or exception details.

Without both opt-in inputs, the command performs no external mutation and reports a skip/incomplete result or exits with a safe configuration error. A preflight success is never a conformance pass.

## Final Release Matrix

```bash
npm run typecheck
npm run typecheck:examples
npm run typecheck:uppy-example
npm run typecheck:inspection-ui-example
npm test
npm run test:ui
npm run build
npm run test:conformance
npm run test:reference
npm run test:browser-checksum
npm run test:integration
npm pack --dry-run
git diff --check
```

Provider integration results may remain explicit skips when no driver is configured. Those skips must never be described as verified or conformant.
