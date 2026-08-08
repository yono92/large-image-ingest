# Feature Specification: Production Orchestration

**Feature Branch**: `013-production-orchestration`

**Created**: 2026-08-07

**Status**: Implemented

**Input**: User description: "Continue the commercial-readiness roadmap with multi-file queueing, global resource controls, durable queue recovery, framework-neutral orchestration, and operational telemetry."

## User Scenarios & Testing

### User Story 1 - Run A Bounded Multi-File Queue (Priority: P1)

As an application developer, I can enqueue many inspection sources and let a framework-neutral orchestrator start only the work permitted by explicit item and byte limits.

**Independent Test**: Enqueue synthetic files through fake sessions, run the queue, and verify FIFO admission, deterministic item state, and observed active work within both configured limits.

**Acceptance Scenarios**:

1. Given pending items and capacity, when the queue starts, then items are admitted in stable enqueue order and no more than `maxActiveItems` run.
2. Given an active-byte limit, when the next item would exceed it, then it waits unless it is the only active item, in which case one oversized item may run to prevent deadlock.
3. Given no explicit limits, when the queue runs, then conservative defaults apply.

### User Story 2 - Control Items And Queue Lifecycle (Priority: P1)

As an operator, I can pause, resume, retry, cancel, and remove work with predictable behavior and without losing successful session checkpoints.

**Independent Test**: Pause the queue during two active sessions, settle them as paused, resume selected items, retry a failed item, cancel a pending item, and remove only terminal items.

**Acceptance Scenarios**:

1. Given active work, when the queue is paused, then active sessions receive pause and no new item starts.
2. Given a failed or paused item, when it is retried or resumed, then the queue creates a fresh session and uses its durable resume record when one exists.
3. Given a pending or active item, when canceled, then it becomes terminal and is never admitted again unless explicitly re-enqueued.
4. Given a non-terminal item, when removal is requested, then removal fails with a typed error rather than orphaning work.

### User Story 3 - Restore Durable Queue Intent Safely (Priority: P1)

As an application developer, I can restore queue intent after process restart without serializing source bytes, transports, credentials, errors, or callbacks.

**Independent Test**: Persist queue records, construct a new orchestrator, restore them through a source resolver, and verify source-bound resume; unresolved sources remain `needs-source` and cause no transport call.

**Acceptance Scenarios**:

1. Given a configured queue store, when item state changes, then a versioned serializable record is written with operational metadata only.
2. Given a restored non-terminal record and an exact source, when restore runs, then the item becomes schedulable and existing session resume validation remains authoritative.
3. Given a missing or metadata-mismatched source, when restore runs, then the item remains `needs-source` and no session or transport is created.
4. Given running work at process loss, when restored, then it is normalized to recoverable pending intent rather than assumed active.

### User Story 4 - Observe Operations Without Leaking Data (Priority: P2)

As a platform operator, I receive queue snapshots and telemetry counters suitable for dashboards while safe summaries exclude filenames, source bytes, checksums, URLs, provider state, and raw errors.

**Independent Test**: Exercise every queue event with sensitive fixtures and verify deterministic counters, detached snapshots, observer isolation, and allowlisted safe summaries.

**Acceptance Scenarios**:

1. Given queue activity, when snapshot and event callbacks run, then aggregate counts, active bytes, total bytes, and per-item progress are current and caller mutation cannot alter internal state.
2. Given an observer that throws, when queue processing continues, then orchestration is unaffected and an observer-failure callback is notified safely.
3. Given a raw queue event or snapshot, when converted through safe diagnostics, then no source name, metadata, checksum, URL, transport handle, credential, or raw error value is present.

## Edge Cases

- Empty queues, zero-byte files, one item larger than the byte budget, and queue limits at their hard maximum.
- Duplicate explicit item IDs and store records with unsupported versions or invalid state transitions.
- Session construction failure before a snapshot exists.
- Queue pause racing with session completion or failure.
- Cancellation while an active session is settling.
- Store write failure before admission, during progress, and after remote completion.
- Source resolver throws, returns no source, or returns same metadata with different content.
- A subscriber mutates an event/snapshot or throws.

## Requirements

### Functional Requirements

- **FR-001**: The SDK MUST expose a framework-neutral multi-file ingest queue built on `LargeImageIngestSession` without changing the existing single-session API.
- **FR-002**: Queue options MUST accept `maxActiveItems`, `maxActiveBytes`, and `maxQueuedItems` with conservative defaults, positive safe-integer validation, and documented hard maximums.
- **FR-003**: Admission MUST be FIFO, deterministic, and bounded; one oversized source MAY run only when no other item is active.
- **FR-004**: Each item MUST expose stable typed states for `pending`, `needs-source`, `running`, `paused`, `failed`, `completed`, and `canceled`.
- **FR-005**: Queue and item lifecycle methods MUST include start, pause, resume, retry, cancel, terminal removal, source attachment, and immutable snapshot access.
- **FR-006**: Queue pause/cancel MUST stop new admissions before signaling active sessions and MUST retain underlying successful checkpoints.
- **FR-007**: Session construction MUST be application-owned through a factory so transport instances, credentials, callbacks, and provider policy are never serialized by the queue.
- **FR-008**: A versioned `QueueStore` contract and browser `WebStorageQueueStore` implementation MUST persist queue records using clone-on-read/write semantics.
- **FR-009**: Durable records MUST contain only item identity, source metadata identity, lifecycle state, progress totals, retry/resume references, timestamps, and a safe typed failure summary.
- **FR-010**: Durable records MUST NOT contain source bytes, `File`/`Blob`, manifests, checksums, transport sessions, receipts, URLs, credentials, callbacks, or raw errors.
- **FR-011**: Restore MUST validate untrusted records, normalize prior `running` items to pending recovery intent, and use an application source resolver or explicit source attachment.
- **FR-012**: Metadata mismatch or unresolved source MUST produce `needs-source` before session construction; exact content identity remains enforced by the existing session resume path.
- **FR-013**: Store failures MUST be typed and MUST prevent unsafe admission when initial intent cannot be persisted; post-completion persistence failure MUST NOT reinterpret remote completion as failed.
- **FR-014**: Queue snapshots MUST include aggregate state counts, active item/byte totals, total/uploaded bytes, and detached per-item operational snapshots.
- **FR-015**: Queue events MUST cover enqueue, restore, source-needed/attached, item start/progress/pause/fail/complete/cancel/remove, and queue pause/drain.
- **FR-016**: Observer failures MUST be isolated from control flow and reported through a separate observer-failure contract.
- **FR-017**: Safe queue diagnostics MUST allowlist operational IDs, states, counts, byte totals, timestamps, typed codes, and retryability while excluding sensitive values.
- **FR-018**: Public tests MUST cover bounds, fairness, oversized admission, lifecycle races, durable restore, invalid records, source mismatch, store failure, observer isolation, and diagnostic redaction.
- **FR-019**: The package MUST remain runtime-dependency-free and provider-neutral; React support remains optional and styled UI is out of scope.
- **FR-020**: Documentation MUST explain that active-byte limits are admission policy rather than exact memory accounting and that session-level parallelism can multiply network requests.
- **FR-021**: `maxQueuedItems` MUST count every stored item until explicit terminal removal, and queue run promises MUST settle only when the queue is paused or has no active or pending schedulable item.

## Success Criteria

- **SC-001**: Covered schedules never exceed the configured active item limit or active byte budget, except the documented single oversized item rule.
- **SC-002**: FIFO order is stable across repeated runs with the same enqueue and completion schedule.
- **SC-003**: 100% of restored unresolved or metadata-mismatched sources cause zero session/transport calls.
- **SC-004**: Previously running records restore as recoverable intent and never remain falsely active.
- **SC-005**: All persisted fixtures round-trip without source bytes, secrets, transport state, checksums, receipts, or raw errors.
- **SC-006**: Queue/item snapshots and callback payloads are detached from internal state in covered mutation tests.
- **SC-007**: Observer exceptions cause zero item state divergence and reach the observer-failure callback.
- **SC-008**: Existing single-session, transport, resume, React, and evidence suites remain compatible.
- **SC-009**: Typecheck, examples, all tests, build, reference run, package dry-run, and dependency audit gates pass for the release.

## Assumptions

- Default limits are two active items, 8 GiB of admitted source size, and 1,000 queued items; hard maximums are 32 active items and 100,000 queued items.
- A Blob/File reference is not equivalent to resident heap usage. `maxActiveBytes` is a workload admission signal, not a memory measurement.
- Durable recovery cannot portably retain browser `File` bytes or handles. Applications reattach sources or supply a resolver.
- The queue persists a session resume record ID observed from the session event stream; the configured session factory remains responsible for using the same resume store.
- Adaptive bandwidth control, service workers, background sync, cross-tab leader election, and distributed queues remain separate future work.

## Clarifications

### Session 2026-08-07

- Q: Should durable queue storage serialize files or transports? → A: No. Persist operational intent only and require safe runtime reattachment.
- Q: What happens when one file exceeds the active-byte budget? → A: Admit it only when it is the sole active item so the queue cannot deadlock.
- Q: Is queue resource control exact memory/network accounting? → A: No. It bounds admitted items/source sizes; session chunk concurrency remains separately configured and documented.
- Q: Should queue completion be rolled back when a final store write fails? → A: No. Preserve remote completion and emit a typed persistence warning/failure signal.
