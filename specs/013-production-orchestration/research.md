# Research: Production Orchestration

## Decision: Queue Above Sessions

The queue composes the existing public session instead of modifying its state machine. This preserves transport, resume, evidence, and observer compatibility and keeps multi-file policy optional.

Alternatives rejected:

- Merge queue state into `LargeImageIngestSession`: combines unrelated single- and multi-file responsibilities.
- Wrap transports with one global semaphore: cannot account safely for arbitrary adapter behavior and retries without a broader transport contract change.

## Decision: Persist Intent, Not Runtime Objects

Portable browser storage cannot safely serialize File bytes, AbortSignals, functions, transports, credentials, or live sessions. Queue records therefore store source metadata identity and progress references only. Applications resolve or reattach sources after restart.

## Decision: Metadata Precheck Plus Session Content Check

The queue rejects an obviously mismatched reattached source using metadata before constructing a session. Metadata equality is not trusted as content identity; session resume v0.3 whole-file SHA-256 remains the security boundary.

## Decision: Active Bytes Are Admission Policy

Blob size does not equal heap residency because browser implementations generally reference backing storage. The byte budget still provides a useful workload bound but must not be presented as exact memory accounting. Session chunk parallelism is orthogonal and can multiply active requests.

## Decision: Single Oversized Item Escape Hatch

Strict byte admission would deadlock any item larger than the configured limit. Admitting exactly one such item when the active set is empty preserves progress without allowing concurrent budget overflow.

## Decision: Clone At Every Boundary

Records, snapshots, and event payloads are cloned before storage or observation. This prevents consumers and storage adapters from mutating internal scheduling state.

## Decision: Preserve Remote Completion On Store Failure

Once a session completes remotely, a queue-store failure cannot undo the remote fact. Runtime state remains completed and a typed persistence event informs operators that durable queue state may lag.
