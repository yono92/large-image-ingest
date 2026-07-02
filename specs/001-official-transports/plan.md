# Implementation Plan: Official Transport Adapters

## Architecture

Add official transports in layers:

1. Evolve core transport contracts so upload state is durable and receipt-aware.
2. Add a tus-compatible browser transport.
3. Add an S3-compatible multipart browser transport backed by an application broker or presigned URL provider.
4. Add a NAS gateway design and server-side package after the core resume and receipt model is stable.

The core continues to own:

- Validation.
- Chunk planning.
- Manifest generation.
- Session state machine.
- Retry policy.
- Pause, resume, cancel, failure, and completion events.
- Serializable session snapshots.

Transport packages own:

- Protocol-specific session creation.
- Chunk upload mechanics.
- Remote offset or part receipt validation.
- Completion and abort calls.
- Transport-specific typed errors.

## Package Layout

Keep the MVP in one npm package and publish stable subpath exports:

```text
large-image-ingest
large-image-ingest/core
large-image-ingest/transport-tus
large-image-ingest/transport-s3
large-image-ingest/node
```

Rationale:

- The current implementation is still small enough that npm workspaces would add migration cost without improving runtime boundaries.
- Subpath exports establish the same import boundaries that future scoped packages would use.
- Browser-safe APIs stay separate from the Node-only NAS gateway.
- The root `large-image-ingest` export remains a compatibility surface for core plus browser-safe transports.

Future package migration, if needed, should map subpaths directly to scoped packages such as `@large-image-ingest/core`, `@large-image-ingest/transport-tus`, `@large-image-ingest/transport-s3`, and `@large-image-ingest/node`.

## Core Contract Changes

- Add `TransportCapabilities`.
- Add `TransportSession`.
- Add `UploadChunkReceipt`.
- Add `UploadSessionSnapshot`.
- Change `uploadChunk` to return a receipt.
- Change `completeSession` to receive all receipts.
- Validate returned receipts against expected chunk index and size.
- Sort completion receipts deterministically before calling `completeSession`.
- Add a snapshot redaction policy so events do not leak transport secrets.
- Add optional `resumeSession`.
- Add optional `abortSession`.
- Add pause and cancel semantics to `LargeImageIngestSession`.
- Emit state snapshot events after session creation and chunk completion.
- Add a legacy wrapper for the current `UploadTransport` shape if needed.

## tus Transport Plan

- Implement `createTusTransport(options)`.
- Add optional tus `OPTIONS` capability discovery.
- Support new upload creation.
- Support resume from stored upload URL or opaque resume token.
- Verify remote offset before each chunk.
- Reconcile remote offset with local receipts during resume.
- Upload with sequential PATCH requests.
- Return chunk receipts containing completed offset and optional expiration.
- Surface offset mismatch and expiration as typed errors.
- Treat tus upload URLs as potentially sensitive resume material.
- Test with a local fake tus endpoint or protocol mock.

## S3 Multipart Transport Plan

- Implement `createS3MultipartTransport(options)`.
- Require a broker or presigned URL provider interface.
- Validate chunk size and part count against transport capabilities.
- Represent the final-part minimum-size exception explicitly.
- Create multipart upload through the broker.
- Upload each chunk with a presigned part request.
- Return receipts containing part number, ETag, and optional checksum.
- Complete multipart upload through the broker with ordered receipts.
- Use locally recorded receipts for completion and list-parts responses only for diagnostics or recovery checks.
- Generate object keys through trusted broker/application policy rather than raw filenames.
- Abort multipart upload when canceling if supported.
- Recommend storage lifecycle cleanup for incomplete multipart uploads.
- Test with a fake broker and mocked `fetch`.

## NAS Gateway Plan

- Implement NAS as a server-side gateway package after core resume support is stable.
- Export the gateway from a Node-only package subpath so browser imports do not resolve `node:fs`.
- Accept browser chunks over HTTP.
- Store chunks under generated staging session directories.
- Lock or serialize finalization per upload session.
- Use a gateway lock provider for finalization so production deployments can use file, Redis, database, or orchestrator-backed locks.
- Provide a default file-lock provider under the staging root for multi-process Node deployments that share the same mounted storage.
- Support stale file-lock cleanup only when explicitly configured with a timeout longer than the expected finalize duration.
- Keep server-side session metadata separate from user-provided filenames.
- Validate chunk index, byte range, size, and checksum.
- Finalize by assembling or moving staged data into a configured target root.
- Publish final artifacts only after all chunks are verified.
- Reject path traversal and unsafe metadata.
- Test with temporary directories only.

## Error Model

Add typed error codes before implementing transports:

- `transport.session_expired`
- `transport.paused`
- `transport.canceled`
- `transport.offset_mismatch`
- `transport.part_rejected`
- `transport.receipt_missing`
- `transport.receipt_invalid`
- `transport.complete_failed`
- `transport.abort_failed`
- `transport.resume_failed`
- `transport.unsafe_path`

Errors should include retryability and safe details. They must not include credentials, presigned URLs, raw customer metadata, or full manifests by default.

## Verification

Default verification should remain local:

```bash
npm run typecheck
npm run typecheck:examples
npm test
npm run build
npm run smoke:exports
```

Transport tests should use fakes or mocks. Real tus servers, cloud credentials, object storage buckets, and NAS mounts must be opt-in integration tests.
