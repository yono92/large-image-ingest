# Implementation Plan: Core 1.0 Release

## Architecture

The 1.0 release remains a single npm package with provider-agnostic core APIs and stable subpath exports. Protocol-specific tus, S3 multipart, and Node NAS gateway code stays outside `large-image-ingest/core`, but ships in the package as isolated subpath modules.

Core modules:

- `validation.ts`: file, metadata, checksum, and caller-provided image metadata validation.
- `chunks.ts`: deterministic chunk planning and chunk size validation.
- `checksum.ts`: dependency-free chunked SHA-256 calculation.
- `fingerprint.ts`: compatibility helper that can continue to provide fast identity hints.
- `manifest.ts`: v1 manifest creation with checksum and validation results.
- `session.ts`: explicit upload state machine, retry handling, pause/resume, abort, and snapshots.
- `errors.ts`: typed public error class and error helpers.
- `types.ts`: public contracts.
- `resume.ts`: persistent resume records, compatibility checks, and checkpoint helpers.
- `tus.ts`: browser-safe tus transport adapter.
- `s3.ts`: broker-backed S3 multipart transport adapter.
- `nas.ts`: server-side NAS gateway and file-lock provider.
- `web-storage-resume-store.ts`: small browser storage adapter for resume records.

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

The upload session snapshot contains:

- manifest ID
- transport session data after redaction when emitted through events
- chunk plan
- completed chunk receipts
- uploaded bytes
- total bytes
- status
- timestamps
- safe error summary when available

Persistent resume records are separate operational data from the manifest. They contain file identity, chunking identity, transport state, progress, lifecycle status, and timestamps, but never original image bytes.

## State Model

Allowed statuses:

- `idle`: session object exists but upload has not started.
- `validating`: manifest and validation are being prepared.
- `creating`: transport session is being created.
- `uploading`: chunks are being uploaded.
- `paused`: local work stopped after a recoverable checkpoint.
- `resuming`: a persisted resume record is being validated and restored.
- `completing`: transport completion/finalization is running.
- `completed`: transport completed successfully.
- `failed`: validation, checksum, transport, or completion failed.
- `canceled`: the application canceled the session and default recovery should not offer it.

## Transport Contract

The 1.0 core keeps transport provider-neutral. Required hooks:

- `createSession`
- `uploadChunk`
- `completeSession`

Optional hooks:

- `resumeSession`
- `abortSession`

`resumeSession` validates or refreshes remote resume state before the core skips locally completed chunk ranges. `abortSession` lets cancel clean up provider-side upload state when supported.

## Checksum Strategy

The core uses a dependency-free incremental SHA-256 implementation. It reads file data with `Blob.slice(...).arrayBuffer()` in bounded chunks. This keeps memory bounded without introducing runtime dependencies.

The default checksum is whole-file SHA-256. Per-chunk checksum can be added later once parallel upload and transport-specific integrity semantics are specified.

## Tradeoffs

- Whole-file SHA-256 can take time for multi-GB images, but it provides the verifiability expected from a 1.0 ingestion core.
- Pause takes effect between chunks rather than interrupting an in-flight chunk. This keeps transport adapters simple and avoids provider-specific partial request behavior.
- Resume uses caller-provided persistence through a generic store contract. A small Web Storage adapter is included for simple browser use, while applications can provide custom or encrypted stores.
- Dimension validation is based on caller-provided image metadata. The core does not decode inspection image formats in 1.0.
- Parallel upload is deferred so retry, ordering, receipt, and resume semantics stay stable.

## Verification

Required checks:

```bash
npm run typecheck
npm run typecheck:examples
npm test
npm run build
npm pack --dry-run
```

The build script also verifies package consumption through ESM `import` and CommonJS `require`.
