# Server Operational Guide

Browser SDK code should never own cloud credentials, object key policy, NAS target path policy, or direct filesystem writes. Keep those responsibilities on an application server, gateway, or broker.

## Server-Owned Responsibilities

- Create remote upload sessions or staging sessions.
- Own credentials, bucket policy, NAS mount permissions, and broker authorization.
- Generate object keys and NAS target paths from application policy, not raw filenames.
- Treat uploaded filenames and metadata as labels only.
- Complete or abort remote uploads using recorded receipts.
- Clean up incomplete multipart uploads, abandoned TUS uploads, and staged NAS sessions.
- Verify stored artifacts against manifests before promotion.

## Safe Storage Policy

Use trusted application identifiers for storage layout:

```txt
inspection/{tenantId}/{manifestId}/original
```

Avoid layouts that embed raw user filenames or unvalidated metadata:

```txt
{filename}
{lotId}/{waferId}/{filename}
```

If user-provided labels are needed for search or display, store them as metadata after validation and sanitization. Do not use them as filesystem paths or object keys.

## TUS Gateway Shape

The browser can use `large-image-ingest/transport-tus` to upload original byte slices to a TUS-compatible endpoint. The server or TUS gateway should own:

- namespace selection
- authorization
- expiration policy
- termination cleanup
- final promotion into object storage or NAS
- final checksum or stored-file verification

## S3-Compatible Broker Shape

The browser can use `large-image-ingest/transport-s3` with an application broker. The broker should own:

- multipart upload creation
- presigned part URL generation
- object key generation
- ETag and checksum receipt validation
- multipart completion and abort
- lifecycle cleanup for incomplete multipart uploads

Do not return cloud credentials to browser code.

## NAS Gateway Shape

Browser code cannot write directly to SMB, NFS, NAS, WebDAV, SFTP, or local filesystems. Use `large-image-ingest/node` or an application gateway to stage chunks server-side, finalize under a lock, and verify the stored file.

The gateway should own:

- staging root and target root configuration
- target path generation from trusted IDs
- chunk checksum checks before finalize
- shared same-session mutation locking
- abandoned staging cleanup
- stored-file manifest verification

All gateway instances that can mutate the same session must share the same staging root and coordination configuration. The default file lock provider stores coordination under the staging root, so separate `createNasGateway` instances using that root serialize staging, finalization, cancellation, and expired-session removal for one session while independent sessions can proceed concurrently.

NAS session metadata is committed from a unique candidate beside `metadata.json` and promoted with a same-directory rename. Configure the staging directory on a filesystem that provides atomic rename visibility within one directory. Do not relocate metadata candidates to another mount or delete `metadata.json` before promotion, because either change would remove the last committed recovery point.

If a process terminates while holding a lock, configure and test the existing stale-lock policy for the deployment environment. A later coordinated mutation removes recognized abandoned metadata and chunk candidates; read-only session inspection ignores candidates and reads only committed `metadata.json`. Expired cleanup skips sessions with a live mutation lock rather than deleting active work.

## Logging

Log stable IDs, status, progress counters, and typed error codes. Do not log full manifests, raw metadata, resume records, presigned URLs, bearer tokens, credentials, or mounted storage paths.

Completion evidence is intentionally application-owned. Persist or sign the full `large-image-ingest.completion.v1` record only in an access-controlled audit store with an explicit retention policy. It can contain checksum values and a storage reference even though provider-specific payloads are excluded.

For routine logs, metrics, and support tooling, use `createSafeCompletionSummary(evidence)`. The summary allowlists evidence and manifest IDs, status, producer version, transport name, byte/chunk counts, checksum algorithms, and timestamps. It omits checksum values, filenames, customer metadata, upload IDs, resume handles, storage locations, and opaque provider data.

Treat `completed-unverified` as a successful transport outcome that still needs application policy. Do not promote it to evidence-grade storage merely because multipart completion, a tus final offset, or a NAS rename succeeded. Promote automatically only when `status === "verified"`, or route unverified outcomes to a separately documented verification job.

## Parallel Execution Capacity

Parallel chunks are an explicit transport capability, not a universal optimization. Before advertising `supportsParallelChunks: true`, ensure the broker or gateway can accept out-of-order independent chunks and complete from ordered receipts. Set server-side limits for requests per upload, tenant, and process; the SDK's client maximum of 32 is a safety ceiling rather than a recommendation.

Start with two to four active chunks and measure browser memory, proxy buffering, broker CPU, provider throttling, retry amplification, and completion latency. Official tus and S3 helpers remain sequential because their current implementations validate remote offset or broker receipt state one operation at a time.

## Multi-File Queue Capacity

The queue adds an outer admission boundary over independent sessions:

- `maxActiveItems` defaults to 2 and is capped at 32.
- `maxActiveBytes` defaults to 8 GiB and represents admitted source size, not exact resident memory.
- `maxQueuedItems` defaults to 1,000 and counts records until terminal removal.
- One oversized source may run only when the active set is empty.

Estimate peak request concurrency as active queue items multiplied by each session's `execution.maxParallelChunks`. Custom parallel transports can otherwise multiply broker, storage, and socket load quickly.

Treat `WebStorageQueueStore` as local durable intent, not background execution. It does not persist source bytes or browser file handles, coordinate tabs, or continue work after the page exits. On restart, reattach the exact source through `resolveSource` or `attachSource`; unresolved items cause no transport call.

Use safe queue summaries for logs and metrics. Raw queue records contain untrusted filenames for local metadata matching and must not be logged. A queue-store failure after remote completion is operationally significant but does not reverse the completed remote fact.

## Policy And Evidence Signing Operations

Run inspection policy evaluation after completion evidence is available. A failed policy report is not a transport failure; route it to the application's quarantine, manual review, or server re-verification workflow. Keep profile and policy IDs/versioned definitions in change control so historical reports remain interpretable.

Store raw evidence bundles and signed envelopes only in access-controlled audit storage. They contain the full manifest, customer metadata, filenames, checksum values, storage references, policy results, signatures, and key identifiers. Routine telemetry should use the safe evidence summary helpers.

Signing/verifier callbacks must connect to application-approved key custody and trust policy. Enforce algorithm allowlists, key status/rotation, certificate or public-key lookup, revocation, and tenant boundaries before returning true. The SDK checks canonical structure and SHA-256 payload linkage, but does not validate certificates, contact timestamp authorities, or assign legal/regulatory meaning.
