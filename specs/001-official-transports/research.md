# Research: Official Transport Adapters

## Decision: Keep Core Transport-Agnostic

Core should own validation, chunk planning, manifest generation, session state, events, retry policy, pause, resume, cancel, and completion orchestration. Protocol-specific code belongs in transport packages.

Rationale:

- This preserves the initial prototype principle that S3, tus, NAS, and future transports are adapters.
- It keeps browser and Node consumers from inheriting dependencies they do not use.
- It lets storage targets appear in manifests without making the manifest executable provider logic.

## Decision: Add Explicit Chunk Receipts

The current prototype calls `uploadChunk` and ignores protocol-specific completion records. Official transports need a durable result from every completed chunk.

Proposed receipt shape:

```ts
export interface UploadChunkReceipt {
  chunkIndex: number;
  sizeBytes: number;
  completedAt: string;
  checksum?: ChecksumReceipt;
  transport: {
    name: string;
    partNumber?: number;
    etag?: string;
    offset?: number;
    location?: string;
    opaque?: Record<string, unknown>;
  };
}
```

Rationale:

- S3 multipart completion requires ordered part receipts.
- tus resume depends on the upload URL and remote offset.
- NAS finalization depends on knowing which staged chunks are complete.
- Persisted receipts make resume observable instead of hidden inside adapter-local memory.
- Receipt validation prevents a transport bug or retry race from marking the wrong chunk complete.

## Decision: Add Serializable Session Snapshots

Core should expose a serializable session snapshot after session creation and after each completed chunk. Applications can save it to IndexedDB, local storage, or a server-side session store.

Rationale:

- Resumability is not useful if progress exists only in memory.
- Browser crashes, tab closes, and worker restarts are normal for multi-GB uploads.
- Application teams may need to persist state server-side for audit and support.
- Some resume material is sensitive, so event snapshots should be redacted by default and full snapshots should remain under caller control.

## Decision: Treat tus as Sequential Offset Upload Initially

The first tus adapter should use sequential chunks. Before each chunk upload, it should confirm or recover the remote offset.

Rationale:

- The initial core chunk planner is sequential.
- tus offset semantics naturally fit ordered chunk upload.
- Parallel tus uploads require the concatenation extension and should be designed separately.
- tus feature detection is available through `OPTIONS`, and uploads rely on `HEAD` offset checks plus `PATCH` requests with the expected offset.

Source:

- tus resumable upload protocol: https://tus.io/protocols/resumable-upload

## Decision: Use an S3 Broker or Presigned URL Provider

The S3 transport should not contain browser credentials. It should call an application-provided broker interface to create multipart uploads, obtain per-part upload URLs, complete uploads, and abort uploads.

Rationale:

- Browser direct-to-S3 multipart upload requires presigned operations or a controlled server broker.
- The core SDK should not own credentials or cloud account policy.
- S3-compatible storage implementations vary; a broker interface keeps provider details out of core.
- The broker should own object key policy, conditional write behavior, and incomplete-upload cleanup.

Sources:

- Amazon S3 multipart upload overview: https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html
- Amazon S3 multipart upload limits: https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html

## Decision: Enforce Transport Chunk Constraints Before Upload

Transport adapters should expose chunk planning constraints. Core should use those constraints to reject or adjust invalid plans before upload starts.

S3 multipart needs stricter part-size behavior than the current prototype default. The first S3 adapter should require an S3-compatible chunk size and part count before session creation.

Rationale:

- Failing after a partial multipart upload because chunk size was invalid is expensive and leaves cleanup work.
- S3 part completion requires a bounded ordered part list.
- tus and NAS may accept different chunk sizes, so the constraint belongs to transport capabilities.
- AWS S3-compatible behavior needs an explicit final-part exception: intermediate parts have a minimum size, while the final part may be smaller.
- Completion should use the recorded part numbers and ETags returned during upload. List-parts responses are useful for recovery checks, but should not replace the authoritative receipt list used for completion.

## Decision: NAS Is a Server Gateway, Not a Browser Transport

NAS support should be implemented as a server-side gateway or server transport package. Browser code should upload chunks over HTTP to that gateway. The gateway writes to staging storage and publishes atomically when complete.

Rationale:

- Browsers cannot safely or generally write directly to SMB or NFS.
- Partial inspection images must not appear as complete source-of-truth artifacts.
- Server-side path normalization, locking, checksum verification, and atomic finalize are required for safe NAS behavior.
- Abandoned staging sessions need explicit cleanup or expiration so failed uploads do not accumulate indefinitely.

## Decision: Keep The 1.0 Release In One Package With Subpath Exports

The first public packaging surface should remain one npm package named `large-image-ingest`. API boundaries should be published with subpath exports: `large-image-ingest/core`, `large-image-ingest/transport-tus`, `large-image-ingest/transport-s3`, and `large-image-ingest/node`.

Rationale:

- The codebase is still small, so npm workspaces would add churn before the API is stable.
- Subpath exports create a clean migration path to future scoped packages.
- Node-only NAS gateway APIs can remain isolated from browser imports.
- Existing root imports can continue to work for core plus browser-safe transports.

## Post-1.0 Follow-Ups

- Evaluate encrypted or application-managed resume token storage for transports that need stronger client-side secrecy.
- Specify optional per-chunk checksum behavior separately from the default whole-file SHA-256 manifest checksum.
- Decide whether AWS S3 needs a dedicated adapter after broader S3-compatible provider feedback.
