# Quickstart Validation: Completion Integrity

## Prerequisites

```bash
npm ci
```

## Scenario 1: Cleanup Failure After Remote Completion

Use a fake transport whose completion succeeds once and a fake resume store whose deletion fails.

Expected outcomes:

- `completeSession` is called exactly once.
- The session resolves with its manifest.
- The final snapshot status is `completed`.
- A completed record remains when the store accepted the completion marker.
- `resume:cleanup-failed` identifies the delete operation.

## Scenario 2: Observer Failure During Upload

Use event and snapshot observers that throw for validation, chunk progress, and completion notifications.

Expected outcomes:

- Every planned chunk uploads exactly once.
- Transport completion executes exactly once.
- The final snapshot status is `completed`.
- `onObserverError` receives detached failure context.
- An exception from `onObserverError` does not reject the session.

## Scenario 3: Transport Completion Failure

Use a transport whose completion rejects while resume storage succeeds.

Expected outcomes:

- The session rejects under the existing transport failure behavior.
- No completed snapshot or cleanup warning is reported.
- The resume record is not deleted as completed cleanup.

## Verification

```bash
npm run typecheck
npm run typecheck:examples
npm test
npm run build
npm pack --dry-run
```

All commands must pass before the feature is considered ready for 1.3.0.
