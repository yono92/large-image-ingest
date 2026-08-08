# Migrating To 1.4.0

Version 1.4.0 is a backward-compatible API release with one intentional safety change: persistent resume no longer accepts progress that cannot be tied to trustworthy source bytes.

## Resume v0.3

New persistent records use `large-image-ingest.resume.v0.3`, include exact producer identity, and bind `file.contentIdentity` to the manifest's whole-file SHA-256 checksum. The SDK recalculates the reselected file checksum before calling `transport.resumeSession`.

- `resume.content_mismatch`: metadata may match, but source bytes do not. Ask the operator for the exact original or restart as a new upload.
- `resume.content_identity_missing`: checksum was disabled or a legacy record lacks trustworthy identity. Restart from byte zero; do not fabricate or copy a digest.

Persistent resume with `checksum: false` now fails before remote session creation. Non-resumable checksum-disabled uploads remain supported.

## Legacy v0.1 And v0.2

Legacy records remain parseable. They can resume when the embedded manifest has a valid whole-file checksum and the adapter has enough authoritative remote receipt state. Progressed S3 v0.1 records still fail with `resume.receipt_missing` because multipart ETags cannot be recreated safely.

Applications do not need to rewrite stored records. Let the SDK inspect them and surface the typed recovery outcome. A new upload creates v0.3 state automatically.

## Completion v1

Manifest v1 remains the pre-upload intent artifact and still reports `upload.status: "pending"`. After success, read the separate record from `session.getCompletionEvidence()` or the completed event.

- `verified`: stored size and equivalent whole-object checksum match the source.
- `completed-unverified`: transport completion succeeded without equivalent stored-byte proof.
- `completion.integrity_mismatch`: supplied stored facts conflict; no successful evidence is emitted.

Existing transports returning `void` from `completeSession()` remain valid and produce an unverified completion. Adapters may return `UploadCompletionResult` to supply normalized storage, size, and checksum facts.

## Producer Version And Schemas

Manifest, resume v0.3, and completion v1 artifacts identify producer version `1.4.0`. JSON Schema Draft 2020-12 contracts ship at:

- `large-image-ingest/schemas/manifest.v1`
- `large-image-ingest/schemas/resume.v0.3`
- `large-image-ingest/schemas/completion.v1`

Use compatibility fixtures before persisting a new artifact shape. Additive fields are accepted; unsupported schema versions return typed errors.

## Sensitive Data

Completion evidence can contain checksum and storage values. Resume records can contain manifests, remote handles, and receipts. Do not log either artifact directly. Use `createSafeCompletionSummary()`, `createSafeEventSummary()`, or `redactResumeRecord()` and keep durable evidence retention application-owned.
