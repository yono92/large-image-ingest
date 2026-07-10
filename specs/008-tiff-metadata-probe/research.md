# Research: TIFF And BigTIFF Metadata Probe

## Decision: Use GeoTIFF.js As An Optional Peer

**Decision**: Use GeoTIFF.js 3.x for TIFF directory and tag parsing, exposed only from `large-image-ingest/tiff`.

**Rationale**: TIFF and BigTIFF field types, deferred values, byte order, offsets, and compression metadata are established parsing concerns. The library supports browser Blob sources, Node, CommonJS/ESM exports, and limited BigTIFF parsing.

**Alternatives considered**:

- Implement all TIFF tag parsing locally: rejected because it duplicates a mature parser and expands security risk.
- Make GeoTIFF.js a root runtime dependency: rejected because most ingest consumers do not need TIFF parsing and its dependency tree is substantial.
- Use a decoder/renderer dependency: rejected because this feature reads metadata only.

## Decision: Add A Bounded IFD-Link Preflight

**Decision**: Parse only the header, entry count, and next-IFD pointer with small slices before directory metadata extraction.

**Rationale**: GeoTIFF.js `getImageCount` enumerates until the chain ends and does not accept a directory limit. The preflight enforces a caller-owned bound, validates safe offsets, and then calls the proven parser only for accepted directories.

**Alternatives considered**:

- Call `getImageCount` first: rejected because an untrusted chain could force unbounded directory traversal.
- Catch parser out-of-range errors while incrementing indexes: rejected because it depends on an internal error shape and still needs a hard upper bound.

## Decision: Expose Numeric TIFF Tag Codes

**Decision**: Return available compression, photometric interpretation, orientation, planar configuration, and sample format values as TIFF numeric codes.

**Rationale**: Numeric tag values are stable, preserve unknown vendor extensions, and avoid incomplete friendly-name mappings. UI can map known values independently.

**Alternatives considered**:

- Return only friendly strings: rejected because unknown values would be lossy.
- Return the full parser directory: rejected because it leaks parser-specific and potentially large structures.

## Decision: Map Only Existing Manifest Fields

**Decision**: Convert width, height, `tiff` format, and maximum bits per sample to `ImageMetadataInput`. Keep directory count and samples in the probe result.

**Rationale**: Manifest v1 has no page-count or channel fields. Expanding the manifest is separate schema work and is not required for metadata-driven validation.

**Alternatives considered**:

- Add page and channel fields to manifest v1: rejected because it broadens a probe feature into manifest evolution.

## Decision: Surface BigTIFF Limits

**Decision**: Identify BigTIFF from binary magic, reject unsafe 64-bit offsets, and wrap parser failures with a typed unsupported or malformed error while documenting upstream limited support.

**Rationale**: JavaScript cannot safely represent every 64-bit TIFF offset as a number, and the selected parser explicitly documents limited BigTIFF support.
