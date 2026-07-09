# Research: 1.2.0 Derivatives And Preview Foundations

## Decision: Evolve The Existing Derivative Placeholder Additively

**Rationale**: The current manifest already contains a `derivatives` array and a minimal derivative entry shape. Replacing it or bumping the entire manifest schema would create unnecessary migration pressure for a minor release. Additive fields and helper-generated complete references let 1.1.x consumers keep working while allowing 1.2.0 consumers to opt into stronger validation.

**Alternatives considered**:

- Create a new manifest schema version: rejected for 1.2.0 because the planned behavior can be expressed additively.
- Replace the existing derivative entry with a completely new required shape: rejected because it would be source-incompatible for consumers that already type against the placeholder.

## Decision: Store Derivative References, Not Derivative Bytes

**Rationale**: Manifests must remain metadata artifacts. Embedding previews, thumbnails, tiles, original bytes, or opaque generated payloads would increase memory pressure, leak sensitive data into logs, and blur the boundary between source artifacts and derived assets.

**Alternatives considered**:

- Embed small thumbnails directly in the manifest: rejected because it creates inconsistent size and privacy behavior.
- Store tile payloads in the manifest: rejected because tile pyramids can be large and storage-provider-specific.

## Decision: Keep Browser Preview Foundations Descriptor-First

**Rationale**: Browsers can work with large `Blob` and `File` objects, but decoding industrial formats or rendering thumbnails can be memory-intensive and format-specific. The 1.2.0 foundation should record planned or externally generated preview outputs without requiring full-file reads or a built-in decoder.

**Alternatives considered**:

- Add a built-in browser image decoder or canvas thumbnailer: rejected because it is format-limited and can load large files into memory.
- Defer all preview work: rejected because consumers need a stable manifest place to record preview references before helper packages exist.

## Decision: Treat Metadata Enrichment As A Derivative-Style Record

**Rationale**: Dimensions, color depth, format details, and tile pyramid metadata may be extracted after upload by specialized server-side readers. Recording that output as enrichment tied to the original preserves traceability and avoids pretending the core ingest path inspected bytes it did not inspect.

**Alternatives considered**:

- Overwrite the root image inspection fields after extraction: rejected because it hides provenance and can make stale metadata harder to detect.
- Require image metadata before upload: rejected because many formats need server-side or specialized inspection.

## Decision: Validate Source Relationship And Unsafe References Separately From Original Validation

**Rationale**: A derivative can be missing, stale, failed, or unsafe while the original source artifact remains valid. Separate derivative validation lets applications decide whether a derivative is optional or required without contaminating original file validation.

**Alternatives considered**:

- Fail the entire manifest whenever any derivative is invalid: rejected because optional previews should not block source-of-truth ingest.
- Ignore derivative validation until storage adapters exist: rejected because unsafe references and stale relationships are contract-level concerns.

## Decision: Keep The Current Single-Package Layout For 1.2.0

**Rationale**: The package already uses clear subpath exports and the 1.2.0 scope can fit without workspace churn. Maintaining one package lowers release risk while preserving a direct future migration path to scoped packages if derivative or UI helpers grow.

**Alternatives considered**:

- Move immediately to scoped packages: rejected because it adds packaging and migration work before 1.2.0 proves the new boundaries.
- Put preview and metadata helpers directly into transport adapters: rejected because derivative metadata is independent of upload protocol.
