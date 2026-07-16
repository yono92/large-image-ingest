# AGENTS.md

## Project Context

`large-image-ingest` is a TypeScript-first SDK for safely ingesting very large inspection images. The primary domain is semiconductor and industrial inspection imagery, where the uploaded original is a source-of-truth artifact and must remain verifiable.

Use `README.md` as the current product brief until formal Spec Kit artifacts exist.

## Spec-Driven Development

This project should be developed with GitHub Spec Kit's Spec-Driven Development workflow.

If `.specify/` does not exist and the user asks to begin formal SDD, initialize Spec Kit in this project directory with the Codex skills integration:

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

## Agent Work Discipline

Adapt the four principles from [Karpathy Guidelines](https://github.com/multica-ai/andrej-karpathy-skills) to all coding, review, and refactoring work in this repository:

1. Think before coding. State material assumptions, ambiguity, and tradeoffs before implementation. When different interpretations would materially change the result, ask rather than silently choosing one.
2. Prefer the simplest sufficient solution. Do not add speculative features, one-use abstractions, unrequested configurability, or defensive handling for impossible states. Reduce an implementation when a substantially smaller one satisfies the same verified requirements.
3. Make surgical changes. Every changed line should trace to the active request, specification, or a direct consequence of the change. Preserve surrounding style, avoid unrelated refactors, and remove only dead code introduced by the current work unless broader cleanup is explicitly requested.
4. Execute against verifiable goals. Translate non-trivial work into concise success criteria, reproduce defects with tests where practical, and loop until the relevant checks pass. Use rigor proportional to the task; trivial and obvious edits do not require ceremonial planning.

These behavioral guidelines supplement the project-specific Spec Kit, security, API, and verification rules below. When they conflict, the more specific project requirement or active specification takes precedence.

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
- Before any npm publish or release tag, verify `README.md`, `CHANGELOG.md`, `docs/`, relevant `specs/<feature>/` artifacts, package version metadata, and public API examples describe the exact version and behavior being released.
- Before publish, search for stale release wording such as old version numbers, "release candidate", "planning" for already implemented work, and outdated roadmap TODOs. Fix documentation drift before tagging or publishing.

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
