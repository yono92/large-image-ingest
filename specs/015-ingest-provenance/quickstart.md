# Quickstart: Auditable Ingest Provenance

## Core Verification

```bash
npm run typecheck
npx vitest run tests/provenance.test.ts tests/provenance-lifecycle.test.ts tests/provenance-integrity.test.ts tests/provenance-security.test.ts
npm run typecheck:examples
npm run build
git diff --check
```

Expected: all six terminal states are unambiguous, equal/regressing timestamps do not affect sequence, every authoritative mutation breaks integrity, cross-artifact mismatches are typed, and safe summaries contain no forbidden values.

## Lifecycle Composition

Create one recorder after the manifest exists, forward existing events, add explicit stored verification and derivative results, then seal. The recorder is not installed implicitly and never replaces upload or verification authority.

## Persistence Failure

Run the sink-failure fixture after a completed and verified artifact. Expected: persistence returns `provenance.persistence_failed`, raw sink details are absent, and the artifact remains `completed` with valid integrity.

## Final Matrix

```bash
npm run typecheck
npm run typecheck:examples
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
