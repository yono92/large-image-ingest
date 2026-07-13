# Implementation Plan: TIFF And BigTIFF Metadata Probe

**Branch**: `agent/sdk-1-3-0` | **Date**: 2026-07-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-tiff-metadata-probe/spec.md`

## Summary

Add an optional `large-image-ingest/tiff` subpath backed by GeoTIFF.js for directory metadata parsing. Validate TIFF/BigTIFF headers and walk only bounded IFD links with small `Blob.slice` reads before asking the parser for normalized directory metadata. Expose typed errors and a helper that maps one directory to the existing image metadata input without raster decoding.

## Technical Context

**Language/Version**: TypeScript 5.x; Node.js 20+ and browser runtimes with Blob, DataView, BigInt, and AbortSignal

**Primary Dependencies**: GeoTIFF.js 3.x as an optional peer dependency isolated to the TIFF subpath

**Storage**: N/A; metadata remains in memory and the source Blob is caller-owned

**Testing**: Vitest with synthetic classic TIFF and BigTIFF byte fixtures plus parser-backed metadata tests

**Target Platform**: Modern browsers and Node-compatible Blob runtimes

**Project Type**: Published TypeScript library with optional package subpath

**Performance Goals**: Header and IFD preflight uses bounded small slices; per-directory metadata extraction is linear in the accepted directory count; no raster reads

**Constraints**: No pixel decode, whole-file application buffer, source mutation, hidden parser import from other entrypoints, or manifest schema change

**Scale/Scope**: Up to 256 directories by default with caller-configurable lower or higher positive bounds; classic TIFF and parser-supported BigTIFF metadata

## Constitution Check

*GATE: Passed before research and rechecked after design.*

- Original preservation: PASS. Only sliced reads occur; no decode, render, resize, or write operation exists.
- Recoverability: PASS. Not an upload state feature; errors and cancellation are explicit and typed.
- Adapter boundaries: PASS. GeoTIFF.js is isolated to `large-image-ingest/tiff` and optional for all other consumers.
- TypeScript contracts: PASS. File, directory, policy, error, and conversion types are exported from the TIFF subpath.
- Validation and security: PASS. Binary header validation, safe-integer offset checks, directory bounds, cancellation, and sanitized errors cover untrusted inputs.
- Documentation and tests: PASS. TIFF variants, malformed input, bounds, cancellation, no-raster behavior, manifest conversion, and package isolation receive focused tests.

## Project Structure

```text
src/
`-- tiff.ts

tests/
|-- tiff-fixtures.ts
|-- tiff.test.ts
`-- package-exports.test.ts

specs/008-tiff-metadata-probe/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/tiff-metadata-contracts.md
|-- checklists/requirements.md
`-- tasks.md
```

**Structure Decision**: Keep metadata probing in an optional TIFF subpath for the single 1.3.0 package. GeoTIFF.js performs established tag parsing; a narrow internal IFD-link preflight exists only to enforce traversal bounds before parser enumeration.

## Complexity Tracking

No constitution violations require justification.
