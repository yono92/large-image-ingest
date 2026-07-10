# Data Model: Completion Integrity

## Remote Completion Outcome

Represents whether the transport completion boundary has resolved successfully.

- `pending`: completion has not resolved.
- `completed`: provider completion resolved and is authoritative.
- `failed`: provider completion rejected and existing session failure behavior applies.

This is runtime state and is not added to the manifest or resume record schema.

## Completed Resume Record

Uses the existing resume record with:

- `progress.status`: `completed`
- `progress.nextChunkIndex`: total chunk count
- acknowledged receipts preserved for diagnosis and verification
- `updatedAt`: completion marker time

The marker is persisted before optional deletion. Completed records are not recoverable uploads.

## Completion Cleanup Warning

- `recordId`: stable resume record identifier
- `code`: `resume.store_failed`
- `operation`: `mark-complete` or `delete`
- `error`: original caller-owned failure for direct observation; safe summaries sanitize its message

The warning does not change session status or promise resolution.

## Observer Failure Context

- `observer`: `event` or `snapshot`
- `eventType`: present for event observer failures
- `error`: original observer exception

The context contains no full snapshot or event payload. Failures raised by the observer-error reporter are discarded.

## State Transitions

```text
uploading -> completing -> remote completed -> completed snapshot -> completed result
                                  |                 |
                                  |                 `-> observer warning only
                                  `-> cleanup warning only

uploading -> completing -> transport failure -> failed snapshot -> failed result
```
