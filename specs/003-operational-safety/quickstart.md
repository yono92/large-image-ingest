# Quickstart: 1.1.0 Operational Safety

Use this guide to validate the 1.1.0 planning scope once tasks and implementation exist.

## Default Verification

Default checks must stay local and credential-free:

```bash
npm run typecheck
npm run typecheck:examples
npm test
npm run test:integration
npm run build
npm pack --dry-run
```

Expected outcome:

- TypeScript API contracts compile for ESM and CJS outputs.
- Unit tests cover safe summaries, redaction, retry policy, and unchanged existing session behavior.
- No real TUS server, cloud credential, object storage bucket, or mounted NAS path is required. The integration harness skips all targets unless target-specific variables are configured.

## Safe Logging Validation

Run focused tests for diagnostics helpers:

```bash
npm test -- diagnostics
```

Expected outcome:

- Manifest-bearing events produce summaries without raw manifests or metadata.
- Snapshots omit transport resume tokens, secret references, remote data, receipt locations, and opaque receipt payloads.
- Resume records omit full manifests and sensitive transport state.
- Verification summaries preserve issue code, path, and severity without sensitive details.

## Retry Policy Validation

Run focused session retry tests:

```bash
npm test -- session
```

Expected outcome:

- Retryable chunk failures follow configured attempts and delay behavior.
- Durable checkpoints advance only after confirmed chunk success.
- Pause, cancel, resume conflicts, offset mismatches, validation failures, and non-retryable transport errors bypass retry.

## Opt-In Integration Validation

Default commands must skip all real infrastructure. Enable only the target being validated.

Verify default skip behavior:

```bash
npm run test:integration
```

Suggested environment variables:

```bash
LII_INTEGRATION_TUS_ENDPOINT=https://uploads.example.test/files
LII_INTEGRATION_S3_BROKER_URL=https://app.example.test/api/s3
LII_INTEGRATION_NAS_STAGING_ROOT=/mnt/inspection-staging/test
LII_INTEGRATION_NAS_TARGET_ROOT=/mnt/inspection-originals/test
```

Expected behavior:

- Missing variables skip the target with a clear message.
- Partial configuration does not perform real network or filesystem writes.
- Enabled targets clean up abandoned uploads, incomplete multipart uploads, or staged NAS sessions.
- Output must not include credentials, presigned URLs, raw customer metadata, full manifests, or sensitive resume records.

## Server Example Review

Review the 1.1.0 server-side example or guide before release.

Expected outcome:

- The example clearly identifies server-owned credentials and storage policy.
- User filenames and metadata are treated as labels, not trusted paths or object keys.
- Browser code does not write directly to SMB, NFS, NAS, WebDAV, SFTP, or local filesystems.
- Finalization and cleanup responsibilities are documented.
