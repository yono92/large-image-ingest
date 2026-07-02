# Integration Test Policy

Default test commands must stay local and credential-free:

```bash
npm run typecheck
npm run typecheck:examples
npm test
npm run build
npm run smoke:exports
```

The default test suite should use in-memory fakes, mocked `fetch`, and temporary directories only. It must not require a real tus server, cloud credentials, object storage buckets, or mounted NAS paths.

## Opt-In Targets

Use opt-in integration tests for infrastructure-specific behavior:

- tus servers: offset reconciliation, expiration, termination, and resume token behavior against a real endpoint.
- S3-compatible storage: multipart upload creation, presigned URL CORS, ETag visibility, completion, abort, and lifecycle cleanup.
- NAS mounts: cross-process file locking, rename behavior, permissions, stale staging cleanup, and throughput under production-like mount options.

## Required Safeguards

Infrastructure tests should:

- Require explicit environment variables before running.
- Use dedicated test buckets, prefixes, directories, or tus namespaces.
- Generate object keys and target paths from test-owned prefixes only.
- Avoid logging credentials, presigned URLs, raw customer metadata, or full manifests.
- Clean up incomplete multipart uploads, staged NAS sessions, and server-side tus uploads after each run.
- Be excluded from default CI unless the CI job is explicitly configured for that target.

## Suggested Environment Variables

```bash
LII_INTEGRATION_TUS_ENDPOINT=https://uploads.example.test/files
LII_INTEGRATION_S3_BROKER_URL=https://app.example.test/api/s3
LII_INTEGRATION_NAS_STAGING_ROOT=/mnt/inspection-staging/test
LII_INTEGRATION_NAS_TARGET_ROOT=/mnt/inspection-originals/test
```

## Promotion Criteria

Promote an integration scenario into a repeatable test only when it covers behavior that fakes cannot prove, such as provider-specific offset handling, CORS header exposure, multipart lifecycle cleanup, mounted filesystem locking, or rename semantics.
