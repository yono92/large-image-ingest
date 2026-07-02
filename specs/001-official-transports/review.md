# Review Notes: Official Transport Adapters

## Review Pass 1: Product And Core Architecture

Status: completed.

Focus:

- Alignment with original-preservation principles.
- Compatibility with the current prototype core.
- Whether official transports can be added incrementally.
- Whether resumability is observable instead of hidden inside adapter memory.

Findings and resolutions:

- Chunk receipts needed stricter rules. The spec now requires receipt validation by chunk index and size, one successful receipt per chunk, and deterministic sorting before completion.
- Session snapshots needed a safer persistence model. The data model now distinguishes redacted event snapshots from caller-controlled full snapshots and adds `secretsRef`.
- Transport chunk constraints were too generic for S3. The capability model now includes final-chunk minimum behavior and part-number base metadata.
- NAS path safety needed a clearer statement. The spec now says user filenames and metadata cannot drive filesystem paths without sanitization and explicit policy.

## Review Pass 2: Protocol, Security, And Resume Semantics

Status: completed.

Focus:

- tus offset and extension behavior.
- S3 multipart completion, checksums, object keys, and cleanup.
- NAS gateway finalization and abandoned staging sessions.
- Sensitive resume material and event/log safety.

Findings and resolutions:

- tus requirements needed protocol-level details. The spec now calls out `OPTIONS` capability discovery, required headers, remote offset reconciliation, and replay avoidance.
- S3 completion needed a stronger source of truth. The spec now requires completion from recorded part receipts and treats list-parts responses as diagnostics or recovery checks, not the normal completion path.
- S3 object keys needed stronger trust boundaries. The plan and tasks now require broker or application policy to generate keys instead of raw user filenames.
- NAS finalization needed concurrency and cleanup rules. The spec now requires finalize serialization and cleanup or expiration for abandoned staging sessions.

## Remaining Design Questions

- Whether full snapshot persistence should include a pluggable secret store interface in core or remain application-owned for the first implementation.
- Whether whole-file checksums should be required during finalize for every transport or stay adapter/application-owned for the first implementation.
- Whether AWS S3 deserves a separate provider package after the generic S3-compatible multipart adapter stabilizes.
