# Research: NAS Concurrency Integrity

## Decision 1: Reuse The Existing Shared Lock Contract

**Decision**: Treat the existing `"finalize"` lock scope as the compatibility-preserving exclusive session-mutation lock. Stage and cancel operations wait and retry for that lock; finalization preserves its current fail-fast contention error; expired-session cleanup attempts the lock once and skips a live session.

**Rationale**: The public lock-provider shape and scope literal remain unchanged, while default file locks already coordinate gateway instances and processes sharing one staging root. Serializing only same-session mutations eliminates lost updates without limiting independent sessions.

**Alternatives considered**:

- Add a new public `"session"` scope: rejected for 1.3.1 because it changes exported TypeScript contracts and custom-provider expectations.
- Use only an in-memory queue: rejected because it cannot coordinate separate gateway instances or processes.
- Reject every contended stage operation immediately: rejected because safe concurrent staging should complete rather than expose transient coordination as upload failure.

## Decision 2: Promote Same-Directory Metadata Candidates

**Decision**: Write each candidate to a unique temporary filename inside the session directory, then rename it over `metadata.json` without deleting the committed file first. Remove the candidate in a `finally` path when the process remains alive.

**Rationale**: A same-directory rename provides one complete visibility boundary and keeps the previous committed metadata available if candidate creation fails. Unique names prevent concurrent or abandoned candidates from colliding.

**Alternatives considered**:

- Write directly to `metadata.json`: rejected because readers may observe truncation and interrupted writes can destroy the only committed state.
- Remove `metadata.json` before rename: rejected because it creates a session-not-found window and loses the last valid state on failure.
- Maintain a journal or new generation field: rejected because it expands the schema and migration scope beyond a patch release.

## Decision 3: Clean Candidates Only Under Session Coordination

**Decision**: A mutating operation holding the session lock removes recognized abandoned metadata candidates before writing a new candidate. Read-only `getSession` ignores candidates and reads only `metadata.json`. Expired-session cleanup removes candidates only after acquiring the session lock.

**Rationale**: The lock proves no compliant writer is actively using another candidate. Read paths remain side-effect free and cannot delete a live writer's file.

**Alternatives considered**:

- Delete candidates on every read: rejected because a reader can race an active writer.
- Delete candidates solely by age: rejected because clock skew and long filesystem stalls can misclassify a live writer.
- Leave all abandoned candidates indefinitely: rejected because repeated process failures would accumulate storage debris.

## Decision 4: Preserve Same-Index Replacement Semantics

**Decision**: Concurrent writes to the same chunk index are serialized. The operation that commits last owns both the final chunk file and its metadata record.

**Rationale**: Existing behavior replaces a chunk record and file by index. Coordinating the file replacement and metadata commit under one lock fixes consistency without introducing a new duplicate-conflict contract.

**Alternatives considered**:

- Reject any duplicate index: rejected as a behavior change that can break retrying callers.
- Treat identical bytes as idempotent and reject different bytes: deferred because it adds checksum conflict semantics and potentially new error behavior.

## Decision 5: Validate With Real Filesystem Races And Failure Injection

**Decision**: Use real temporary directories and at least two gateway instances for concurrency coverage. Use controlled lock providers and targeted filesystem mocking only for commit-failure paths that cannot be made deterministic portably.

**Rationale**: The reported defect is a real read-modify-write race. Pure mocks would not prove the lock directory and rename behavior, while fault injection is still required for precise pre-commit failure assertions.

**Alternatives considered**:

- Unit mocks only: rejected because they cannot reproduce actual cross-instance filesystem interleaving.
- Stress tests only: rejected because failure timing would be nondeterministic and difficult to diagnose.

## Decision 6: Keep Release Scope Patch-Compatible

**Decision**: Update package metadata and release documentation to 1.3.1 without changing public signatures, literal unions, NAS session schema, runtime dependencies, or unrelated upload behavior.

**Rationale**: The release corrects data loss and persistence safety in existing behavior rather than adding a new public capability.

**Alternatives considered**:

- Combine content-based resume identity or manifest producer changes: rejected because those affect public persisted contracts and belong in a later minor release.
