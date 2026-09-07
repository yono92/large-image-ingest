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

## Verified Workflow Adapters

The workflow facade keeps server policy application-owned. A deployment normally supplies four boundaries:

- the existing transport/broker adapter, which alone sees credentials and object keys;
- `StoredObjectVerificationAdapter`, which compares stored byte count and whole-file SHA-256 after transport completion;
- a compare-and-set `WorkflowCheckpointStore` containing only safe coordination references;
- an immutable `WorkflowEvidenceSink` that persists sealed provenance and bundle revisions under stable operation IDs.

Evidence sinks must enforce `expectedRevision`, reject replacement content under the same evidence ID/revision, and reconcile an ambiguous write by operation ID before allowing a repeat. Return a safe opaque reference, not a URL, object key, database connection string, provider receipt, or filesystem path.

`createNodeStoredFileVerifier()` wraps `verifyNodeFileManifest()` and receives its path from the application's trusted resolver. `createFilesystemPreservationHandoff()` similarly resolves the stored original and a new destination, then uses the existing BagIt or OCFL exporter. It does not derive either path from the uploaded filename or customer metadata.

The filesystem preservation adapter creates a new output only. A valid existing output for the same operation can be reconciled; an invalid or unrelated existing destination is failure. Operating an OCFL storage root, appending object versions, retention/hold policy, replication, backup, and disaster recovery remain server responsibilities outside this SDK.

## Logging

Log stable IDs, status, progress counters, and typed error codes. Do not log full manifests, raw metadata, resume records, presigned URLs, bearer tokens, credentials, or mounted storage paths.
