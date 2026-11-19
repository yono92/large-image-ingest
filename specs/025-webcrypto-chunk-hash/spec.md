# Feature Specification: WebCrypto Chunk Hashing

**Status**: Implemented
**Created**: 2026-11-19

## Context

The roadmap proposed reading each byte once on the parallel path, feeding the whole-file hasher and the chunk hashers together. Measurement on a 1 GiB file with 8 MiB chunks (Node.js 22.14.0, Apple Silicon) showed reading costs about 4,500 MiB/s while built-in JavaScript chunk hashing runs at about 410 MiB/s. A single read would save about 0.2 s per GiB and move chunk hashing from the upload phase, where it overlaps network transfer, to before the upload starts. That item was replaced by faster chunk hashing: WebCrypto hashed the same chunks at about 1,800 MiB/s.

## User Story

As an application uploading in parallel, I want chunk integrity evidence computed faster, so that chunk hashing is less likely to limit upload throughput.

## Requirements

- **FR-001**: `calculateBlobSha256` MUST use `crypto.subtle.digest("SHA-256")` when WebCrypto is available and the blob is at most 64 MiB.
- **FR-002**: Larger blobs, or runtimes without WebCrypto, MUST use the existing streaming built-in hasher.
- **FR-003**: Digests, encodings, option validation, abort behavior, evidence format and public types MUST NOT change.

## Success Criteria

- Digest equivalence with `node:crypto` on both paths, including boundary sizes.
- Chunk hashing at least 3x faster than the built-in hasher on the measurement above.
