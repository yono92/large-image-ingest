# Contributing

`large-image-ingest` is developed with a spec-first workflow. For substantial features, start with a spec under `specs/` before implementation.

## Local Setup

```bash
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

## Contribution Guidelines

- Keep the core package framework-agnostic.
- Preserve original files by default.
- Add adapters instead of provider-specific logic in core.
- Avoid tests that require real cloud, NAS, or network credentials.
- Update README examples when public APIs change.

## Feature Areas

Good first areas for contribution:

- Validation rules.
- Manifest schema.
- Chunk planning and retry behavior.
- Browser-safe hashing.
- Transport adapter design.
- Session snapshot persistence examples.
