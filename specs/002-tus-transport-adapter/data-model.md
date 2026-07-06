# Data Model: TUS Transport Adapter

## TusTransportOptions

Application configuration for one TUS-compatible transport instance.

Fields:

- `endpoint`: Remote upload creation endpoint.
- `headers`: Optional static request headers or request-time header provider.
- `metadata`: Optional allowlisted upload metadata mapping.
- `credentials`: Optional request credential policy.
- `chunkSizePolicy`: Optional policy for reconciling endpoint chunk limits with the ingest chunk plan.
- `fetch`: Optional request function override for tests or custom runtimes.

Validation rules:

- Endpoint must be absolute or application-resolvable before upload starts.
- Metadata keys and values must be sanitized before being sent.
- Sensitive headers must never be copied into default events or errors.

## TusUploadResource

Remote resumable upload resource created by a TUS-compatible endpoint.

Fields:

- `url`: Remote upload resource location.
- `uploadId`: Stable SDK-facing identifier derived from or associated with the resource.
- `offset`: Last remote byte offset acknowledged by the endpoint.
- `length`: Expected original file size when known.
- `expiresAt`: Optional remote expiration timestamp.
- `metadata`: Safe adapter-owned metadata.

Validation rules:

- Offset must be a non-negative integer and must not exceed original file size.
- Length must match the original file size when the endpoint provides it.
- Expired resources are not recoverable by default.

## TusResumeState

Adapter-owned resume state stored through the existing transport resume record.

Fields:

- `uploadUrl`: Sensitive remote upload resource URL or opaque handle.
- `offset`: Last validated remote offset.
- `expiresAt`: Optional expiration timestamp.
- `metadata`: Safe adapter-owned metadata needed for validation.

Validation rules:

- Must be validated by `resumeSession` before completed chunks are skipped.
- Must not be emitted through default events or logs.
- Must map into the existing provider-neutral transport state without changing core resume records.

## TusOffsetValidation

Result of comparing local checkpoint progress with remote upload progress.

Fields:

- `localOffset`: Byte offset implied by local completed chunks.
- `remoteOffset`: Byte offset reported by the remote endpoint.
- `status`: `matched`, `remote_behind`, `remote_ahead`, `missing`, or `expired`.
- `conflictCode`: Optional typed transport or resume conflict code.

Validation rules:

- Only `matched` allows skipped chunks to continue.
- `remote_behind` and `remote_ahead` must fail before upload bytes are sent.
- `missing` and `expired` must produce recoverable failure states without exposing sensitive handles.

## TusTransportFailure

Typed adapter failure that applications can turn into recovery UI.

Fields:

- `code`: Stable error code.
- `message`: Safe human-readable message.
- `retryable`: Whether retry can be attempted in the current session.
- `status`: Optional remote status category.
- `details`: Safe diagnostic details.

Validation rules:

- Permanent offset or resource conflicts are not retryable chunk failures.
- Sensitive headers, credentials, upload URLs, and full resume handles must be excluded.

## State Transitions

```text
not_created -> created
created -> uploading
uploading -> paused
uploading -> failed
uploading -> completed
paused -> uploading
failed -> uploading
created|uploading|paused|failed -> expired
completed -> terminal
expired -> terminal for default recovery
```
