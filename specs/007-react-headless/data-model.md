# Data Model: React Headless Adapter

## Ingest Controller State

- `status`: `idle`, `starting`, or an existing upload session status
- `uploadedBytes`: acknowledged bytes
- `totalBytes`: active file size
- `progress`: normalized value from 0 to 1
- `snapshot`: latest detached full core snapshot when available
- `manifest`: completed manifest when available
- `error`: operation failure when available
- `recordId`: active persistent resume record identifier when available
- `observerFailure`: most recent contained observer failure when available

Each state update creates one new immutable top-level object. `getState` returns the same object until the next revision.

## Ingest Controller

- owns the file and base core options
- owns zero or one active core session
- owns zero or one active start/resume promise
- keeps a set of removable subscribers
- creates a fresh core session for a later operation after the prior operation settles

## State Transitions

```text
idle -> starting -> uploading -> completing -> completed
idle -> resuming -> uploading -> completing -> completed
any active state -> paused
any active state -> canceled
starting/uploading/resuming/completing -> failed
```

Observer failures update `observerFailure` but do not change `status`.

## Context Relationship

One provider holds one controller reference. Session, progress, and control hooks read the same controller state and actions. Unmount removes only the component subscription; it does not cancel the controller operation.
