# Research: Persistent Resumable Upload

## Decision: Browser Resume Requires The File Again

**Rationale**: Browsers do not generally let a web application reacquire arbitrary local file bytes after a reload. A resume record can remember an upload session, but it cannot safely store or reopen the original image by itself. The application must ask the user to reselect the same file unless it separately uses optional browser capabilities such as File System Access handles.

**Alternatives considered**:

- Persist file bytes locally: rejected because multi-GB originals exceed practical quota, memory, and original-preservation expectations.
- Persist browser-specific file handles in core: rejected because the core package must remain framework-agnostic and portable.

## Decision: Store Resume State Separately From Final Manifests

**Rationale**: The ingest manifest is the traceability artifact. Resume state is operational state. Transport handles such as tus upload URLs, S3 multipart IDs, or gateway tokens can be sensitive and may expire. Keeping them in a separate resume record avoids turning the final manifest into a credential-bearing object.

**Alternatives considered**:

- Put all resume tokens into the final manifest: rejected because manifests may be shared for audit and should not carry sensitive operational handles by default.
- Store only a manifest ID and regenerate all other state: rejected because resumed uploads must preserve identity, metadata, validation outcome, and chunking consistency across process restarts.

## Decision: Use Compact Completed Chunk Ranges

**Rationale**: The current upload model is sequential, so the first implementation will normally store a single completed range plus `nextChunkIndex`. A range model remains compact and can later represent sparse completion if parallel upload is specified.

**Alternatives considered**:

- Store every completed chunk index: rejected because records can grow unnecessarily when chunk sizes are small.
- Store only uploaded byte count: rejected because chunk-based transports need chunk identity and range semantics.

## Decision: Core Owns Persistence Contracts, Transports Own Remote Truth

**Rationale**: The core can decide which chunks a local checkpoint says are complete. Only the transport knows whether a remote session still exists, expired, was finalized, or contains the expected bytes. Persistent resume must ask the transport to validate or refresh remote state before skipping local chunks.

**Alternatives considered**:

- Trust local resume records without remote validation: rejected because stale or mismatched remote sessions could corrupt an artifact.
- Put provider-specific resume validation in core: rejected because the core must remain provider-neutral.

## Decision: Provide A Small Web Storage Adapter And A Generic Store Contract

**Rationale**: Resume records are small metadata documents, so Web Storage can support a minimal browser persistence path without adding dependencies. An async `ResumeStore` contract keeps the core open to IndexedDB, encrypted, server-backed, or application-owned stores.

**Alternatives considered**:

- Ship only an interface: rejected because the MVP should demonstrate actual persistence without requiring every user to build storage first.
- Make IndexedDB the first built-in adapter: deferred because it adds more implementation complexity around async transactions, locking, and browser behavior.

## Decision: Keep Strong Whole-File Checksum Verification Out Of This Feature

**Rationale**: Strong checksum verification is important, but computing it for multi-GB files needs its own streaming, progress, worker, and UX design. The resume feature will use existing file identity metadata and leave cryptographic proof for a later checksum-focused feature.

**Alternatives considered**:

- Require whole-file SHA-256 before resume: rejected because it could delay recovery and duplicate future checksum work.
- Ignore file identity checks entirely: rejected because obvious mismatches must fail before upload.

## Decision: Treat Retry And Resume As Separate Behaviors

**Rationale**: The current retry loop can recover from transient chunk failures during one runtime. It cannot recover after reload because it has no persisted upload ID, manifest identity, chunk checkpoint, or transport token. Persistent resume is durable state restoration.

**Alternatives considered**:

- Rename current retry behavior as resumable: rejected because it would overstate reliability and leave refresh/crash recovery unsolved.
