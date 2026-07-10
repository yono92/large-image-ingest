# Research: Resume Integrity Hardening

## Decision: Add Resume Record Schema v0.2 With Durable Receipts

**Decision**: New records use `large-image-ingest.resume.v0.2` and persist a deterministic, deduplicated `receipts` array alongside compact completed ranges. The reader recognizes both v0.1 and v0.2.

**Rationale**: S3 multipart completion requires the original part number and ETag. Ranges prove only that a chunk was acknowledged; they cannot reconstruct provider completion evidence. A schema version change makes the persistence contract explicit without changing the manifest schema.

**Alternatives considered**:

- Keep v0.1 and add optional receipts: rejected because persisted behavior would change without an identifiable schema revision.
- Store receipts only in transport `data`: rejected because receipt ownership, validation, and completion ordering are core session responsibilities.
- Reconstruct S3 receipts from list-parts: rejected because provider listings may be stale and the existing architecture defines acknowledged local receipts as authoritative completion evidence.

## Decision: Preserve v0.1 As A Recognized Legacy Variant

**Decision**: Public record types recognize v0.1 and v0.2. Newly created records are v0.2. Legacy records may resume only when their transport can prove recovery without missing receipt evidence. S3 rejects progressed v0.1 records before uploading; zero-progress records remain safe to restart against the existing multipart session.

**Rationale**: A minor release should not turn every stored record into an unreadable value, but it must not fabricate ETags. Transport validation is the correct boundary for deciding whether legacy evidence is sufficient.

**Alternatives considered**:

- Reject every v0.1 record: safe but unnecessarily breaks tus and zero-progress recovery.
- Automatically re-upload completed S3 parts: rejected because it violates the user-visible promise that acknowledged parts are skipped and may introduce new provider-side races.
- Fabricate generic receipts from ranges: rejected because it caused the original defect.

## Decision: Parse Persisted Values At Both Store And Session Boundaries

**Decision**: Export a record parser/validator for application stores, use it in `WebStorageResumeStore`, and validate again when a custom `ResumeStore` returns a record to a session.

**Rationale**: Built-in storage must not return unchecked casts, while custom stores are an external trust boundary. Defense at the session boundary guarantees malformed state cannot reach range hydration or a transport even when a custom store omits validation.

**Alternatives considered**:

- Validate only in Web Storage: rejected because custom stores remain untrusted.
- Validate only inside session resume: rejected because direct `get` and `list` consumers would still receive malformed typed values from the built-in adapter.
- Add a schema-validation dependency: rejected because the record shape is focused and the project intentionally has zero runtime dependencies.

## Decision: Validate Receipts Before Deriving Progress

**Decision**: For v0.2, receipts are the durable source for completed chunk evidence. The parser validates primitive shape; session validation checks receipt indexes, sizes, uniqueness, transport identity, completed ranges, byte totals, and next-chunk consistency against the active plan. Progress ranges are checkpoint summaries and must agree with receipts.

**Rationale**: Treating two independent fields as authoritative would permit contradictions. Receipt-first validation preserves provider evidence, while ranges remain useful for listing and progress UI.

**Alternatives considered**:

- Remove ranges in v0.2: rejected because ranges are already a useful public progress contract and removing them would increase migration impact.
- Trust ranges and loosely attach receipts: rejected because completion could receive missing or mismatched provider evidence.

## Decision: Add Optional Granular Resume Capabilities

**Decision**: Keep the existing aggregate `resumable` capability for compatibility and add optional `supportsSnapshotResume` and `supportsPersistentResume` booleans. Official transports set both explicitly. Core uses explicit `false` to reject unsupported paths and otherwise retains legacy hook-based behavior.

**Rationale**: Snapshot recovery and restart recovery have different persistence requirements. Optional fields improve application introspection without making existing custom transport literals fail type checking.

**Alternatives considered**:

- Replace `resumable` with a required enum: clearer but breaking for 1.x custom transports.
- Infer all capability from `resumeSession`: insufficient because one hook may support snapshot state but reject persistent records, as the S3 adapter currently does.

## Decision: Keep Concurrency And Content Proof Separate

**Decision**: Resume claims/CAS and checksum-backed file identity will receive separate future specifications.

**Rationale**: They affect store transactions and large-file compute policy independently from the receipt persistence defect. Separating them keeps this first implementation reviewable and matches the request to address findings one at a time.

**Alternatives considered**:

- Add revision claims and checksum verification now: rejected because it combines three independently testable architecture changes and increases migration risk.
