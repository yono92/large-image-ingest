# Public Contracts: Completion Integrity

## Observer Failure

```ts
export interface IngestObserverFailure {
  observer: "event" | "snapshot";
  eventType?: IngestEvent["type"];
  error: unknown;
}

export interface CreateIngestSessionOptions {
  onObserverError?: (failure: IngestObserverFailure) => void;
}
```

The callback is optional. Its own exceptions are contained. It receives no event or snapshot payload.

## Cleanup Warning Event

```ts
export type ResumeCleanupOperation = "mark-complete" | "delete";

export type IngestEvent =
  | ExistingIngestEvents
  | {
      type: "resume:cleanup-failed";
      recordId: string;
      code: "resume.store_failed";
      operation: ResumeCleanupOperation;
      error: unknown;
    };
```

The event is non-fatal. Safe event summaries include only stable identifiers, operation, code, and sanitized error details.

## Completion Ordering

```text
transport.completeSession()
resumeStore.put(completedRecord)  // best effort
resumeStore.delete(recordId)      // only for delete-on-complete, best effort
publish completed snapshot
publish completed event
resolve manifest
```

Failures before transport completion retain existing failure behavior. Failures after transport completion cannot reject the session result.
