# Data Model: 1.1.0 Operational Safety

## SafeEventSummary

Represents a log- and diagnostics-safe view of an ingest event.

Fields:

- `type`: Original event type.
- `manifestId`: Public manifest identifier when available.
- `recordId`: Resume record identifier when available.
- `uploadId`: Upload identifier when safe to expose.
- `status`: Session or resume status when available.
- `progress`: Optional uploaded and total byte counts.
- `chunk`: Optional safe chunk index and size.
- `error`: Optional typed code, message, and retryability.
- `redactions`: Optional list of field categories removed from the source event.

Validation rules:

- Must not include raw manifests, customer metadata, credentials, presigned URLs, resume tokens, opaque remote payloads, or full resume records.
- Must preserve typed codes and public IDs needed for support diagnostics.

## RedactedSnapshot

Represents a snapshot safe enough for default event flows or support diagnostics.

Fields:

- `manifestId`
- `status`
- `chunkPlan`
- `completedChunks`
- `uploadedBytes`
- `totalBytes`
- `createdAt`
- `updatedAt`
- `error`
- `redactions`

Validation rules:

- Transport session data must omit resume tokens, secret references, remote opaque data, and presigned locations.
- Receipt transport data must omit locations and opaque payloads.
- Redaction metadata must identify removed categories without storing removed values.

## RedactedResumeRecord

Represents a resume record safe for recovery lists and diagnostics.

Fields:

- `schemaVersion`
- `id`
- `manifestId`
- `file`: Safe file identity fields needed for user selection checks.
- `chunking`
- `transport`: Safe transport name and upload ID category when safe.
- `progress`
- `createdAt`
- `updatedAt`
- `redactions`

Validation rules:

- Must not include full manifest metadata.
- Must not include transport resume token, transport data, remote opaque payloads, credentials, or presigned URLs.
- Must retain enough status and progress information to determine whether the record is recoverable.

## RetryPolicy

Application configuration for retrying transient upload failures.

Fields:

- `maxAttempts`: Maximum attempts for a retryable chunk operation.
- `delayMs`: Initial delay before a retry attempt.
- `backoffFactor`: Optional multiplier applied after each failed retry.
- `maxDelayMs`: Optional upper bound for retry delay.
- `jitter`: Optional strategy for avoiding synchronized retry bursts.
- `isRetryable`: Optional application override for classifying safe retry cases.

Validation rules:

- Attempts and delay values must be finite, non-negative safe integers where applicable.
- Pause, cancel, validation failure, checksum mismatch, resume conflict, remote offset mismatch, expired resume state, and non-retryable transport errors must bypass retry.
- Retry events must expose attempt counts and retryability without sensitive transport data.

## IntegrationTarget

Opt-in external validation target for real infrastructure.

Fields:

- `kind`: `tus`, `s3-compatible`, or `nas`.
- `enabled`: Whether required environment is present.
- `requiredEnvironment`: Names of required variables or configuration fields.
- `cleanupPolicy`: How abandoned resources are removed.
- `sensitiveOutputPolicy`: Values that must not be printed.

Validation rules:

- Missing configuration must skip the target with a clear non-failing message.
- Partial configuration must not attempt real network or filesystem operations.
- Cleanup must be documented for success, failure, and interrupted runs.

## ServerExampleFlow

Documentation model for minimal server-side upload responsibilities.

Fields:

- `sessionCreation`: How the application creates a remote upload or staging session.
- `credentialBoundary`: Which credentials remain server-owned.
- `storagePolicy`: How object keys or NAS target paths are generated.
- `completion`: How receipts or staged chunks are finalized.
- `cleanup`: How incomplete work is removed.
- `verification`: How final stored artifacts can be checked.

Validation rules:

- User-provided filenames and metadata must be treated as labels, not trusted paths or object keys.
- Browser examples must not imply direct SMB, NFS, NAS, WebDAV, SFTP, or filesystem writes.
