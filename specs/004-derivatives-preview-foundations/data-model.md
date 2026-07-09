# Data Model: 1.2.0 Derivatives And Preview Foundations

## DerivativeReference

Represents a manifest entry for a preview, thumbnail, tile, metadata extraction, or custom derivative.

Fields:

- `id`: Stable derivative identifier unique within a manifest.
- `kind`: `preview`, `thumbnail`, `tile`, `metadata`, or `custom`.
- `status`: `planned`, `created`, or `failed`.
- `role`: Optional caller-facing purpose such as visual review, quick-look thumbnail, tile pyramid, or metadata enrichment.
- `mediaType`: Optional media type for created or planned derivative output.
- `width` / `height`: Optional dimensions when known.
- `sizeBytes`: Optional derivative asset size when known.
- `checksum`: Optional checksum for created derivative assets when available.
- `source`: Existing source marker for compatibility with the original artifact.
- `sourceIdentity`: Optional manifest ID, original fingerprint, checksum, size, and media type captured when the derivative was created or planned.
- `storage`: Optional external storage reference or location hint.
- `createdAt`: Optional creation timestamp for created derivatives.
- `updatedAt`: Optional last update timestamp for planned or failed derivatives.
- `provenance`: Optional generator name, version, parameters label, and environment label.
- `failure`: Optional typed failure code and safe message for failed derivatives.

Validation rules:

- `id`, `kind`, `status`, and source relationship are required for helper-created entries.
- Existing minimal derivative entries remain readable for compatibility, but validation should report missing recommended source identity when strict validation is requested.
- `created` derivatives must include enough storage or provenance information for applications to locate or audit the output.
- `failed` derivatives must include a safe failure code or message and must not include credentials, presigned URLs, stack traces, or customer metadata.
- Storage references are labels or hints, not trusted filesystem paths or credential containers.

## DerivativeRelationship

Represents the traceable relationship between a derivative and the original image identity.

Fields:

- `manifestId`: Original manifest identifier used when the derivative was planned or created.
- `originalFingerprint`: Optional original fingerprint copied from the original manifest.
- `originalChecksum`: Optional original checksum copied from the original manifest when available.
- `originalSizeBytes`: Optional original byte size.
- `originalMediaType`: Optional original media type.
- `createdFromManifestSchemaVersion`: Optional manifest schema version.

Validation rules:

- A derivative generated for one original must not be attached to a different original without a stale-source validation issue.
- Checksum comparison should be used when both original and derivative relationship checksums are available.
- Fingerprint comparison should be used as a fallback identity signal when checksums are unavailable.

## PreviewDescriptor

Represents caller-provided preview or thumbnail metadata before it is converted into a derivative reference.

Fields:

- `kind`: `preview` or `thumbnail`.
- `status`: `planned`, `created`, or `failed`.
- `mediaType`: Optional output media type.
- `width` / `height`: Optional output dimensions.
- `sizeBytes`: Optional output size.
- `storage`: Optional external reference or label.
- `checksum`: Optional checksum for created preview assets.
- `provenance`: Optional generator information.
- `failure`: Optional safe failure code and message.

Validation rules:

- Descriptor data must not contain original bytes or derivative bytes.
- `created` descriptors should include a storage reference or caller-owned locator.
- `planned` descriptors may omit storage and checksum.
- `failed` descriptors should include safe failure information and no sensitive details.

## TilePyramidDescriptor

Represents metadata for tiled derivatives without embedding tile payloads.

Fields:

- `status`: `planned`, `created`, or `failed`.
- `tileWidth` / `tileHeight`: Tile dimensions.
- `levels`: Ordered tile levels.
- `storage`: Optional common storage reference or template label.
- `provenance`: Optional generator information.
- `failure`: Optional safe failure code and message.

Level fields:

- `level`: Zero-based or caller-defined level number.
- `width` / `height`: Level dimensions.
- `columns` / `rows`: Tile grid size.
- `scale`: Optional scale relative to the original.
- `storage`: Optional per-level storage reference.

Validation rules:

- Created tile pyramids must include at least one level.
- Tile dimensions, level dimensions, rows, and columns must be positive safe integers.
- Storage references must not contain credentials or presigned URLs by default.

## MetadataEnrichment

Represents metadata extracted outside the initial core ingest path.

Fields:

- `status`: `planned`, `created`, or `failed`.
- `format`: Optional extracted format.
- `width` / `height`: Optional extracted dimensions.
- `colorDepth`: Optional extracted color depth.
- `channels`: Optional channel count.
- `tilePyramid`: Optional tile pyramid descriptor.
- `sourceIdentity`: Original identity used during extraction.
- `provenance`: Extractor name, version, and safe environment label.
- `failure`: Optional safe failure code and message.

Validation rules:

- Extracted metadata must be tied to the source identity it was derived from.
- Extracted values must not silently overwrite original manifest fields without caller intent.
- Failed extraction records must be safe for logs and must not include raw parser traces containing paths, credentials, or customer metadata.

## DerivativeValidationIssue

Represents a typed derivative validation problem.

Fields:

- `code`: Stable issue code.
- `message`: Safe human-readable message.
- `path`: Optional manifest path to the derivative field.
- `severity`: `error` or `warning`.
- `derivativeId`: Optional derivative identifier.

Suggested issue code families:

- `derivative.id.missing`
- `derivative.kind.unsupported`
- `derivative.status.invalid`
- `derivative.source.missing`
- `derivative.source.mismatch`
- `derivative.storage.unsafe`
- `derivative.payload.embedded`
- `derivative.failure.unsafe`
- `derivative.tile.invalid`

Validation rules:

- Issue details must be safe for logs.
- Validation must not mutate the manifest or derivative entries being checked.
