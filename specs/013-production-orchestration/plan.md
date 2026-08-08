# Implementation Plan: Production Orchestration

## Summary

Ship v1.6.0 as a small framework-neutral queue layer over the existing single-file session. The queue owns admission, lifecycle coordination, detached operational state, durable intent records, and safe telemetry. Existing sessions continue to own validation, content-bound resume, upload, evidence, and transport semantics.

## Technical Context

- Language/runtime: TypeScript, ESM-first with existing CJS output, Node 20+, browser Web APIs.
- Dependencies: no new runtime dependency.
- Storage: provider-neutral async `IngestQueueStore`; browser `WebStorageQueueStore` adapter.
- Testing: Vitest synthetic `File` fixtures and fake transports/stores; no network credentials.
- Compatibility: additive root/core exports, unchanged single-session/React APIs, schema addition only for queue records.

## Constitution Check

- Original preservation: queue retains `File`/`Blob` references only in memory and never transforms them.
- Evidence integrity: queue delegates all checksum, resume, receipt, and completion evidence decisions to sessions.
- Provider neutrality: runtime session-options factory injects the transport; no provider SDK enters core.
- Bounded resources: deterministic item/byte admission with hard validated limits.
- Safe diagnostics: durable records exclude runtime/sensitive objects; safe summaries are allowlisted.
- Simplicity: one scheduler, one versioned record schema, no cross-tab or distributed coordination.

## Architecture

1. `src/queue.ts` contains the orchestrator, record validation, state machine, FIFO scheduler, and cloning helpers.
2. `src/web-storage-queue-store.ts` implements clone-safe browser persistence under a configurable key.
3. `src/queue-diagnostics.ts` produces safe queue snapshot/event summaries.
4. `src/types.ts` defines queue contracts and issue codes; `src/core.ts` exports them.
5. `schemas/queue.v0.1.schema.json` publishes the serializable record contract.

The scheduler admits from sorted sequence order while limits allow. Active work is a map of queue item ID to `LargeImageIngestSession`. Session callbacks update progress and resume record IDs. A fresh session is constructed for each admission; if an item has a resume record ID the session uses `resume(recordId)`, otherwise `start()`.

## Persistence Rules

- Enqueue persists before the item becomes visible/schedulable.
- Operational state transitions persist best effort while work is remote-in-progress.
- A pre-admission persistence failure fails the item before creating a session.
- A final completion persistence failure emits `queue.store_failed` but preserves completed runtime state.
- Restored records are validated as untrusted. `running` is normalized to `pending`; completed/canceled stay terminal; other recoverable states retain their semantics.
- Source resolution compares name, size, MIME type, and last-modified metadata before attaching. Session resume still verifies whole-file SHA-256.

## Scheduler Rules

- Defaults: 2 active items, 8 GiB active source bytes, 1,000 items.
- Hard limits: 32 active items, 100,000 items; byte limits are positive safe integers.
- FIFO by durable `sequence`, then item ID as a stable tie breaker.
- A source larger than the byte limit may run only with zero active items.
- Queue pause flips admission state before signaling active sessions.
- A settled item triggers another admission pass unless paused.

## Verification Strategy

- Contract tests for record parsing/schema and Web Storage clone behavior.
- Scheduler tests for defaults, hard bounds, FIFO, bytes, oversized items, pause/cancel/races.
- Recovery tests for restore normalization, resolver absence/mismatch, resume ID propagation, and store failures.
- Diagnostics/observer tests for detachment and redaction.
- Existing full suite plus build, package smoke, reference benchmark, dry-run, and dependency audit.

## Out Of Scope

- Cross-tab locking or leader election.
- Distributed/server queue services.
- Service Worker/background sync ownership.
- Persisting browser file handles or file bytes.
- Adaptive bandwidth estimation or a global per-request semaphore across arbitrary transports.
- React queue hooks or styled components in this release.
