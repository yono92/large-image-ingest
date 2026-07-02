# Implementation Plan: Core 1.0 Release

## Architecture

The 1.0 release remains a single framework-agnostic package. Optional transports, React bindings, and Node-specific derivative helpers stay outside the core.

Core modules:

- `validation.ts`: file, metadata, checksum, and caller-provided image metadata validation.
- `chunks.ts`: deterministic chunk planning and chunk size validation.
- `checksum.ts`: dependency-free chunked SHA-256 calculation.
- `fingerprint.ts`: compatibility helper that can continue to provide fast identity hints.
- `manifest.ts`: v1 manifest creation with checksum and validation results.
- `session.ts`: explicit upload state machine, retry handling, pause/resume, abort, and snapshots.
- `errors.ts`: typed public error class and error helpers.
- `types.ts`: public contracts.

## Data Contracts

The v1 manifest contains:

- `schemaVersion`
- `id`
- `createdAt`
- `library`
- `original`
- `image`
- `chunking`
- `upload`
- `storage`
- `metadata`
- `derivatives`
- `validation`

The original entry contains:

- source filename and extension
- size and media type
- last modified timestamp when available
- metadata fingerprint
- SHA-256 checksum
- preservation policy

The session snapshot contains:

- snapshot schema version
- manifest
- upload ID when established
- state
- uploaded chunk indexes
- uploaded bytes
- next chunk index
- timestamps

## State Model

Allowed states:

- `idle`: session object exists but upload has not started.
- `validating`: manifest and validation are being prepared.
- `ready`: manifest is valid and upload can start.
- `uploading`: chunks are being uploaded.
- `paused`: upload is intentionally paused between chunks.
- `completed`: transport completed successfully.
- `failed`: validation, checksum, transport, or completion failed.
- `aborted`: abort signal stopped the session.

## Transport Contract

The 1.0 core keeps transport provider-neutral. Required hooks:

- `createSession`
- `uploadChunk`
- `completeSession`

Optional hooks:

- `resumeSession`
- `shouldUploadChunk`

`shouldUploadChunk` allows adapters to skip chunks already present on the remote side during snapshot resume.

## Checksum Strategy

The core uses a dependency-free incremental SHA-256 implementation. It reads file data with `Blob.slice(...).arrayBuffer()` in bounded chunks. This keeps memory bounded without introducing runtime dependencies.

The default checksum is whole-file SHA-256. Per-chunk checksum can be added later once parallel upload and transport-specific integrity semantics are specified.

## Tradeoffs

- Whole-file SHA-256 can take time for multi-GB images, but it provides the verifiability expected from a 1.0 ingestion core.
- Pause takes effect between chunks rather than interrupting an in-flight chunk. This keeps transport adapters simple and avoids provider-specific partial request behavior.
- Resume uses caller-provided snapshot persistence. IndexedDB/localStorage are not built into core because persistence policy is application-specific.
- Dimension validation is based on caller-provided image metadata. The core does not decode inspection image formats in 1.0.
- Parallel upload is deferred so retry, ordering, and snapshot semantics stay stable.

## Verification

Required checks:

```bash
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

The build script also verifies package consumption through ESM `import` and CommonJS `require`.
