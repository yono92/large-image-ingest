# Quickstart: Validate Persistent Source Identity And Responsive Checksum

## Prerequisites

- Node.js 20+
- npm dependencies installed
- A browser with module Worker support for browser-path validation

No cloud/provider credentials are required for the default path.

## Core Verification

```bash
npm run typecheck
npm run typecheck:examples
npm test
npm run test:ui:unit
npm run build
npm run test:reference
npm run test:integration
npm run smoke:exports
npm run test:browser-checksum
npm pack --dry-run
git diff --check
```

Expected results:

- type, unit, UI, build, reference, export, and browser checksum gates pass;
- integration harness reports `SKIP` for provider targets whose environment variables are absent;
- package dry run contains the browser Worker runtime and declarations but no source fixtures, resume data, or credentials.

## Exact-Source Resume Matrix

Focused tests create file pairs sharing name, size, MIME type, last modified time, extension, and metadata while changing the first, middle, or final byte.

Expected:

- exact source: v0.3 resumes; trustworthy legacy evidence is resumable/upgradeable;
- changed source: typed mismatch before any `resumeSession`, chunk, upload, or completion call;
- progressed weak legacy source: typed incompatible result and original record retained;
- zero-progress weak legacy source: restart-only, never silently resumed.

## Checksum Boundary Matrix

Focused tests cover:

- empty, sub-slice, exact-slice, and non-multiple sources;
- abort before start, between slices, and after all bytes are read but before acceptance;
- repeated source replacement and late Worker completion;
- Worker start failure, crash, malformed messages, invalid progress, and explicit inline fallback;
- throwing progress and observer callbacks;
- expected checksum mismatch;
- manifest checksum disabled with persistent resume enabled;
- instrumentation proving one full traversal for shared evidence.

Expected progress is monotonic and never exceeds source size. No canceled/superseded result reaches a manifest, compatibility result, session, controller, or UI state.

## Package Provenance

The manifest tests and package-consumption script compare `manifest.library.version` with the packed package version. ESM, CJS, root, and applicable subpath imports must report the same producer release while the manifest schema remains v1.

## Large Reference Evidence

Run the bounded release gate:

```bash
npm run test:reference
```

When sufficient local disk/time is available, reproduce the documented size-linear scenarios:

```bash
npm run benchmark:local -- --size-mib 1024 --output benchmarks/results/local-1g-feature-013.json
npm run benchmark:local -- --size-mib 3072 --chunk-mib 64 --output benchmarks/results/local-3g-feature-013.json
```

These optional runs must record bounded heap/array-buffer evidence, exact identity, zero retransmitted acknowledged bytes, and stored-file verification. They are machine-specific evidence, not universal latency guarantees.

## Optional Provider Qualification

Set only the target-specific environment variables documented in `docs/integration-tests.md`, then run:

```bash
npm run test:integration
```

Real tus, S3-compatible, and NAS preflights remain opt-in. Missing credentials/endpoints are recorded as skips rather than default failures.
