# Migrating To 1.5.0

Version 1.5.0 preserves all default 1.4 behavior. Worker hashing and parallel chunk transfer are opt-in execution features; persisted manifest, resume, and completion schemas do not change.

## Worker Checksums

Existing `calculateChecksum(file, options)` calls stay on the current bounded in-process path. To move CPU work off the browser UI thread, create an executor with `createWorkerChecksumExecutor()` and pass it through `checksum.executor` or directly to `calculateChecksum`.

The application must bundle a module Worker that calls `installChecksumWorkerRuntime(self)`. This boundary is intentional: Worker URLs, CSP directives, asset hashing, SSR behavior, and bundler transforms are application policy. The executor creates one worker per calculation and terminates it after result, failure, or abort.

An aborted calculation fails with `checksum.aborted`. Worker construction, protocol, runtime, or malformed response failures use `checksum.worker_failed`; default errors do not expose worker URLs or payloads.

## Parallel Chunks

Uploads remain sequential unless `execution.maxParallelChunks` is set above one. The value must be an integer from 1 through 32 and the transport must explicitly advertise `supportsParallelChunks: true`.

Do not enable the capability for a transport whose offsets, part state, credentials, or completion protocol require strict sequential mutation. The official tus and S3 helpers remain sequential in 1.5.0.

Parallel work settles in bounded batches. Successful acknowledgements are validated and checkpointed in chunk order before a sibling failure is surfaced. Retry remains per chunk. Pause and cancel start no new batch after the active one settles.

## Capacity Guidance

The ceiling of 32 is not a recommended default. Begin with two to four and measure browser/request memory, proxy buffering, server concurrency, provider throttling, and retry amplification. Apply stricter server-side per-upload and per-tenant limits regardless of the client setting.
