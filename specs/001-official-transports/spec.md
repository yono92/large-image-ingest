# Feature Specification: Official Transport Adapters

## Status

Draft. This feature extends the initial prototype by designing official transport adapters before implementation.

## Goal

Provide official transport packages for resumable large-image upload while keeping the core package provider-agnostic, original-preserving, and recoverable after interruption.

The first official transports are:

- tus-compatible resumable upload.
- S3-compatible multipart upload through presigned URLs or an application broker.
- NAS-backed upload through a server-side gateway pattern.

## Background

The current prototype exposes an `UploadTransport` interface and requires applications to supply their own adapter. That is correct for the initial core, but official transports need stronger contracts than the prototype currently exposes.

In particular, S3 multipart completion needs ordered part receipts such as part numbers and ETags. NAS finalization needs explicit staged chunk records. tus resume needs durable upload URL and offset state. These records should not live only inside adapter-local mutable memory, because uploads must be observable and recoverable.

## User Stories

1. As a browser application developer, I can use a tus adapter without writing the tus protocol plumbing myself.
2. As a platform engineer, I can use an S3 multipart adapter without exposing cloud credentials to the browser.
3. As an infrastructure team, I can route browser uploads into NAS-backed storage through a server-side gateway without changing core upload orchestration.
4. As an application developer, I can persist session state and resume an interrupted upload.
5. As a UI developer, I can distinguish starting, uploading, paused, resumed, retrying, completing, completed, failed, and canceled states.
6. As a security reviewer, I can verify that presigned URLs, credentials, customer metadata, and NAS paths are not logged or accepted blindly.

## Functional Requirements

- The core must remain independent from tus, S3, NAS, cloud SDKs, and framework dependencies.
- Official transports must be separate packages or modules from core.
- Transport adapters must implement a shared public transport contract.
- The transport contract must let `uploadChunk` return a durable chunk receipt.
- The core must store chunk receipts in upload session state.
- The core must validate each chunk receipt against the expected chunk index and size before marking that chunk complete.
- The core must keep at most one successful receipt per chunk index and must replace retry results deterministically.
- The core must pass completed chunk receipts to `completeSession`.
- The core must expose a serializable session snapshot for persistence.
- The core must support redacted snapshots for event emission and full snapshots for caller-controlled persistence.
- The core must support resuming from a persisted snapshot.
- The core must distinguish pause from cancel:
  - Pause stops local work and preserves resumable remote state.
  - Cancel aborts or cleans up remote state when the transport supports it.
- The core must expose transport capability metadata so applications know whether resume, abort, parallel upload, checksums, or expiration are supported.
- The manifest must continue to treat storage target kind as metadata, not as provider-specific execution logic.
- Default tests must use local fakes and must not require cloud credentials, a tus server, or a real NAS mount.

## tus Requirements

- The tus adapter must support creating a tus upload and storing the upload URL as resumable session state.
- The adapter must detect server capabilities with tus `OPTIONS` when configured to require extensions such as creation, expiration, checksum, or termination.
- The adapter must verify remote offset before uploading a chunk.
- The adapter must send protocol-required headers such as `Tus-Resumable`, `Upload-Offset`, and `Content-Type: application/offset+octet-stream`.
- The adapter must upload chunks sequentially for the first implementation.
- The adapter must handle offset mismatch as a typed recoverable or fatal transport error.
- The adapter must reconcile remote offset with local receipts before resuming and must not blindly replay already-accepted bytes.
- The adapter must preserve the original file bytes and only send sliced chunk bodies.
- The adapter should support upload expiration metadata when the server reports it.
- The adapter may support checksum and metadata extensions when configured, but they are not required for the first implementation.

## S3 Multipart Requirements

- The S3 adapter must be browser-safe by default and must not require AWS credentials in browser code.
- The adapter must rely on an application-provided broker or presigned URL provider for multipart operations.
- The adapter must map chunk index to S3 part number deterministically.
- The adapter must enforce S3-compatible chunk constraints before upload starts.
- The adapter must support the provider rule that the final chunk may have different minimum-size behavior from intermediate chunks.
- Each uploaded part must produce a receipt containing at least part number and ETag or equivalent completion token.
- `completeSession` must receive the ordered part receipts needed to complete the multipart upload.
- S3 completion must use the SDK-owned or application-owned recorded receipts, not an eventually stale list-parts response.
- When multipart checksums are enabled, the adapter must honor provider requirements for consecutive part numbers beginning with 1.
- `abortSession` must be supported when the broker exposes multipart abort.
- Presigned URLs must never be added to manifest metadata or emitted in default logs.
- Object keys must be generated or approved by trusted application code, not raw user filenames.

## NAS Requirements

- NAS support must be server-side. Browser-direct SMB or NFS writes are out of scope.
- The NAS transport must be modeled as a gateway that receives browser chunks and writes to configured server storage.
- The gateway must stage uploads before finalization so partial inspection images are not exposed as complete artifacts.
- The gateway must lock or otherwise serialize finalize operations for a single upload session.
- Finalization must validate all expected chunks before publishing the final object.
- Finalization should use an atomic move or equivalent same-volume publish step when available.
- Server-side paths must be derived from trusted configuration and generated IDs, not raw user filenames.
- User filenames and metadata may be preserved as metadata, but must not drive filesystem paths without sanitization and explicit policy.
- The gateway must reject path traversal and unsafe metadata.
- The gateway must expose resume and cleanup behavior through explicit session state.
- The gateway must support expiration or cleanup for abandoned staging sessions.

## Non-Goals

- React UI components.
- Full image decoding, thumbnailing, or tile generation.
- Browser-direct SMB, NFS, or filesystem writes.
- Real cloud or NAS integration tests in the default test suite.
- Parallel multipart upload in the first implementation.
- Strong whole-file hashing in the browser unless a separate checksum feature specifies streaming behavior.

## Acceptance Criteria

- The design identifies the core transport contract changes needed before official adapters are implemented.
- The design describes tus, S3 multipart, and NAS gateway responsibilities separately.
- The design specifies how resumable session state and chunk receipts are persisted.
- The design documents security constraints for presigned URLs, metadata, and filesystem paths.
- The design includes implementation tasks that can be executed incrementally.
