# Feature Specification: API Reference And Module Size

**Status**: Implemented
**Created**: 2026-11-19

## Requirements

- **FR-001**: An API reference covering every package import path MUST be generated from the source and published to GitHub Pages from `main`.
- **FR-002**: Every source module MUST be at or under 500 lines; CI reports any file above that as a warning.
- **FR-003**: Splitting modules MUST NOT change any export name or type of any package entry point.
- **FR-004**: Browser chunk-hashing speed MUST be measured and recorded.

## Decisions

- TypeDoc 0.28 depends on minimatch 10, which has a moderate advisory fixed only in minimatch 11; TypeDoc does not run with minimatch 11. TypeDoc is a development-only tool reading this repository's own configuration, and the release gate audits runtime dependencies only, so it is accepted like the earlier `picomatch` advisory.
- Modules were split into contiguous parts by a compiler-based script: public names stay exported from the original module path, private helpers shared between parts move to internal `*-shared.ts` modules, and the verified-workflow class moved to `workflow-runtime.ts` with its stage methods in `workflow-start.ts`, `workflow-upload.ts` and `workflow-evidence.ts`.

## Success Criteria

- `npm run docs:api` generates the reference without warnings.
- The export list with resolved types of all 14 entry declarations (700 exports) is identical before and after.
- All tests pass; `scripts/check-source-lines.cts` reports 0 files above 500 lines.
