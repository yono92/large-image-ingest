# Research: TUS Transport Adapter

## Decision: Implement The MVP Adapter With Native Fetch

**Rationale**: The adapter needs a small subset of protocol behavior: create upload, inspect offset, upload bytes, and optionally complete/finalize through the existing session contract. Native `fetch`, `Headers`, `Blob.slice`, and `AbortSignal` are already available in the target browser and Node.js environments, keeping runtime dependencies small and aligned with the constitution.

**Alternatives considered**:

- Add `tus-js-client`: rejected for the MVP because it brings its own upload orchestration and persistence model that may overlap with the SDK's existing session and resume contracts.
- Require application-provided low-level request handlers only: rejected because the first real adapter should be usable without every consumer rebuilding protocol requests.

## Decision: Validate Resume With Remote Offset Before Skipping Local Chunks

**Rationale**: TUS-compatible servers expose remote progress as an upload offset. Persistent resume can only trust local completed ranges after the adapter confirms remote state. The adapter should compare remote offset with the byte position represented by local completed chunks and reject ambiguous states before sending more bytes.

**Alternatives considered**:

- Trust local resume records: rejected because remote sessions can expire, be deleted, or be modified by another actor.
- Always restart upload on mismatch: rejected because mismatch details are useful for safe recovery UI and diagnostics.

## Decision: Treat Offset Mismatch As A Typed Transport Conflict

**Rationale**: Offset mismatch is not a transient chunk retry. A lower remote offset could mean missing remote bytes, while a higher remote offset could mean remote state is ahead of local checkpoint or points to a different artifact. Both cases must stop before upload to avoid corruption.

**Alternatives considered**:

- Retry the current chunk: rejected because retry does not resolve conflicting remote truth.
- Advance local checkpoint to remote offset automatically: rejected because this can skip bytes without SDK-owned proof.

## Decision: Defer Strong Checksum Verification To A Separate Feature

**Rationale**: The TUS protocol has checksum-related behavior, but this SDK still needs a broader checksum design covering streaming SHA-256, per-chunk checksum fields, manifest checksum fields, and final server attestation. Folding that into the first adapter would make the feature too broad and risk duplicating future verification work.

**Alternatives considered**:

- Require checksums for every TUS chunk now: rejected because checksum strategy and manifest schema need their own spec.
- Ignore checksum entirely forever: rejected because inspection artifacts ultimately need stronger verification than metadata fingerprints.

## Decision: Keep TUS Metadata Allowlisted

**Rationale**: Upload metadata can include filenames, customer fields, storage hints, and sensitive identifiers. The adapter should require explicit metadata mapping so default requests send only intended fields.

**Alternatives considered**:

- Send the full manifest as upload metadata: rejected because manifests can contain customer metadata and may exceed reasonable header sizes.
- Send no metadata at all: rejected because endpoint-side routing and audit often need a small safe subset.

## Decision: Use Local Protocol Simulator Tests

**Rationale**: Default tests must not require external network access or credentials. A local in-memory simulator can cover creation, offset inspection, chunk acceptance, conflict responses, expiration, and completion semantics deterministically.

**Alternatives considered**:

- Run a real TUS server in default tests: rejected because it adds service lifecycle and dependency complexity.
- Test only adapter request construction: rejected because resume correctness depends on stateful protocol behavior.

## Sources

- TUS protocol reference: https://tus.io/protocols/resumable-upload
