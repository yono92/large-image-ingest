# NAS Concurrency Compatibility Contracts

## Public Contract Stability

Version 1.3.1 preserves these exported contracts without signature or literal changes:

- `createNasGateway(options): NasGateway`
- `createNasFileLockProvider(options): NasGatewayLockProvider`
- `NasGateway` method signatures
- `NasGatewayLockScope = "finalize"`
- `NasGatewayErrorCode`
- `NasGatewaySessionMetadata`
- `large-image-ingest.nas-session.v0.1`
- `large-image-ingest.nas-lock.v0.1`

## Concurrent Staging Contract

- Successfully committed distinct indexes are all present in the next session snapshot.
- Same-index writes retain replacement semantics.
- A returned stage snapshot describes the chunk bytes committed by that operation.
- Different sessions do not block each other.

## Lifecycle Coordination Contract

- Stage, finalize, cancel, and removal of an expired session cannot mutate the same session simultaneously.
- Finalize retains `nas.finalize_locked` when its existing lock cannot be acquired immediately.
- A stage arriving after finalize or cancel is rejected by existing session-not-found, session-closed, or expiry behavior.
- Cleanup does not remove a session with a live mutation lock.

## Metadata Persistence Contract

- `metadata.json` is never deleted before a replacement is ready.
- Readers never intentionally consume temporary candidates.
- A failed candidate write leaves the prior committed metadata readable.
- A successful promotion exposes the complete next session state.
- Abandoned candidates are removed only while exclusive session coordination is held.

## Security And Logging Contract

- No chunk bytes, caller metadata, storage paths, credentials, or full session documents are newly logged.
- Existing path traversal, checksum, expiry, collision, and target overwrite validation remains in force.
- No network or cloud credential is required by default tests.
