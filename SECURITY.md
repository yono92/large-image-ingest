# Security Policy

## Supported Versions

Security fixes apply to the latest published version and the `main` branch.

## Reporting A Vulnerability

Please report security issues privately through GitHub Security Advisories when available.

Do not include presigned URLs, credentials, customer inspection metadata, or private sample images in public issues.

## Scope

Security-sensitive areas include:

- Upload session state and retry behavior.
- Manifest integrity and checksum handling.
- Presigned URL handling.
- Server-side adapters for object storage, NAS, WebDAV, SFTP, or filesystem targets.
- Filename and metadata validation.

## Evidence And Diagnostics

Completion evidence and persistent resume records are sensitive artifacts. They may contain whole-file checksum values, source labels, customer metadata through an embedded manifest, remote upload handles, storage hints, and provider receipts. Store them only in application-approved systems; the SDK does not define retention or access-control policy.

Do not place full completion evidence or resume records in logs, telemetry attributes, support tickets, or public error reports. Use `createSafeCompletionSummary()`, `createSafeEventSummary()`, and `redactResumeRecord()` for allowlisted operational views. Even safe summaries are correlation data and should follow the application's log-retention policy.

`verified` means core reconciled an equivalent whole stored-object checksum and byte size against the source. Multipart ETags, part checksums, successful tus PATCH checksums, final offsets, HTTP success, and filesystem rename success are not whole-object verification by themselves.

## Evidence Signing Boundary

Evidence bundles and signed envelopes are also sensitive. The SDK canonicalizes, hashes, envelopes, and validates linkage, but it does not own private keys, choose trusted algorithms, validate certificate chains, contact timestamp authorities, rotate keys, or interpret legal/regulatory validity.

Signing and verification callbacks must be backed by application-approved key custody and trust policy. Treat envelope algorithm labels and key IDs as untrusted input until the verifier confirms them. A `trusted: true` SDK result means the canonical digest and supplied callback passed; it is not a certificate, compliance attestation, or legal conclusion.

Do not log raw bundles, digests, signatures, key material, certificates, or provider errors. Use the safe evidence summary helpers and apply access control and retention even to those correlation fields.
