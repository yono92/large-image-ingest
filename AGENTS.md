# AGENTS.md

## Project Context

`large-image-ingest` is a TypeScript-first SDK for safely ingesting very large inspection images. The primary domain is semiconductor and industrial inspection imagery, where the uploaded original is a source-of-truth artifact and must remain verifiable.

Use `README.md` together with the active `specs/<feature>/` artifacts as the
current product brief. Formal Spec Kit artifacts exist in this repository.

## Current Release State

- Core 1.0 has already been released as `v1.0.0`. Do not describe Core 1.0 as
  pending or merely a release candidate in new work.
- Treat `specs/001-core-1-0-release/` as the historical release contract for
  Core 1.0 and use it for regression checks against released behavior.
- The released 1.0 package includes the provider-neutral core plus documented
  subpath exports such as `large-image-ingest/core`,
  `large-image-ingest/transport-tus`, `large-image-ingest/transport-s3`, and
  `large-image-ingest/node`.
- Future work after Core 1.0 should be scoped as maintenance, patch fixes, or a
  new Spec Kit feature. Update specs, README examples, tests, changelog, and
  package versioning according to the compatibility impact.

## Spec-Driven Development

This project should be developed with GitHub Spec Kit's Spec-Driven Development workflow.

`.specify/` already exists. Do not initialize Spec Kit again. If working in a
fresh clone where `.specify/` is absent and the user asks to begin formal SDD,
initialize Spec Kit in that project directory with the Codex skills integration:

```bash
specify init --here --integration codex --integration-options="--skills"
```

Follow this order for non-trivial product or architecture work:

1. Constitution: establish project principles with `speckit-constitution`.
2. Specify: capture user stories and requirements with `speckit-specify`.
3. Clarify: resolve underspecified behavior with `speckit-clarify` before planning.
4. Plan: define architecture, dependencies, tradeoffs, and data contracts with `speckit-plan`.
5. Tasks: generate implementation tasks with `speckit-tasks`.
6. Analyze or checklist: check cross-artifact consistency before implementation.
7. Implement: execute tasks with `speckit-implement`.
8. Converge: compare implementation against spec, plan, and tasks when work is incomplete or uncertain.

Do not implement broad features before the relevant spec and plan exist. Small documentation corrections and narrow housekeeping edits can be made directly.

For future non-trivial specs, prefer explicit traceability:

- Functional requirements should use stable `FR-###` identifiers.
- Success criteria that imply buildable work should use stable `SC-###`
  identifiers.
- Tasks should use stable `T###` identifiers and reference the relevant story,
  requirement, files, and tests when practical.
- Before implementation, run the relevant Spec Kit analyze/checklist workflow
  and resolve critical coverage or constitution issues.
- Check the active feature directory with the Spec Kit prerequisite script
  instead of assuming the most recent or lowest-numbered `specs/` directory is
  the current work item.

## Product Principles

- Preserve the original file by default. Never resize, recompress, strip EXIF, or mutate the source artifact unless a spec explicitly allows it.
- Treat thumbnails, previews, compressed images, and tiled images as derivatives with separate manifest entries.
- Support chunked, resumable upload for large files. Upload state must be observable and recoverable.
- Generate a versioned manifest containing file identity, image metadata, checksums, upload session data, and derivative references.
- Prefer streaming and slicing APIs. Browser code should use `Blob.slice`, Web Workers, and streams where practical instead of loading entire files into memory.
- Keep the core package framework-agnostic. React integration should be a thin optional adapter.
- Use adapters for upload transports and storage targets. Do not bake S3, tus, or any cloud provider into core logic.
- Make progress, retry, pause, resume, failure, and completion states explicit in the public API.
- Validate MIME type, extension, file size, dimensions, checksum, and user-provided metadata according to the active spec.

## Intended Package Shape

Prefer a modular package layout when implementation begins:

- `@large-image-ingest/core`: validation, fingerprinting, manifests, sessions, event model, state machine.
- `@large-image-ingest/transport-tus`: tus-compatible resumable upload adapter.
- `@large-image-ingest/transport-s3`: S3-compatible multipart or presigned URL adapter.
- `@large-image-ingest/transport-nas`: future server-side adapter patterns for NAS-backed storage.
- `@large-image-ingest/preview-browser`: browser-safe preview and derivative hooks.
- `@large-image-ingest/node`: Node.js stream helpers and server-side verification utilities.
- `@large-image-ingest/react`: React hooks and lightweight UI bindings.

Use this as a starting hypothesis, not a mandate. If Spec Kit planning produces a simpler MVP package, prefer the spec and plan.

## TypeScript And API Rules

- Ship TypeScript-first public APIs with stable exported types.
- Prefer ESM-first packaging unless compatibility research shows a strong reason to add dual output.
- Keep runtime dependencies small. Favor native Web APIs and small adapters over large framework dependencies.
- Public API changes must be reflected in specs, README examples, and tests.
- Model errors with typed error codes so applications can show useful recovery UI.
- Avoid global mutable state. Upload sessions should be explicit objects or handles.

## Testing Expectations

When a package scaffold exists, add focused tests for:

- Manifest generation and versioning.
- File validation rules and error codes.
- Upload session state transitions.
- Chunk planning, retry behavior, and resumability.
- Checksum calculation and verification.
- Transport adapters using local fakes or mocks.
- Browser-safe large-file behavior using synthetic `Blob` or stream fixtures.

Do not require real cloud credentials in default tests. Any cloud or network integration test must be explicitly opt-in.

## Security And Data Handling

- Do not log presigned URLs, credentials, customer metadata, or full manifests by default.
- Treat uploaded filenames and metadata as untrusted input.
- Prevent path traversal in Node utilities.
- Make checksum verification part of the default large-file path.
- Keep external services optional and adapter-based.
- Do not assume browsers can write directly to SMB or NFS. NAS compatibility should be implemented through a server-side adapter, gateway, or protocol such as WebDAV/SFTP/tus-to-NAS.

## Documentation Rules

- Keep `README.md` aligned with the current product direction.
- Store formal Spec Kit artifacts under `specs/<feature>/` and `.specify/` once initialized.
- Document architectural tradeoffs in `specs/<feature>/research.md` when using Spec Kit.
- Update examples whenever public API behavior changes.

## Local Skills

This directory includes a skills.sh-installed skill at `.agents/skills/add-community-extension`. It comes from `github/spec-kit`, but it is for maintaining Spec Kit's community extension catalog. Do not use it for this SDK's normal feature work.

The project is initialized with GitHub Spec Kit `0.12.2` and Codex skills integration. Use the generated `.agents/skills/speckit-*` skills for this SDK's normal Spec-Driven Development workflow.

## Verification

Before finishing implementation work, run the relevant package checks once they exist:

```bash
npm run typecheck
npm test
npm run build
```

If the package scaffold or scripts do not exist yet, state that verification was limited to documentation or planning checks.
