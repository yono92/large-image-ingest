# Tasks: TIFF And BigTIFF Metadata Probe

**Input**: Design documents from `/specs/008-tiff-metadata-probe/`
**Tests**: Synthetic binary fixtures and parser-backed metadata tests are required because input is untrusted binary structure.

## Phase 1: Setup

- [x] T001 Add GeoTIFF.js optional peer and development dependency in package.json and package-lock.json
- [x] T002 Add the large-image-ingest/tiff ESM, CommonJS, and declaration export in package.json
- [x] T003 [P] Add TIFF metadata probe release notes and roadmap tracking in CHANGELOG.md and docs/roadmap.md

## Phase 2: Foundational Binary Contracts

- [x] T004 Add TIFF probe result, directory, policy, and typed error contracts in src/tiff.ts
- [x] T005 [P] Add classic TIFF, BigTIFF, endian, tiled, stripped, multi-IFD, and malformed builders in tests/tiff-fixtures.ts
- [x] T006 Add header detection and safe bounded IFD-link traversal tests in tests/tiff.test.ts
- [x] T007 Implement binary header validation and bounded TIFF/BigTIFF IFD-link preflight in src/tiff.ts

## Phase 3: User Story 1 - Inspect Structure Without Pixel Decode (Priority: P1)

**Independent Test**: Supported fixtures return normalized directory metadata and never invoke raster-reading APIs.

- [x] T008 [US1] Add normalized classic, BigTIFF, tiled, stripped, and multi-directory metadata cases in tests/tiff.test.ts
- [x] T009 [US1] Implement parser-backed directory metadata extraction in src/tiff.ts
- [x] T010 [US1] Validate dimensions, samples, bit depths, layout, and numeric tag values in src/tiff.ts

## Phase 4: User Story 2 - Reject Unsafe Inputs (Priority: P1)

**Independent Test**: Invalid, truncated, over-limit, unsafe-offset, parser-failure, and aborted inputs return documented typed codes.

- [x] T011 [US2] Add invalid header, truncation, limit, unsafe offset, parser failure, and abort tests in tests/tiff.test.ts
- [x] T012 [US2] Implement typed error wrapping and cancellation checks in src/tiff.ts

## Phase 5: User Story 3 - Feed Validation And UI (Priority: P2)

**Independent Test**: A selected directory maps to existing image metadata and creates a matching manifest without mutating probe results.

- [x] T013 [US3] Add image metadata conversion, invalid index, immutability, and manifest integration tests in tests/tiff.test.ts
- [x] T014 [US3] Implement toTiffImageMetadata in src/tiff.ts

## Phase 6: Documentation And Verification

- [x] T015 [P] Document install, supported metadata, BigTIFF limits, and metadata-only scope in README.md and docs/quickstart.md
- [x] T016 [P] Extend TIFF export, optional peer, ESM/CJS, and root isolation assertions in tests/package-exports.test.ts and scripts/verify-package-consumption.cjs
- [x] T017 Run focused TIFF tests and reconcile implementation against specs/008-tiff-metadata-probe artifacts
- [x] T018 Mark all 1.3.0 feature roadmap and release documentation complete only after final combined verification

## Dependencies And Execution Order

- Setup precedes parser imports and package compilation.
- Binary contracts and bounded preflight precede parser metadata extraction.
- Safe input rejection and metadata normalization share the preflight but remain independently testable.
- Manifest conversion depends on normalized directory metadata.
- Documentation and package checks follow final public names.

## Parallel Opportunities

- T003 and T005 can proceed independently from source contracts.
- T015 and T016 can run in parallel after implementation.

## Implementation Strategy

1. Enforce binary and traversal safety before parser use.
2. Normalize only stable structural facts and preserve unknown numeric codes.
3. Prove no raster reads occur.
4. Connect one directory to existing validation without changing manifest v1.
