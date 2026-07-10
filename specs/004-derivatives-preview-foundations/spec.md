# Feature Specification: 1.1.0 Derivatives And Preview Foundations

**Feature Branch**: `004-derivatives-preview-foundations`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "Proceed with the next minor release planning for 1.1.0 Derivatives And Preview Foundations from the roadmap TODOs."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Model Derivatives Separately (Priority: P1)

As an application developer, I can attach preview, thumbnail, tile, metadata, and custom derivative references to an ingest manifest without changing the original file identity, original preservation policy, or original checksum information.

**Why this priority**: Separate derivative modeling is the release's core value and directly protects the source-of-truth inspection artifact.

**Independent Test**: Can be tested by creating a manifest for an original image, attaching derivative references, and verifying that original identity fields remain unchanged while derivatives are listed separately.

**Acceptance Scenarios**:

1. **Given** a manifest with original identity and preservation data, **When** a preview derivative is attached, **Then** the preview appears as a derivative and the original identity, checksum, size, media type, and preservation policy are unchanged.
2. **Given** multiple derivatives for the same original, **When** each derivative is attached, **Then** each entry has its own identity, kind, status, relationship to the original, and storage reference when available.
3. **Given** an invalid derivative reference with no traceable source relationship, **When** derivative validation runs, **Then** the result reports a typed issue without modifying the original manifest.

---

### User Story 2 - Reference Browser-Safe Previews (Priority: P2)

As a browser application developer, I can describe preview and thumbnail outputs for very large images without requiring the SDK to load, decode, or rewrite the entire original file by default.

**Why this priority**: Large inspection images can exceed practical browser memory limits, so the foundation must support preview references without unsafe default processing.

**Independent Test**: Can be tested with synthetic large-file objects and caller-provided preview descriptors, verifying that the resulting derivative references contain metadata and storage references but no embedded original or derivative bytes.

**Acceptance Scenarios**:

1. **Given** a large original file and a caller-provided preview asset reference, **When** a preview descriptor is recorded, **Then** the derivative entry stores preview metadata and a reference instead of embedding image bytes.
2. **Given** no preview asset has been generated yet, **When** a planned preview is recorded, **Then** the manifest can represent that planned derivative without claiming it exists.
3. **Given** a preview generation failure, **When** the failure is recorded, **Then** the original manifest remains valid and the derivative status captures the failure.

---

### User Story 3 - Enrich Image Metadata Safely (Priority: P3)

As a server-side pipeline maintainer, I can record image metadata extracted outside the core ingest path, such as dimensions, format, color depth, or tile pyramid information, while keeping extracted metadata traceable as derivative or enrichment data.

**Why this priority**: Many inspection formats need specialized readers, and metadata enrichment should not be guessed or forced into the core ingest path.

**Independent Test**: Can be tested by attaching metadata enrichment entries that reference the original and verifying validation of required fields, provenance, and stale or mismatched source relationships.

**Acceptance Scenarios**:

1. **Given** metadata extracted after upload, **When** the metadata enrichment is attached, **Then** the manifest records the metadata, extraction status, source relationship, and provenance without changing original bytes.
2. **Given** metadata derived from a different original, **When** validation runs, **Then** the mismatch is reported as an issue.
3. **Given** tile pyramid metadata, **When** it is recorded, **Then** levels, dimensions, tile sizing, and storage references are represented as derivative metadata rather than replacing the original image entry.

---

### User Story 4 - Preserve Adapter Boundaries (Priority: P4)

As a maintainer, I can plan preview, thumbnail, tile, and metadata helper boundaries without moving image processing, user interface behavior, cloud storage behavior, or framework-specific behavior into the core ingest contract.

**Why this priority**: The project can grow toward companion helpers while keeping the core package small, provider-neutral, and safe for large files.

**Independent Test**: Can be tested by reviewing the public contract draft and release tasks to verify that core responsibilities are limited to references, validation, manifest attachment, and state representation.

**Acceptance Scenarios**:

1. **Given** a planned derivative helper, **When** its responsibilities are described, **Then** image processing and storage upload remain caller-owned or adapter-owned.
2. **Given** future user interface bindings, **When** the 1.1.0 scope is reviewed, **Then** those bindings remain out of scope except for compatibility notes.

### Edge Cases

- A derivative can be planned before it is created, created after upload, or marked failed without invalidating the original manifest.
- A derivative reference may become stale if it was generated from a different original, a different checksum, or an older original version.
- Multiple previews or thumbnails may exist for the same original at different sizes, formats, quality levels, or storage locations.
- Tile pyramid metadata may describe many levels and storage references without embedding tile bytes in the manifest.
- Filenames, labels, storage hints, metadata, and generator-provided provenance are untrusted input and must not become executable paths or sensitive logs.
- A missing optional derivative must not fail the original ingest path; a missing required derivative must be reported separately and explicitly.
- Preview generation must not imply that browsers can write directly to NAS, SMB, NFS, or local server filesystems.
- Metadata extraction must not strip EXIF, normalize, recompress, or otherwise rewrite the source artifact.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The SDK MUST preserve original file identity, size, media type, checksum, and preservation policy when derivatives are added, updated, planned, or marked failed.
- **FR-002**: The SDK MUST model every preview, thumbnail, tile, metadata extraction, or custom output as a derivative entry with its own identity and traceable relationship to the original.
- **FR-003**: Derivative entries MUST capture derivative kind, lifecycle status, relationship to the original, media information when known, storage reference when available, creation timing when known, and provenance when provided.
- **FR-004**: Derivative validation MUST report typed issues for missing identity, unsupported kind, invalid lifecycle status, missing or mismatched source relationship, unsafe storage references, and stale source identity.
- **FR-005**: The SDK MUST support planned derivatives so applications can reserve expected previews, thumbnails, tiles, or metadata extracts before the derivative asset exists.
- **FR-006**: The SDK MUST support created derivatives without embedding original bytes, derivative bytes, tile bytes, credentials, presigned URLs, or sensitive customer metadata in the manifest by default.
- **FR-007**: The SDK MUST support failed derivative records that preserve enough typed failure information for recovery UI without invalidating the original manifest by default.
- **FR-008**: Browser-facing preview foundations MUST work with very large files without requiring a full-file read, full-image decode, or original-byte rewrite as default behavior.
- **FR-009**: Metadata enrichment MUST support caller- or server-derived dimensions, format, color depth, and tile pyramid descriptors without guessing unavailable image metadata.
- **FR-010**: Tile metadata MUST allow level, dimensions, tile sizing, and storage-reference descriptions while keeping tile binary data outside the manifest.
- **FR-011**: Derivative helpers MUST keep image processing, storage upload, and provider behavior caller-owned or adapter-owned.
- **FR-012**: Public contract changes MUST remain additive for existing 1.1.x consumers unless a later release plan explicitly approves a breaking manifest migration.
- **FR-013**: Documentation MUST include examples showing an original manifest with separate derivative references and must explain that derivatives never replace the original.
- **FR-014**: Tests MUST prove that derivative attachment and validation do not mutate original manifest identity or original preservation fields.
- **FR-015**: Default verification MUST remain credential-free, service-free, and independent of real image processing services or cloud storage.

### Key Entities *(include if feature involves data)*

- **Derivative Reference**: A manifest entry representing a preview, thumbnail, tile, metadata extraction, or custom output derived from the original.
- **Derivative Relationship**: The traceable link between a derivative and the original identity or fingerprint it was created from.
- **Preview Descriptor**: Metadata describing a preview or thumbnail asset, including status, media information, dimensions when known, and a storage reference when available.
- **Tile Pyramid Descriptor**: Metadata describing tiled derivative levels, tile sizing, level dimensions, and external tile storage references.
- **Metadata Enrichment**: A derivative-style record describing extracted image metadata, provenance, status, and source identity.
- **Derivative Validation Issue**: A typed issue that identifies invalid, stale, unsafe, or incomplete derivative references.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Covered derivative attachment tests preserve original identity, checksum, size, media type, and preservation policy in 100% of cases.
- **SC-002**: Derivative validation tests detect missing source relationship, mismatched source identity, unsupported kind, invalid status, and unsafe storage reference cases.
- **SC-003**: Covered preview and tile descriptor fixtures contain no embedded original bytes, derivative bytes, credentials, presigned URLs, or full customer metadata.
- **SC-004**: Documentation includes at least one original-plus-derivatives example and one explanation of planned, created, and failed derivative statuses.
- **SC-005**: Default verification commands pass without real cloud credentials, external image processing services, mounted storage, or network-only infrastructure.
- **SC-006**: The release plan identifies clear boundaries for browser preview helpers, server-side metadata helpers, and future user interface adapters before implementation begins.

## Assumptions

- Version 1.1.0 is an additive minor release that builds on the 1.0.0 single-package subpath model.
- Existing manifest derivative placeholders can be evolved without requiring existing consumers to migrate immediately.
- Actual image decoding, thumbnail generation, tile generation, and image format readers are adapter or caller responsibilities unless a later plan narrows an implementation dependency.
- React bindings, parallel upload, per-chunk provider checksum policy, and scoped package migration remain deferred to a later minor release.
- The manifest should store references and metadata for derivatives, not derivative binary payloads.
