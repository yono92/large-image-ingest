# Checklist: Persistent Resumable Upload

## Spec Consistency

- [x] Retry and persistent resume are defined as separate behaviors.
- [x] Browser resume requires the user to provide the same original file again.
- [x] Resume state is separate from the final ingest manifest.
- [x] Sensitive transport handles are not required in final manifests or default logs.
- [x] Resume file matching is specified before upload starts.
- [x] Chunking mismatch behavior is specified before upload starts.
- [x] Sequential upload remains the first implementation boundary.

## Plan Consistency

- [x] Public contracts include a versioned resume record.
- [x] Public contracts include an async resume store.
- [x] Session API uses explicit `resume(recordId)`.
- [x] Transport API includes a remote resume validation hook.
- [x] Checkpoint persistence happens only after confirmed chunk success.
- [x] Completion cleanup has a default behavior.

## Implementation Readiness

- [x] Main modules to edit are identified.
- [x] Typed resume error codes are named.
- [x] Test coverage areas are listed.
- [x] README update requirements are listed.
- [x] Official Spec Kit initialization is complete with Codex skills integration.
