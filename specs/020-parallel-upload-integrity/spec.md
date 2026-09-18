# Feature Specification: Parallel Upload Integrity

**Feature Branch**: `[020-parallel-upload-integrity]`

**Created**: 2026-09-18

**Status**: Implemented

**Input**: User description: "Define parallel-upload concurrency, resume, ordering, pause, and cancellation semantics first, then establish the per-chunk checksum policy that follows from those semantics."

## Clarifications

### Session 2026-09-18

- Q: What minimum checksum evidence must every parallel chunk provide? → A: Every chunk requires a locally calculated checksum; matching remote attestation is also required when the transport provides it.
- Q: Which official transports must support parallel transfer in the first release? → A: The provider-neutral contract and S3 path must support it; tus and NAS remain explicitly sequential until separately qualified.
- Q: What concurrency range should the first release accept? → A: Applications explicitly request 2–16 parallel chunks; the effective limit may be lower because of transport limits or remaining work.
- Q: How should pause treat chunks already in flight? → A: Stop new scheduling, request interruption when supported, wait for settlement, retain valid acknowledgements, and reconcile ambiguous outcomes on resume.
- Q: What should happen to sibling chunks after a permanent chunk failure? → A: Fail fast by stopping new scheduling and interrupting siblings when supported, while retaining valid acknowledgements and recording ambiguous outcomes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Transfer One Large Source In Parallel (Priority: P1)

As an application operator, I can opt one large source into a bounded parallel upload when the selected transport supports independent chunk transfer, so that high-latency or underutilized connections can complete faster without weakening source integrity or creating a second upload authority.

**Why this priority**: The feature provides value only if parallel work improves the existing single-source upload while preserving the same authoritative manifest, transport session, progress, and completion outcome.

**Independent Test**: Upload a multi-chunk source through a transport that allows several independently acknowledged chunks, deliberately return acknowledgements out of order, and verify bounded concurrency, monotonic unique-byte progress, canonical receipt ordering, and exactly one completion.

**Acceptance Scenarios**:

1. **Given** a transport that advertises safe parallel chunk transfer and an application that explicitly requests concurrency greater than one, **When** a multi-chunk source is uploaded, **Then** no more than the effective concurrency limit is in flight and each chunk is acknowledged at most once as durable progress.
2. **Given** chunks finish in a different order from their chunk indexes, **When** progress and state are observed, **Then** acknowledged unique bytes increase monotonically while missing chunks remain visible and completion waits for the entire plan.
3. **Given** all planned chunks have valid acknowledgements, **When** finalization begins, **Then** the transport receives one complete, canonical set of receipts and the source is finalized exactly once.
4. **Given** the transport does not advertise safe parallel transfer, **When** concurrency greater than one is requested, **Then** the request is rejected before session creation or remote mutation rather than silently running with different performance semantics.
5. **Given** no parallel option is selected, **When** an existing application starts or resumes an upload, **Then** the established sequential behavior and public outcome remain unchanged.

---

### User Story 2 - Resume Sparse Parallel Progress Safely (Priority: P1)

As an operator recovering after interruption or process restart, I can reuse every independently acknowledged chunk that still agrees with remote truth and can safely retransmit only work that is missing or unproven.

**Why this priority**: Parallel completion is naturally sparse. Treating progress as only a next offset could skip missing bytes, repeat expensive work, or join receipts from the wrong source or upload session.

**Independent Test**: Interrupt an upload after non-contiguous chunks have been acknowledged, discard all in-memory work, restore the exact source and persisted record, reconcile remote evidence, and verify that only missing or safely repeatable chunks are sent.

**Acceptance Scenarios**:

1. **Given** a durable record containing non-contiguous acknowledged chunks, **When** the exact source and matching transport session are restored, **Then** each reusable chunk is proven against local identity and remote truth before it is skipped.
2. **Given** a chunk request was in flight when the process stopped and no authoritative acknowledgement was persisted, **When** recovery occurs, **Then** that chunk is treated as ambiguous until the transport reconciles it or confirms that retransmission is safe.
3. **Given** remote truth proves a chunk that was not durably recorded locally, **When** its identity and required integrity evidence match, **Then** recovery may adopt it without retransmitting its bytes.
4. **Given** local and remote chunk evidence disagree, **When** recovery is attempted, **Then** no new bytes are sent until the conflict is rejected or explicitly reconciled.
5. **Given** a metadata-equal source with different content, a changed chunk plan, or a changed integrity policy, **When** resume is attempted, **Then** recovery is rejected before remote mutation or acknowledged-byte reuse.

---

### User Story 3 - Prove Each Acknowledged Chunk (Priority: P1)

As an integrity-conscious application, I can require an explicit per-chunk checksum policy that records what was calculated, what the transport required, and what the remote endpoint attested, without confusing chunk evidence with final stored-original verification.

**Why this priority**: Parallel acknowledgement order cannot be used as an integrity signal. Each durable chunk result needs an unambiguous identity and evidence policy before it may advance recoverable progress.

**Independent Test**: Exercise the unchanged sequential no-chunk-checksum path plus parallel locally calculated, transport-required, and remotely attested checksum policies with matching, missing, unsupported, and mismatched evidence, then verify which chunks become durable and which fail before checkpoint advancement.

**Acceptance Scenarios**:

1. **Given** a policy requiring a checksum for every chunk, **When** a chunk lacks supported checksum evidence or the evidence mismatches, **Then** the chunk is not acknowledged, persisted, or counted as completed.
2. **Given** a transport requires a particular checksum algorithm, **When** the application cannot provide it, **Then** the upload is rejected before the affected remote mutation.
3. **Given** both locally calculated and remotely attested values exist for the same algorithm and scope, **When** they differ, **Then** the chunk fails with an integrity conflict and is not retried as an ordinary transient failure.
4. **Given** a valid per-chunk checksum, **When** it is retained in an operational receipt, **Then** its algorithm, encoded value, byte range, source, and evidence role remain explicit.
5. **Given** every chunk satisfies its checksum policy, **When** the upload completes, **Then** whole-file identity and stored-original verification remain separate required evidence where already required; chunk checksums alone never claim the stored original is verified.

---

### User Story 4 - Pause, Cancel, And Retry Concurrent Work Predictably (Priority: P2)

As an application operator, I can pause, cancel, or retry a parallel upload and receive one stable outcome even when several chunk requests are completing at the same time.

**Why this priority**: Concurrent requests create races at the exact moments when operators need a trustworthy recovery choice. The system must settle those races before reporting a durable lifecycle state.

**Independent Test**: Trigger pause, cancel, retryable failure, permanent failure, and completion while multiple chunks are in flight; vary acknowledgement timing and verify the documented winning state, retained progress, remote abort count, and absence of late progress after the settled outcome.

**Acceptance Scenarios**:

1. **Given** a pause request during parallel transfer, **When** the request is accepted, **Then** no new chunks are scheduled, in-flight requests are asked to stop, valid acknowledgements that won the race are retained, ambiguous outcomes require reconciliation, and paused is reported only after all in-flight work settles.
2. **Given** a resume after pause, **When** retained and remote evidence agree, **Then** only incomplete chunks are scheduled and the configured concurrency bound is restored.
3. **Given** cancellation before authoritative completion, **When** cancellation is accepted, **Then** no new chunks are scheduled, in-flight work is stopped, remote abort is attempted at most once when supported, and no later chunk result changes the canceled state.
4. **Given** completion became authoritative before cancellation, **When** the cancellation race settles, **Then** the completed transfer remains authoritative and is not rewritten as canceled.
5. **Given** one chunk has a retryable failure, **When** policy permits another attempt, **Then** only that chunk is retried, successful chunks remain durable, and concurrency never exceeds its bound.
6. **Given** one chunk has a permanent integrity or policy failure, **When** the scheduler settles outstanding work, **Then** no additional chunks are scheduled, sibling requests are interrupted when supported, the failed state identifies the affected chunk safely, and already acknowledged progress remains available for an allowed recovery.

---

### User Story 5 - Understand Capability And Resource Boundaries (Priority: P2)

As an integrator, I can determine before transfer whether the chosen transport, checksum policy, and concurrency request are compatible, and I can observe bounded resource use without receiving credentials or raw provider evidence in normal diagnostics.

**Why this priority**: Parallelism should not be an implicit performance mode. Applications need deterministic admission decisions and safe operational visibility before using it for multi-gigabyte sources.

**Independent Test**: Evaluate compatible and incompatible capability combinations, inspect safe summaries, and run a large synthetic source through the maximum supported concurrency while measuring in-flight work and retained memory.

**Acceptance Scenarios**:

1. **Given** a requested concurrency and integrity policy, **When** compatibility is evaluated, **Then** the result identifies the effective bound, supported checksum evidence, resume limitations, and any blocking incompatibility before remote mutation.
2. **Given** the transport imposes a lower concurrency ceiling than the application requested, **When** the request is admitted, **Then** the effective bound is visible before transfer and never exceeded.
3. **Given** a large source, **When** it is transferred in parallel, **Then** resource use is bounded by the configured chunk size and effective concurrency rather than total source size.
4. **Given** progress, error, snapshot, resume, and diagnostic outputs, **When** they are inspected, **Then** credentials, presigned URLs, sensitive transport handles, raw provider errors, and unnecessary customer metadata are absent by default.

### Edge Cases

- A source has fewer chunks than the requested concurrency or contains a short final chunk.
- Concurrency is zero, negative, non-integral, above a transport ceiling, or too large for a bounded implementation.
- Several chunks complete in the same scheduling turn or return duplicate acknowledgements.
- A retry from an earlier attempt returns after a newer attempt for the same chunk has already succeeded.
- A pause or cancel request arrives between remote acknowledgement and durable checkpoint persistence.
- A process stops after remote acknowledgement but before the local receipt is persisted.
- Remote reconciliation reports a sparse set containing unknown, overlapping, duplicate, or out-of-plan chunks.
- The remote endpoint changes its advertised checksum capabilities between creation and resume.
- A checksum is validly encoded but uses the wrong algorithm, chunk range, source identity, or upload session.
- Local calculation succeeds but the remote endpoint omits a required attestation, or the remote endpoint attests an algorithm that was not requested.
- A transport supports parallel transfer but can reconcile only a contiguous offset.
- A transport accepts repeated bytes idempotently but cannot prove whether the first request succeeded.
- One chunk exhausts retry policy while other chunks are in flight.
- Finalization fails or its response is lost after every chunk is acknowledged.
- Cancellation races with finalization or with the last required chunk acknowledgement.
- An observer throws while several progress or receipt events are being reported.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Parallel transfer MUST be opt-in for one source; existing sequential uploads MUST remain the default and retain their behavior when parallel transfer is not selected.
- **FR-002**: The application MUST explicitly request an integer concurrency from 2 through 16 for parallel transfer; values outside that range MUST be rejected before remote mutation, and the effective concurrency MUST NOT exceed the request, the transport's advertised ceiling, or the number of remaining chunks.
- **FR-003**: A request for concurrency greater than one MUST be rejected before session creation or remote mutation when the transport cannot prove that independently addressed chunks are safe to transfer concurrently.
- **FR-004**: The transport capability description MUST distinguish parallel transfer, sparse recovery, safe retransmission or idempotency, checksum acceptance, checksum attestation, abort behavior, and finalization requirements.
- **FR-005**: Admission MUST validate the requested concurrency, chunk plan, transport limits, and checksum policy together before scheduling upload work.
- **FR-006**: The feature MUST keep one authoritative upload lifecycle, manifest, source identity, transport session, and completion boundary; it MUST NOT create a second upload state machine for parallel work.
- **FR-007**: No more than the effective concurrency may be in flight, and resource use MUST remain bounded by chunk size and effective concurrency rather than total source size.
- **FR-008**: Every scheduled attempt MUST retain the source identity, upload session, chunk index, exact byte range, attempt identity, and applicable integrity policy.
- **FR-009**: A chunk MUST become acknowledged progress only after the active transport accepts it and all required integrity evidence for that chunk is valid.
- **FR-010**: Progress MUST count unique acknowledged source bytes, MUST remain monotonic, and MUST NOT double-count retries, duplicate acknowledgements, or out-of-order completion.
- **FR-011**: Out-of-order acknowledgement MUST be supported without implying that earlier chunks are complete; missing, in-flight, acknowledged, retryable, ambiguous, and failed chunk outcomes MUST remain distinguishable.
- **FR-012**: Operational receipts MUST be canonicalized by chunk identity before finalization or durable export even when acknowledgements arrive out of order.
- **FR-013**: Finalization MUST begin only after every planned chunk has exactly one accepted authoritative receipt satisfying its integrity policy.
- **FR-014**: Finalization MUST occur at most once unless the transport explicitly supports reconciliation of an ambiguous finalization outcome; an unknown completion result MUST not trigger blind repetition.
- **FR-015**: Persistent progress MUST represent sparse acknowledged chunks and their required receipts without assuming a single next offset.
- **FR-016**: Restart recovery MUST validate whole-file source identity, manifest identity, chunk-plan identity, transport identity, upload-session identity, and integrity-policy identity before reusing progress.
- **FR-017**: In-flight work that lacks a durable authoritative acknowledgement after interruption MUST be classified as ambiguous rather than complete.
- **FR-018**: An ambiguous chunk MUST be reconciled against remote truth when supported; otherwise it may be retransmitted only when the transport proves repetition is safe, and MUST fail safely when neither condition holds.
- **FR-019**: Recovery MAY adopt remotely proven chunks missing from the local record only when their range, source, session, and required integrity evidence all match the active plan.
- **FR-020**: Unknown, overlapping, duplicate, out-of-plan, mismatched, or insufficiently proven remote chunk evidence MUST be rejected before new bytes are sent.
- **FR-021**: Resume MUST reject a changed chunk plan, source identity, transport, upload session, or integrity policy before remote mutation or acknowledged-byte reuse.
- **FR-022**: A pause request MUST stop new scheduling, request interruption of in-flight work when supported, retain valid acknowledgements that become authoritative before interruption, classify uncertain outcomes as ambiguous, and report paused only after all in-flight attempts settle.
- **FR-023**: Resume after pause MUST reconcile retained and remote evidence before scheduling only the remaining chunks under the effective concurrency bound.
- **FR-024**: Cancellation before authoritative completion MUST stop new scheduling, request interruption of in-flight work, attempt provider-side abort at most once when supported, and prevent late results from changing the settled canceled state.
- **FR-025**: If transfer completion becomes authoritative before cancellation, completion MUST remain authoritative and cancellation MUST NOT rewrite it as canceled.
- **FR-026**: A retryable chunk failure MUST retry only that chunk according to the existing retry authority while preserving other valid acknowledgements and the concurrency bound.
- **FR-027**: A permanent policy, identity, or checksum failure MUST stop new scheduling, request interruption of sibling attempts when supported, settle all outstanding attempts, preserve valid prior progress, classify uncertain sibling outcomes as ambiguous, and expose a typed safe failure for the affected chunk.
- **FR-028**: Every parallel chunk MUST have a locally calculated checksum before it can become acknowledged progress; when the transport provides checksum attestation, matching local and remote values for the negotiated algorithm MUST both be present before acknowledgement.
- **FR-029**: Each checksum value MUST identify its algorithm, encoded value, exact byte range, source identity, upload session, and evidence role; values with different algorithms or scopes MUST NOT be compared as equivalent.
- **FR-030**: Supported checksum algorithms and encodings MUST be negotiated against the active transport before affected bytes are sent; required unsupported algorithms MUST cause pre-mutation rejection.
- **FR-031**: When checksum evidence is required, missing, malformed, unsupported, mismatched, or conflicting evidence MUST prevent acknowledgement, checkpoint advancement, and completion for that chunk.
- **FR-032**: Integrity conflicts MUST NOT be treated as ordinary transient failures; any retry MUST require a policy-defined recovery decision that does not hide the prior mismatch.
- **FR-033**: Per-chunk checksum evidence MUST remain operational transfer evidence and MUST NOT replace whole-file content identity, manifest checksum evidence, or independent stored-original verification.
- **FR-034**: Checksum calculation MUST use bounded reads and MUST NOT require the entire source or all chunks to be retained in memory at once.
- **FR-035**: Safe events, snapshots, resume summaries, and diagnostics MUST expose concurrency, unique acknowledged progress, remaining work, and safe issue codes without exposing credentials, presigned URLs, sensitive transport handles, raw provider errors, or full operational receipts by default.
- **FR-036**: Observer failures MUST remain isolated from authoritative scheduling, acknowledgement, retry, pause, cancel, and completion behavior.
- **FR-037**: Official transport behavior MUST remain provider-neutral in the core contract; provider-specific checksum headers, receipt formats, reconciliation, and completion rules MUST remain adapter-owned.
- **FR-038**: The first release MUST qualify the provider-neutral parallel contract and official S3 path; every official transport MUST advertise only behavior supported by executable conformance evidence, with tus and NAS remaining explicitly sequential until separately qualified for parallel, sparse-resume, and checksum behavior.
- **FR-039**: Public contract and persisted-record changes MUST be versioned and must preserve deterministic handling of older sequential records without fabricating parallel or checksum evidence.
- **FR-040**: Documentation MUST define the concurrency, ordering, acknowledgement, retry, pause, cancellation, restart, reconciliation, checksum, finalization, and backward-compatibility semantics together with the limits of each integrity claim.

### Key Entities

- **Parallel Upload Policy**: The requested and effective concurrency, admission outcome, and limits governing one source transfer.
- **Chunk Attempt**: One bounded attempt to transfer an exact planned byte range, including its attempt identity and terminal outcome.
- **Chunk Outcome**: The current missing, in-flight, acknowledged, retryable, ambiguous, or failed state of one planned chunk.
- **Chunk Integrity Policy**: The algorithms, evidence roles, transport requirements, and agreement rules that a chunk must satisfy before acknowledgement.
- **Chunk Checksum Evidence**: A checksum value bound to an algorithm, exact range, source, session, and evidence role such as local calculation or remote attestation.
- **Sparse Progress Record**: Durable operational state identifying independently acknowledged chunks and the receipts required to recover them safely.
- **Remote Reconciliation Result**: Transport-owned evidence describing which chunks or offsets are authoritative, ambiguous, missing, or unsafe to reuse.
- **Canonical Receipt Set**: The unique, plan-ordered receipts accepted for finalization after every chunk satisfies its integrity policy.
- **Settled Control Outcome**: The stable result of pause, cancellation, failure, or completion after all concurrent attempts and races have been accounted for.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Under a reproducible latency-limited reference workload containing at least 32 equal-sized chunks, an effective concurrency of four completes transfer at least twice as fast as sequential transfer while producing the same whole-file identity and stored-original verification result.
- **SC-002**: Across concurrency limits from one through the documented maximum, observed in-flight work never exceeds the effective limit and retained source data remains bounded by the active chunk window rather than total source size.
- **SC-003**: Across ordered, reversed, randomized, and simultaneous acknowledgement schedules, 100% of runs report monotonic unique-byte progress, retain exactly one accepted receipt per chunk, and finalize exactly once.
- **SC-004**: Across interruption after every possible acknowledgement subset in the conformance fixture, recovery retransmits zero remotely proven chunks and never skips a missing, ambiguous, mismatched, or insufficiently proven chunk.
- **SC-005**: Across source, manifest, chunk-plan, transport, session, and integrity-policy mismatch fixtures, 100% are rejected before new remote mutation or acknowledged-byte reuse.
- **SC-006**: Across pause and cancellation races at every chunk boundary, 100% settle to one documented state, schedule no work after that state, and retain exactly the acknowledgements that became authoritative before settlement.
- **SC-007**: Across duplicate, stale-attempt, overlapping, out-of-plan, and late acknowledgement fixtures, 100% are ignored or rejected without duplicate progress, receipt replacement, or premature completion.
- **SC-008**: Across supported checksum policies, 100% of missing, malformed, unsupported, wrong-scope, and mismatched required evidence is detected before the affected chunk advances durable progress.
- **SC-009**: Across all successful fixtures, chunk checksum evidence is never reported as whole-file or stored-original verification, and final verification produces the same result as the established sequential path.
- **SC-010**: All pre-feature sequential session, resume, transport, verification, workflow, and package-consumption fixtures pass unchanged when parallel transfer is not selected.
- **SC-011**: Credential-free conformance covers every advertised official-transport combination of parallel transfer, sparse recovery, safe retransmission, checksum acceptance, checksum attestation, abort, and finalization behavior.
- **SC-012**: Safe-output inspection finds zero credentials, presigned URLs, sensitive transport handles, raw provider errors, full receipts, or customer metadata values in default events, errors, snapshots, and diagnostics.

## Assumptions

- The first release parallelizes chunks of one source within one authoritative upload session; it does not schedule multiple source files as a batch.
- Parallel transfer is opt-in and sequential concurrency of one remains the compatibility default.
- The first-release hard safety ceiling is 16 in-flight chunks for one source; transports and remaining work may reduce the effective limit.
- Explicitly requesting unsupported parallel behavior fails before mutation rather than silently falling back to sequential transfer.
- Pause uses cooperative interruption: stop scheduling, request in-flight interruption, then settle acknowledgements and ambiguities before reporting paused.
- Cancellation uses the same settling boundary and invokes transport abort at most once; an already authoritative completion cannot be undone locally.
- Whole-file SHA-256 identity remains the source-of-truth content identity on persistent and high-assurance paths.
- Every parallel chunk has a locally calculated checksum. Remote attestation is additionally required when the transport provides it, and per-chunk evidence does not replace whole-file checksum or stored-object verification.
- A transport may use provider-specific checksum algorithms or receipt fields, but algorithms and evidence roles remain explicit and provider behavior stays outside the core policy.
- The first release proves parallel behavior through the provider-neutral contract and official S3 path; existing tus and NAS paths continue to work sequentially and advertise no unqualified parallel capability.
- Existing completed-range records may represent sparse progress; migration never invents missing receipts, checksums, or remote attestations.
- The application selects concurrency and integrity policy appropriate to its deployment; automatic bandwidth-adaptive concurrency is deferred.

## Non-Goals

- Multi-file queues, batch scheduling, cross-file fairness, atomic multi-file completion, or cross-file rollback.
- Automatic bandwidth probing, adaptive concurrency, congestion control, or provider cost optimization.
- Changing chunk boundaries during resume, content-defined chunking, delta transfer, compression, encryption, erasure coding, or peer-to-peer transfer.
- Treating ETags, multipart aggregate values, offsets, or provider acknowledgements as whole-file hashes unless independently proven to have that exact meaning.
- Replacing whole-file source identity, final stored-original verification, manifests, provenance, evidence bundles, or preservation artifacts.
- Adding provider credentials, object-key policy, hosted coordination, or a provider-specific package to the framework-agnostic core.
- Requiring parallel tus or NAS transfer in the first release before each path has separate protocol or storage-semantics qualification.
- Guaranteeing higher throughput on every network, browser, storage target, or source size.
