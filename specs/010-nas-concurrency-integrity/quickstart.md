# Quickstart: Validate NAS Concurrency Integrity

## Prerequisites

- Node.js 20 or newer.
- Dependencies installed with `npm ci`.
- No cloud credentials or external NAS service is required; tests use generated temporary directories.

## Focused validation

```bash
npm test -- tests/nas.test.ts
```

Expected outcomes:

- 16 concurrent distinct chunks remain recorded and finalize to the expected bytes.
- Two gateway instances sharing one staging root do not lose progress.
- Same-index replacement keeps bytes and metadata consistent.
- Stage-versus-finalize and stage-versus-cancel races end in valid states.
- Failed metadata promotion preserves the previous committed state.
- Successful and recovery paths leave no abandoned metadata candidates.

Run the full 100-iteration filesystem stress criterion on POSIX shells with:

```bash
LII_NAS_CONCURRENCY_RUNS=100 npm test -- tests/nas.test.ts
```

The default focused suite uses 10 iterations to keep normal CI bounded.

## Compatibility validation

```bash
npm run typecheck
npm run typecheck:examples
npm test
npm run build
npm run test:reference
npm pack --dry-run
```

Expected outcomes:

- Existing TypeScript consumers compile without changes.
- NAS session and lock schema fixtures remain v0.1.
- All package entrypoints load through ESM and CommonJS.
- Reference interruption, durable resume, and final checksum verification still pass.
- The package contains documentation and built entrypoints but no generated staging artifacts.

## Release validation

Confirm `package.json`, `package-lock.json`, `CHANGELOG.md`, `docs/roadmap.md`, `docs/server-operational-guide.md`, this feature specification, and package-export tests consistently identify version 1.3.1 and its compatibility boundary.
