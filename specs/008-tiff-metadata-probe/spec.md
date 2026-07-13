# Feature Specification: TIFF And BigTIFF Metadata Probe

**Feature Branch**: `agent/sdk-1-3-0`

**Created**: 2026-07-10

**Status**: Implemented

**Input**: User description: "Add TIFF and BigTIFF metadata probing in the same 1.3.0 release so inspection-image UI can understand files without decoding or transforming them."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect TIFF Structure Without Pixel Decode (Priority: P1)

As an application developer, I can inspect a TIFF or BigTIFF file and obtain dimensions, bit depth, samples, compression, orientation, tiling, and directory count without decoding image pixels or loading the whole file into memory.

**Why this priority**: Browser and server workflows need reliable metadata for validation, preview planning, and UI before expensive processing of multi-gigabyte inspection images.

**Independent Test**: Probe representative little-endian, big-endian, TIFF, BigTIFF, tiled, stripped, and multi-directory fixtures and verify metadata while proving no raster-read operation is invoked.

**Acceptance Scenarios**:

1. **Given** a valid classic TIFF, **When** it is probed, **Then** the result identifies classic TIFF and returns normalized metadata for each requested directory.
2. **Given** a valid BigTIFF, **When** it is probed, **Then** the result identifies BigTIFF and safely returns supported directory metadata.
3. **Given** a tiled image, **When** it is probed, **Then** tile dimensions and tiled layout are reported without reading tile payloads.

---

### User Story 2 - Reject Unsafe Or Unsupported Inputs (Priority: P1)

As an application developer, I receive typed bounded failures for non-TIFF, malformed, excessively deep, unsupported, or canceled probes.

**Why this priority**: Uploaded files and metadata are untrusted, and malformed directory graphs must not cause unbounded reads, memory use, or opaque parser errors.

**Independent Test**: Probe invalid headers, truncated directories, directory counts above the configured limit, and an aborted operation, then verify typed failures with no original content in error messages.

**Acceptance Scenarios**:

1. **Given** a non-TIFF or truncated header, **When** probing begins, **Then** it fails before parser traversal with a typed header error.
2. **Given** more directories than allowed, **When** probing begins, **Then** it stops at the configured bound with a typed limit error.
3. **Given** an aborted signal, **When** probing starts or advances, **Then** it stops without raster decoding and reports cancellation.

---

### User Story 3 - Feed Existing Validation And UI (Priority: P2)

As an application developer, I can convert one probed directory into the existing image metadata input and show safe structural facts in UI without manually translating TIFF tag values.

**Why this priority**: The probe should connect to existing manifest validation and future preview/viewer work rather than create an isolated metadata model.

**Independent Test**: Convert a probed primary directory to the existing image metadata input and create a manifest whose width, height, format, and color depth match the probe while directory and sample details remain available in the probe result.

**Acceptance Scenarios**:

1. **Given** a successful probe, **When** a directory is selected, **Then** a helper returns compatible image metadata without mutating the probe result.
2. **Given** an invalid directory index, **When** conversion is requested, **Then** it fails with a typed metadata error.

### Edge Cases

- Little-endian and big-endian headers.
- Classic TIFF magic 42 and BigTIFF magic 43.
- Multiple directories with different dimensions or bit depths.
- Missing optional compression, orientation, sample, tile, or strip tags.
- Very large 64-bit BigTIFF offsets that cannot be represented safely.
- Zero dimensions, invalid bit depth arrays, and malformed tag types.
- Abort before header read and between directory reads.
- Files whose MIME type or extension disagrees with their binary header.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The probe MUST validate byte order and TIFF or BigTIFF magic from binary content rather than trusting MIME type or extension.
- **FR-002**: The probe MUST expose format, byte order, directory count, and normalized per-directory structural metadata.
- **FR-003**: Per-directory metadata MUST include dimensions and SHOULD include available bit depth, samples, compression, photometric interpretation, orientation, planar layout, tile size, and strip size.
- **FR-004**: The probe MUST NOT decode raster pixels, render images, resize, compress, tile, or mutate the original file.
- **FR-005**: File access MUST use slicing or parser range access and MUST NOT require loading the entire source file into one application-owned buffer.
- **FR-006**: The number of inspected directories MUST be bounded by a configurable positive limit with a conservative default.
- **FR-007**: Invalid headers, malformed metadata, unsafe integer values, parser limitations, directory limits, and cancellation MUST use typed probe errors.
- **FR-008**: Error messages and safe diagnostics MUST NOT include source bytes, full parser structures, customer metadata, or storage secrets.
- **FR-009**: The probe MUST accept an optional cancellation signal and check it before and during directory traversal.
- **FR-010**: A conversion helper MUST map one valid probed directory to the existing image metadata input without mutating either value.
- **FR-011**: The TIFF parser dependency MUST remain isolated to an optional TIFF-specific package subpath and MUST NOT load from root, core, transport, Node, or React entrypoints.
- **FR-012**: Documentation MUST state supported metadata, BigTIFF limitations inherited from the parser, and the absence of pixel decoding or rendering.

### Key Entities

- **TIFF Probe Result**: Normalized file-level format, byte order, directory count, and bounded directory metadata.
- **TIFF Directory Metadata**: Safe structural facts for one image file directory.
- **TIFF Probe Policy**: Directory bound and cancellation configuration.
- **TIFF Probe Error**: Typed failure that preserves safe operational context without source data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All supported TIFF and BigTIFF fixtures produce correct format, byte order, dimensions, and layout metadata without raster reads.
- **SC-002**: 100% of invalid, truncated, over-limit, unsafe-integer, and aborted fixtures fail with a documented typed code.
- **SC-003**: Probe traversal reads no more directories than the configured maximum and performs no application-owned whole-file buffer allocation.
- **SC-004**: Converted image metadata creates an existing manifest with matching structural fields in focused tests.
- **SC-005**: Existing non-TIFF entrypoints, type checks, tests, builds, and package smoke tests remain compatible.

## Assumptions

- GeoTIFF.js is used as a proven optional parser and its documented limited BigTIFF support is surfaced rather than hidden.
- The first release probes metadata only; raster decoding, thumbnail generation, tile generation, and image viewing remain separate features.
- Directory order is preserved; the SDK does not infer semantic page, pyramid, channel, or time-series roles in this feature.
