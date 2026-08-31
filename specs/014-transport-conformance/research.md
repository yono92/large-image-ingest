# Research: Official Transport Conformance

## Decision 1: Compare Safety Outcomes, Not Receipt Shapes

**Decision**: Define common scenario outcomes and structured evidence categories while allowing each driver to use its native provider evidence.

**Rationale**: S3 multipart completion relies on ordered part numbers and ETags, tus recovery relies on an authoritative upload offset, and NAS uses staged chunk metadata plus filesystem locking. Treating these as one receipt format would either discard necessary semantics or falsely imply equivalence. The common layer instead evaluates invariants such as exact-source identity, mutually consistent acknowledged progress, zero acknowledged retransmission, one authoritative completion, and stored-original verification.

**Alternatives considered**:

- Normalize every provider receipt into one mandatory shape: rejected because an S3 ETag, tus offset, and NAS staged checksum do not prove the same fact.
- Test each transport independently with no shared catalog: rejected because capability claims and safety outcomes would remain incomparable.

## Decision 2: S3 ETags Are Completion Evidence, Not Whole-Object SHA-256

**Decision**: Require ordered part-number/ETag evidence to authorize multipart completion, but require a separate stored-object verifier against the manifest byte count and whole-file SHA-256 before the conformance scenario passes.

**Rationale**: Amazon S3 requires part numbers and returned ETags for `CompleteMultipartUpload`, but explicitly documents that a multipart object ETag is not necessarily the MD5—or any full checksum—of the completed object. S3 supports explicit checksum algorithms, yet S3-compatible providers may differ. Conformance therefore never promotes an ETag into source identity or stored-original verification.

**Primary references**:

- [Amazon S3 multipart upload overview](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)
- [Amazon S3 object integrity checks](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html)
- [CompleteMultipartUpload API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html)

**Alternatives considered**:

- Treat the final ETag as the original checksum: rejected by the provider's documented multipart semantics.
- Require every S3-compatible target to expose the same checksum headers: rejected because real compatibility profiles differ; unsupported capabilities must stay visible.

## Decision 3: tus Offset Is Authoritative Progress, Not Stored Integrity

**Decision**: Reconcile local acknowledged ranges with the tus server's `Upload-Offset`; treat offset mismatch/expiration as recovery outcomes, and separately verify the stored original after completion. Advertise per-chunk checksum only when the endpoint proves the tus checksum extension.

**Rationale**: tus 1.0.0 defines offset-based resume and optional expiration, checksum, termination, and concatenation extensions. The checksum extension validates one PATCH body and forbids offset advancement after mismatch; it does not replace whole-file stored-object verification.

**Primary reference**: [tus resumable upload protocol 1.0.x](https://tus.io/protocols/resumable-upload)

**Alternatives considered**:

- Infer checksum/termination/expiration support from protocol version: rejected because they are optional advertised extensions.
- Treat final offset equality as whole-file checksum evidence: rejected because byte count alone cannot detect same-size corruption.

## Decision 4: NAS Semantics Must Be Qualified Per Mount

**Decision**: Use the existing server-side NAS gateway for the credential-free target, including lock, staged-checksum, metadata, finalize, cancel, and cleanup paths. A mounted target is conformant only after the same scenarios run on that mount; local temporary-directory results do not certify remote filesystem locking, rename, durability, or permission semantics.

**Rationale**: Node exposes filesystem rename operations, but the behavior of network mounts and cross-process coordination depends on the actual filesystem and mount configuration. The existing gateway already keeps browser code away from SMB/NFS and contains the correct adapter boundary.

**Primary reference**: [Node.js filesystem API](https://nodejs.org/api/fs.html)

**Alternatives considered**:

- Declare every accessible mount NAS-conformant after an access check: rejected because access does not prove locking, staged integrity, finalize, or cleanup behavior.
- Add direct browser filesystem writes: rejected by the project constitution and browser security model.

## Decision 5: Conformance Status Belongs To Reports, Not Capabilities

**Decision**: Keep transport capability declarations as applicability inputs and derive `conformant`, `non_conformant`, or `incomplete` only from a complete report.

**Rationale**: A static `conformant: true` flag could become stale and would violate the requirement that every positive claim map to behavior evidence. The report binds a library version, catalog version, target class, scenario results, and cleanup status.

**Alternatives considered**:

- Add `conformant` to `TransportCapabilities`: rejected because compatibility metadata is not evidence.
- Infer conformance from existing unit tests: rejected because the result would not identify target class, environment, skipped scenarios, or cleanup.

## Decision 6: Use Structured Safe Observations

**Decision**: Drivers return only bounded booleans, counts, enum-like categories, safe slugs, and durations. The runner discards arbitrary exception messages and does not accept provider locations, raw receipts, manifests, resume records, metadata, or checksum values into reports.

**Rationale**: Redacting after serialization is less reliable than making sensitive values unrepresentable in the report contract. Digest correctness can be recorded as `storedChecksumMatched: true` without retaining the digest.

**Alternatives considered**:

- Store raw evidence and redact for display: rejected because raw reports would still be sensitive artifacts.
- Hash all sensitive values into stable report IDs: rejected for v1 because linkability may itself be sensitive and is not needed for conformance.

## Decision 7: Real-Target Execution Requires An Operator Driver

**Decision**: A repository command may load an operator-supplied module only when both an explicit opt-in flag and module path are present. The module implements the same target contract and owns credentials, provisioning, costs, and cleanup operations.

**Rationale**: A tus endpoint URL, S3 broker URL, or NAS path alone is insufficient to define safe lifecycle operations for every deployment. A driver boundary supports real targets without adding provider SDK dependencies or inventing broker contracts.

**Alternatives considered**:

- Upgrade existing URL/path preflights into a conformance claim: rejected because reachability is not behavioral evidence.
- Bundle AWS/tus server clients and mount orchestration: rejected as provider-specific scope and unnecessary runtime weight.

## Decision 8: Sequential Deterministic Catalog For v1

**Decision**: Run scenarios sequentially with isolated resources in the first catalog version and verify stable statuses across ten consecutive credential-free runs.

**Rationale**: Sequential execution makes cleanup, mutation counts, and ambiguous completion easier to audit. Parallel scenario execution can be added later without changing scenario semantics if runtime becomes material.

**Alternatives considered**:

- Parallelize all scenarios immediately: rejected because it complicates resource isolation and deterministic failure diagnosis without a stated performance need.
