# Research: Evidence-Grade Ingest Integrity

## Decision 1: Keep Intent And Completion As Separate Artifacts

**Decision**: Preserve `large-image-ingest.manifest.v1` as the pre-upload intent and source description. Add `large-image-ingest.completion.v1` as the immutable post-completion truth record.

**Rationale**: Existing manifests are created before transport state exists and expose `upload.status: "pending"`. Mutating them into final records would blur pre-upload identity with post-upload facts and make previously persisted manifests unstable. A separate completion record preserves compatibility and makes verified versus unverified outcomes explicit.

**Alternatives considered**:

- Mutate manifest v1 after completion: rejected because callers may have persisted or signed the original manifest.
- Introduce manifest v2 immediately: rejected because completion evidence can solve the truth gap without forcing every consumer through a manifest migration.

## Decision 2: Resume v0.3 Stores Whole-File Content Identity

**Decision**: Add `large-image-ingest.resume.v0.3` with a required SHA-256 content checksum in the file identity. Recalculate the selected source checksum before calling `transport.resumeSession`.

**Rationale**: Metadata fingerprints cannot distinguish different files with the same name, size, MIME type, and modification time. Existing manifests calculate whole-file SHA-256 by default, so v0.3 can reuse an already established source identity. Unsafe records without a source checksum are rejected instead of downgraded.

**Alternatives considered**:

- Sampled first/middle/last ranges: rejected because it is probabilistic and does not meet evidence-grade identity.
- Metadata plus per-chunk receipts: rejected because acknowledged receipts do not prove the unuploaded portion belongs to the same source.
- Store the source bytes: rejected for size, privacy, and constitution reasons.

## Decision 3: Core Derives Verification From Normalized Completion Facts

**Decision**: Allow `UploadTransport.completeSession()` to return an optional normalized completion result containing completion time, storage reference, stored size, and stored checksum. Core marks evidence verified only when source and stored sizes match and same-algorithm checksum values match.

**Rationale**: The transport or application broker is the only layer able to query provider state. Core can classify normalized facts without knowing S3, tus, NAS, or provider APIs. Existing transports returning `void` stay compatible and yield `completed-unverified`.

**Alternatives considered**:

- Trust a bare `verified: true` boolean: rejected because it cannot be independently checked or explained.
- Require every transport to return verification: rejected because many custom and tus endpoints expose completion without stored-object checksum access.
- Put provider response payloads in evidence: rejected because they are unstable and may contain sensitive identifiers.

## Decision 4: Do Not Treat Multipart ETags Or TUS Chunk Checksums As Whole-File Proof

**Decision**: Multipart ETags, part-level/composite checksums, and tus PATCH checksum success remain transport receipts unless an adapter returns an equivalent whole stored-object checksum and size.

**Rationale**: AWS documents that multipart ETags are not full-object MD5 values and distinguishes full-object from composite checksums. The tus checksum extension verifies each PATCH payload, not the final stored object. Both are useful transfer integrity evidence but neither alone proves equivalence to the manifest's whole-file SHA-256.

**Sources**:

- [AWS S3 object integrity](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html)
- [tus checksum extension](https://tus.io/protocols/resumable-upload)

**Alternatives considered**:

- Treat matching ETag as verification: rejected because multipart semantics vary and encryption can change ETag behavior.
- Treat complete tus offset plus chunk checksums as final verification: rejected because the server may transform or relocate data after accepting PATCH requests.

## Decision 5: Canonical Receipt Digest Uses Safe Normalized Fields

**Decision**: Sort receipts by chunk index and hash a canonical representation of chunk index, size, checksum, transport name, part number, ETag, and offset. Exclude locations and opaque values from the representation.

**Rationale**: The digest must be deterministic and trace the acknowledged set without copying sensitive or provider-specific data into completion evidence. Whitelisted scalar fields avoid unstable object-key ordering.

**Alternatives considered**:

- Hash raw JSON: rejected because key ordering and opaque data shapes are not stable.
- Include only chunk indexes: rejected because it does not bind sizes or provider receipt evidence.
- Embed all receipts in completion evidence: rejected because evidence would become large and sensitive.

## Decision 6: Ship JSON Schema Draft 2020-12 Files

**Decision**: Publish JSON Schema Draft 2020-12 documents for manifest v1, resume v0.3, and completion v1. Validate representative fixtures with a development-only validator while retaining existing typed runtime parsers.

**Rationale**: Draft 2020-12 is the current JSON Schema meta-schema and gives non-TypeScript consumers a stable validation contract. Test-only validation avoids adding runtime weight.

**Source**: [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)

**Alternatives considered**:

- TypeScript declarations only: rejected because persisted JSON may be consumed outside TypeScript.
- Runtime schema-validator dependency: rejected because current hand-written guards are smaller and already integrated with typed error contracts.

## Decision 7: Enforce Producer Version With A Release Gate

**Decision**: Centralize the SDK version in `src/version.ts`, use it for every newly produced artifact, and add a script that fails when it differs from `package.json`.

**Rationale**: Browser-safe core cannot read package metadata through Node filesystem APIs. A checked constant plus an automated release gate is simpler than build-time rewriting and works in ESM, CommonJS, tests, and source execution.

**Alternatives considered**:

- Import `package.json` at runtime: rejected because JSON module and CommonJS behavior complicate browser-safe output.
- Generate source during every build: rejected because verification commands would mutate the worktree.
- Leave per-module literals: rejected because the current 1.0.0/1.3.1 drift demonstrates the failure mode.

## Decision 8: Completion Evidence Is Observable, Not Persisted By Core

**Decision**: Add `getCompletionEvidence()` and include evidence on the typed completed event and React controller state. Applications decide whether and where to persist or sign it.

**Rationale**: Evidence persistence can involve regulated retention, signatures, databases, or audit services that do not belong in provider-neutral core. Returning the artifact keeps the SDK useful without inventing storage policy.

**Alternatives considered**:

- Reuse `ResumeStore`: rejected because resume cleanup policy and audit retention have different lifecycles.
- Add an evidence store interface now: rejected as an unrequested abstraction with no second implementation.
