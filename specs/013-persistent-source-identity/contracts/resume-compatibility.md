# Contract: Resume Compatibility And Migration

## Ordering Contract

For durable resume with acknowledged bytes, the implementation MUST complete these local checks before calling `transport.resumeSession`, `uploadChunk`, or `completeSession`:

1. Parse and validate the record schema.
2. Reject expiration and terminal state.
3. Normalize and require durable transport capability.
4. Compare transport and chunk-plan identity.
5. Establish a whole-file SHA-256 identity for the selected source.
6. Validate record content evidence and compare exact identity.
7. Validate transport-specific persisted evidence, including S3 receipts.
8. Return a typed compatibility outcome.

Any failure leaves transport mutation call counts at zero and preserves the record.

## Version Matrix

### V0.1

- Reader remains supported.
- Metadata fingerprint is never sufficient.
- Valid manifest whole-file SHA-256 may authorize exact-source comparison.
- Progressed S3 records remain incompatible because durable part receipts are absent.
- Progressed tus/offset-style records may resume only when exact content and offset evidence are valid.
- Promotion must not synthesize provider receipts.

### V0.2

- Reader remains supported and validates durable receipts.
- Valid manifest whole-file SHA-256 may become `ContentSourceIdentityV1` after exact-source comparison.
- Safe records may be written as v0.3 at the next authoritative checkpoint without changing manifest, transport state, receipts, or acknowledged progress.
- Missing whole-file evidence is restart-only at zero progress and incompatible once bytes were acknowledged.

### V0.3

- New writer schema.
- Strong content identity is mandatory and validated against source/manifest/chunk totals.
- Durable receipts remain mandatory and internally consistent.
- Exact source plus valid transport/chunk evidence is resumable.

## Non-Destructive Discovery

`parse`, store `get`, store `list`, safe-summary projection, and compatibility classification do not delete or rewrite records. Cleanup requires the existing explicit store deletion path/application confirmation. A new ingest may ignore a restart-only record but does not silently label it resumed.

## Promotion Contract

Promotion is allowed only when:

- the selected source digest matches trustworthy stored whole-file evidence;
- current transport evidence satisfies the transport's recovery mode;
- v0.3 can be represented without fabricated receipts or fields;
- a normal checkpoint is being persisted.

Promotion preserves:

- record ID and created time;
- full manifest and manifest ID;
- upload ID, resume token, expiration, and provider data;
- all receipts and receipt payloads;
- completed ranges, uploaded bytes, and next chunk index.

## Safe Outcomes

| Status | Application action |
| --- | --- |
| `resumable` | May call durable resume |
| `upgradeable` | May call durable resume; next safe checkpoint may write v0.3 |
| `restart_only` | Start a distinct ingest or explicitly clean up; do not skip bytes |
| `expired` | Present expiration and explicit cleanup/new ingest |
| `incompatible` | Preserve record; present safe guidance; do not call transport |

The outcome exposes no digest or provider evidence.
