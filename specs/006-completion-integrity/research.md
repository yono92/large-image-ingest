# Research: Completion Integrity

## Decision: Treat Transport Completion As Authoritative

**Decision**: Once `completeSession` resolves, later local cleanup failures are non-fatal warnings and cannot change the upload result.

**Rationale**: Provider completion may be irreversible. Returning a failed session afterward invites duplicate completion or re-upload attempts and misrepresents durable remote state.

**Alternatives considered**:

- Preserve the current failure behavior: rejected because it conflates remote outcome with local housekeeping.
- Retry transport completion automatically: rejected because not every custom transport guarantees idempotent completion.

## Decision: Mark Completed Before Delete

**Decision**: Persist a completed record before applying `delete-on-complete`, then attempt deletion as best-effort cleanup.

**Rationale**: A crash or deletion failure leaves a terminal record instead of an active record that appears resumable. The existing v0.2 schema already supports `completed`, so no migration is needed.

**Alternatives considered**:

- Delete directly: rejected because deletion failure leaves an active record.
- Add a new remote-completed schema state: rejected for a patch because the existing completed status expresses the required recovery truth.

## Decision: Add A Non-Fatal Cleanup Event

**Decision**: Add `resume:cleanup-failed` with record ID, stable error code, cleanup operation, and sanitized error handling through diagnostic summaries.

**Rationale**: Applications need operational visibility without converting the upload promise into failure or exposing the full resume record.

**Alternatives considered**:

- Swallow cleanup failures: rejected because stale records need support and cleanup visibility.
- Reuse `resume:conflict`: rejected because the upload is complete and no recovery conflict remains.

## Decision: Isolate All Observer Boundaries

**Decision**: Wrap `onEvent` and `onSnapshot` calls, report failures through one optional `onObserverError` callback, and contain failures from that callback too.

**Rationale**: Caller observers are notification sinks, not transaction participants. One reporter keeps the public surface small and can support React, logging, and telemetry adapters later.

**Alternatives considered**:

- Let callback errors propagate: rejected because UI code can corrupt upload lifecycle semantics.
- Send observer failures through `onEvent`: rejected because an event observer failure would recursively report through the same failing observer.
- Log to the console: rejected because libraries should not produce default logs or leak sensitive errors.

## Decision: Keep Schemas And Transport Contracts Stable

**Decision**: Do not change manifest, resume record, or transport schemas for this 1.3.0 feature.

**Rationale**: The patch can be expressed through existing terminal status plus additive observer/event types, minimizing migration and custom-adapter risk.

**Alternatives considered**:

- Resume record v0.3: deferred to content identity and concurrent-claim work where a schema change provides material value.
