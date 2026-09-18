# Research: Parallel Upload Integrity

## Decision 1: Extend The Existing Session With A Bounded Worker Pool

**Decision**: Keep the sequential loop as the compatibility path and add one opt-in fixed worker pool inside the authoritative session. Workers acquire missing chunks, but all successful acknowledgements pass through one serialized commit queue before progress, persistence, snapshots, or events advance.

**Rationale**: Promise completion is out of order, and concurrent `ResumeStore.put` calls can overwrite newer sparse progress with stale records. A serialized commit boundary preserves one state machine and deterministic durable authority without serializing network transfer.

**Alternatives considered**:

- A second parallel session class: rejected because it would duplicate lifecycle and recovery authority.
- `Promise.all` over every chunk: rejected because it is unbounded, cannot stop scheduling, and complicates retry and pause settlement.
- Let each worker persist independently: rejected because application stores do not promise compare-and-swap or transactional merging.

## Decision 2: Persist Parallel State As Resume v0.4

**Decision**: Add `large-image-ingest.resume.v0.4` with a parallel-policy identity, chunk-integrity-policy identity, sparse completed ranges, and evidence-bearing receipts. Continue parsing v0.1–v0.3; progressed legacy records resume only through their established sequential semantics and are never upgraded by inventing chunk checksums.

**Rationale**: v0.3 already supports sparse ranges and receipts, but it cannot prove that a restored session uses the same concurrency/integrity contract. A new schema makes changed policy rejection deterministic.

**Alternatives considered**:

- Add optional fields to v0.3: rejected because persisted meaning would change without a schema version.
- Store in-flight attempts durably: rejected because an in-flight local promise is not remote truth; interruption converts it to missing or ambiguous reconciliation work.

## Decision 3: Require Local SHA-256 Per Parallel Chunk

**Decision**: Calculate SHA-256 over each exact chunk before transfer, using bounded reads. Record encoding and evidence role explicitly. If the transport advertises remote checksum attestation, acknowledgement requires a same-algorithm byte-value match after encoding normalization.

**Rationale**: SHA-256 reuses the existing dependency-free implementation and gives every parallel receipt stable local evidence. Explicit local/remote roles prevent a provider response, ETag, or composite checksum from being mislabeled as whole-file verification.

**Alternatives considered**:

- Optional per-chunk checksum: rejected by the clarified safety policy.
- ETag as checksum: rejected because multipart ETags are not whole-file hashes and their meaning depends on upload and encryption details.
- Add CRC implementations immediately: deferred; first-release S3 qualification can use SHA-256 composite part checksums while future adapters add algorithms only with calculators and conformance.

## Decision 4: Qualify S3 With Composite Part Checksums

**Decision**: The S3 broker must initiate multipart upload with SHA-256 composite checksum semantics. The SDK supplies the Base64 SHA-256 value for each part, requires the S3 response attestation to match, retains the value in each completed-part record, and sends consecutive, canonically ordered part numbers at completion.

**Rationale**: AWS documents that S3 independently validates supplied upload checksums, returns part checksums, requires part-level values at composite completion, and requires consecutive part numbers beginning at one. This maps directly to fixed chunks and canonical receipts while keeping broker credentials and signing application-owned.

**Primary references**: AWS, [Checking object integrity for data uploads in Amazon S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html) and [Uploading and copying objects using multipart upload in Amazon S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html), reviewed 2026-09-18.

**Alternatives considered**:

- Full-object CRC64NVME for the first release: useful future optimization, but it would require a new calculator and does not satisfy the clarified local SHA-256-per-chunk rule.
- Trust response ETag only: rejected because it does not meet explicit algorithm and scope evidence requirements.

## Decision 5: Settle Lifecycle Races Before Publishing State

**Decision**: Pause, cancel, and permanent failure first close the scheduler, then request interruption of active attempts, await every worker, serialize any acknowledgement that became authoritative, and classify uncertain results as ambiguous. Only then may the session publish paused, canceled, or failed. Completion that became authoritative first remains completed.

**Rationale**: Publishing a lifecycle state while callbacks can still mutate receipts creates late progress and unsafe recovery choices. Settlement supplies one observable winner while preserving acknowledged work.

**Alternatives considered**:

- Drop all late successes: rejected because remote accepted bytes would become invisible.
- Drain in-flight requests without requesting interruption: rejected as the default because it increases pause and cancel latency and cost.

## Decision 6: Keep tus And NAS Sequential In This Release

**Decision**: Set S3 `supportsParallelChunks` only after qualification. tus and NAS continue to advertise false; their current behavior and recovery records remain unchanged.

**Rationale**: A normal tus upload has one authoritative offset, while safe parallelism requires additional protocol semantics such as concatenation. The NAS adapter currently prioritizes cross-process serialization and needs separate performance and locking research. Shipping explicit false capability is safer than a nominal parallel flag.

**Alternatives considered**:

- Implement all three transports together: rejected as unnecessary scope and a risk to already-qualified recovery behavior.
- Silently fall back to sequential: rejected because explicit parallel selection carries observable performance and integrity expectations.
