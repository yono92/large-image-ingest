# Quickstart: 1.2.0 Derivatives And Preview Foundations

Use this guide to validate the 1.2.0 planning scope once tasks and implementation exist.

## Default Verification

Default checks must stay local and credential-free:

```bash
npm run typecheck
npm run typecheck:examples
npm test
npm run test:integration
npm run build
npm pack --dry-run
```

Expected outcome:

- Public derivative contracts compile for ESM and CJS outputs.
- Unit tests cover derivative attachment, validation, preview descriptors, tile metadata, and metadata enrichment fixtures.
- No real image processing service, cloud credential, mounted storage path, external upload endpoint, or network-only infrastructure is required.

## Derivative Attachment Validation

Run focused derivative tests:

```bash
npm test -- derivatives
```

Expected outcome:

- Attaching planned, created, and failed derivatives does not mutate the source manifest.
- Original identity, checksum, size, media type, and preservation policy remain unchanged.
- Duplicate derivative IDs are rejected unless explicit replacement is enabled.
- Derivative source relationships are captured from the manifest.

## Derivative Validation

Run focused validation fixtures:

```bash
npm test -- derivatives
```

Expected outcome:

- Missing source relationship, stale source identity, unsupported kind, invalid status, unsafe storage reference, embedded payload, unsafe failure detail, invalid tile metadata, and missing required derivative cases produce typed issues.
- Optional derivative failures do not invalidate the original manifest.
- Validation output is safe for logs and contains no credentials, presigned URLs, customer metadata, original bytes, derivative bytes, or tile bytes.

## Preview And Thumbnail Descriptor Validation

Run focused preview tests:

```bash
npm test -- preview
```

Expected outcome:

- Planned previews can be recorded before a generated asset exists.
- Created previews reference caller-owned assets without embedding bytes.
- Failed previews carry safe failure information.
- Synthetic large-file fixtures do not require full-file reads or full-image decoding.

## Metadata And Tile Review

Run focused metadata tests if server-side helpers are added:

```bash
npm test -- metadata
```

Expected outcome:

- Extracted dimensions, format, color depth, and tile pyramid metadata remain derivative or enrichment records.
- Tile levels validate positive dimensions, row counts, column counts, and safe storage references.
- Metadata enrichment does not overwrite original manifest identity without explicit caller behavior.

## Documentation Review

Before release, review README and derivative docs.

Expected outcome:

- Documentation includes an original-plus-derivatives manifest example.
- Documentation explains planned, created, and failed derivative states.
- Documentation states that previews, thumbnails, tiles, metadata extracts, and transformed outputs never replace the original source artifact.
- Documentation keeps browser preview generation, server metadata extraction, storage upload, and UI bindings outside core responsibilities unless explicitly implemented as adapters.
