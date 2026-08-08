# Migrating To 1.6

Version 1.6 is additive. Existing `createIngestSession()` and React controller integrations require no changes.

## Adopt The Queue Only For Multi-File Policy

Use `createIngestQueue()` when the application needs bounded scheduling across multiple independent sources. Keep single-file flows on the existing session API.

The queue requires a `createSessionOptions(context)` factory. Build a fresh transport and return ordinary `CreateIngestSessionOptions` for each admission. Do not capture short-lived credentials earlier than necessary.

## Durable Recovery Boundary

`IngestQueueStore` records persist operational intent only. They intentionally exclude source bytes, live file objects, transport state, credentials, manifests, checksums, receipts, callbacks, and raw errors.

After a restart, provide `resolveSource(identity, itemId)` or call `attachSource(itemId, file)`. Metadata comparison is only a fast precheck. If a queue item has a session resume record, the session still calculates and verifies the v0.3 whole-file content identity before calling the transport.

## Resource Policy

The defaults are two active items, 8 GiB of admitted source size, and 1,000 stored items. The active-item hard maximum is 32 and the stored-item hard maximum is 100,000.

`maxActiveBytes` is not exact memory accounting: browsers may back Blob/File data outside the JavaScript heap. Also account for per-session `execution.maxParallelChunks`; potential active requests are approximately the product of the two configured concurrency limits.

## Operational Logging

Raw queue records include untrusted source names for reattachment matching. Log only `createSafeQueueEventSummary()`, `createSafeQueueSnapshotSummary()`, or `redactIngestQueueRecord()` outputs.

A queue-store failure after session completion does not make the remote upload incomplete. Handle the `queue:store-failed` event as durable-state drift and reconcile using completion evidence.
