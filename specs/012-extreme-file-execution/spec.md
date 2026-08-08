# Feature Specification: Extreme-File Execution

**Feature Branch**: `012-extreme-file-execution`

**Created**: 2026-08-07

**Status**: Implemented

**Input**: User description: "Continue the commercial-readiness roadmap with extreme-file execution: off-main-thread checksum work, bounded parallel transfer, cancellation, and measurable resource limits without weakening evidence-grade integrity."

## User Scenarios & Testing

### User Story 1 - Hash Huge Sources Off The Main Thread (Priority: P1)

As a browser application developer, I can run whole-file SHA-256 work through a Web Worker-compatible executor so multi-gigabyte source hashing does not monopolize the UI thread.

**Independent Test**: Use a fake Worker-compatible endpoint to hash a synthetic Blob, observe ordered progress, cancel mid-flight, and verify the result equals the existing streaming implementation without changing source bytes.

**Acceptance Scenarios**:

1. Given a configured worker executor, when checksum calculation starts, then the file is processed by the worker protocol and the main API resolves with the same whole-file SHA-256 contract.
2. Given an active worker checksum, when its abort signal fires, then calculation rejects promptly, the worker is terminated, and no later progress or result callback is observed.
3. Given no worker configuration, when existing checksum APIs run, then current bounded `Blob.slice` behavior remains compatible.

### User Story 2 - Upload Independent Chunks In Bounded Parallel (Priority: P1)

As a platform engineer, I can opt into a bounded number of parallel chunk uploads when a transport explicitly advertises support, reducing wall-clock time without unbounded memory or request growth.

**Independent Test**: Upload a synthetic multi-chunk file through a concurrency-observing fake transport and verify the active count never exceeds the configured bound, completion receives ordered receipts, and default behavior remains sequential.

**Acceptance Scenarios**:

1. Given a parallel-capable transport and limit N, when an upload runs, then at most N chunk operations are active and all acknowledged receipts are normalized in chunk order before completion.
2. Given a transport that does not advertise parallel support, when concurrency above one is requested, then the session rejects before remote creation.
3. Given no execution option, when an upload runs, then exactly one chunk is active at a time.

### User Story 3 - Recover Safely From Parallel Partial Failure (Priority: P1)

As an operator, I can resume after one parallel chunk fails while successful siblings remain durably checkpointed and are not retransmitted.

**Independent Test**: Fail one chunk in a concurrent batch after sibling acknowledgements, inspect the durable record, resume in a new session, and verify only incomplete chunks are transmitted.

**Acceptance Scenarios**:

1. Given a parallel batch with mixed success and failure, when the batch settles, then every successful acknowledgement is validated and checkpointed before the first failure terminates the session.
2. Given an interrupted parallel upload, when it resumes with the exact source, then acknowledged sibling chunks are skipped and completion receives one receipt per chunk in deterministic order.
3. Given pause or cancel during a parallel batch, when in-flight operations settle, then successful acknowledgements remain recoverable and no new batch begins.

### User Story 4 - Enforce Explicit Resource Policy (Priority: P2)

As an SDK integrator, I receive typed validation when concurrency, worker protocol, or abort configuration is invalid, and I can observe the effective execution policy without sensitive data.

**Independent Test**: Exercise invalid limits, unsupported transports, malformed worker responses, and safe event/snapshot summaries while checking stable typed errors and zero source/provider leakage.

**Acceptance Scenarios**:

1. Given invalid or excessive concurrency, when session validation runs, then it fails before transport creation with a typed non-retryable error.
2. Given a malformed or mismatched worker response, when hashing runs, then it fails safely, terminates the worker, and ignores late messages.
3. Given execution diagnostics, when they are logged through safe helpers, then they expose limits and typed codes but no file, checksum, worker payload, or transport secret values.

### Edge Cases

- Zero-byte and single-chunk files with concurrency above one.
- Out-of-order parallel completion and receipt callbacks.
- Multiple failures within one batch.
- Pause or cancel while retries are active in multiple chunks.
- Resume-store writes that fail after some parallel acknowledgements.
- A worker posts progress after abort or posts a result for another request ID.
- A worker factory throws before a worker exists.
- The configured concurrency exceeds remaining chunks or a conservative SDK maximum.

## Requirements

### Functional Requirements

- **FR-001**: Checksum options MUST accept an optional executor and abort signal without changing the default whole-file SHA-256 result.
- **FR-002**: The SDK MUST provide a browser-safe Worker-compatible checksum executor and a separately exported worker runtime installer.
- **FR-003**: Worker execution MUST use a versioned request/response protocol, correlate messages by request ID, validate every response, and terminate after success, failure, or abort.
- **FR-004**: Worker and default checksum paths MUST preserve bounded source reads and MUST NOT decode, transform, or copy the entire source into a JavaScript byte array.
- **FR-005**: Abort MUST prevent subsequent progress/result delivery and produce a typed non-retryable checksum-aborted error.
- **FR-006**: Session options MUST accept an explicit `maxParallelChunks` execution limit with a default of one and a conservative hard maximum.
- **FR-007**: Concurrency above one MUST require `transport.capabilities.supportsParallelChunks === true` and fail before remote session creation otherwise.
- **FR-008**: Parallel scheduling MUST never exceed the effective limit and MUST begin no new work after pause, cancel, abort, or terminal failure.
- **FR-009**: Each acknowledged parallel result MUST pass existing receipt validation before it advances snapshot or durable resume state.
- **FR-010**: Successful siblings in a failed batch MUST be checkpointed deterministically before the session reports the batch failure.
- **FR-011**: Completion and completion evidence MUST receive exactly one ordered receipt per acknowledged chunk regardless of completion order.
- **FR-012**: Parallel retry behavior MUST remain per chunk and MUST preserve existing retryability, pause, cancel, and abort rules.
- **FR-013**: Existing sequential custom, tus, S3 multipart, resume, React, and evidence behavior MUST remain source-compatible by default.
- **FR-014**: Official tus and S3 transports MUST continue to advertise no parallel support until their protocol-specific implementations explicitly support it.
- **FR-015**: Public tests MUST cover concurrency bounds, ordering, mixed outcomes, durable resume, cancellation, worker parity, worker abort, malformed messages, original preservation, and diagnostics.
- **FR-016**: Documentation MUST state the worker bundler boundary, transport capability requirement, memory/request implications, and recommended conservative limits.

## Success Criteria

- **SC-001**: Worker and default checksum values match for all valid fixtures, including zero-byte and multi-slice files.
- **SC-002**: 100% of abort fixtures terminate their worker and emit no post-abort callback.
- **SC-003**: Observed active upload calls never exceed `maxParallelChunks` in covered schedules.
- **SC-004**: Mixed-result batches persist every successful receipt before failure and resume with zero retransmitted acknowledged chunks.
- **SC-005**: Default and official transport suites remain sequential and pass without configuration changes.
- **SC-006**: Invalid execution policy is rejected before any transport call.
- **SC-007**: Completion receipt order and receipt-set digest are deterministic across different completion schedules.
- **SC-008**: Source bytes are identical before and after worker hashing, parallel upload, interruption, resume, and completion.
- **SC-009**: Typecheck, examples, all tests, build, reference run, package dry-run, and dependency audit gates pass for the release.

## Assumptions

- Worker construction is application/bundler-owned through a small factory because CSP, bundler URL rewriting, and worker lifecycle policies vary.
- Blob/File structured cloning shares browser-managed backing storage and does not require building one whole-file JavaScript byte array.
- The initial hard concurrency maximum is 32; applications should use smaller values unless their transport and environment are measured.
- Parallel scheduling is batch-bounded for deterministic checkpointing; adaptive network probing and provider-specific multipart concurrency remain future adapter work.
