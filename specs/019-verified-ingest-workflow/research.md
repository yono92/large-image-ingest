# Research: Verified Ingest Workflow

## Evidence-Backed Gap Analysis

### What is already authoritative

- Core already owns validation, manifest creation, chunk planning, upload retry, pause/cancel, snapshot state, durable resume, and completion. `LargeImageIngestSession.start()` creates or accepts the manifest, validates the domain-profile binding, delegates transport creation/upload/completion, and returns the manifest; `resume()` restores through the existing `ResumeStore` and transport recovery contract (`src/session.ts:118-180`, `src/session.ts:183-210`).
- Whole-file identity and recovery safety are established. Resume v0.3 binds a SHA-256 content identity and the active profile reference; mismatch categories include source, chunking, transport, profile, receipt, expiration, and terminal state (`src/types.ts:542-676`). Tests prove profile mismatch blocks before source hashing or transport mutation (`tests/domain-profile-session.test.ts`).
- Domain profiles already provide explicit baseline selection, deterministic effective-policy identity, safe evaluation, and a session binding. They deliberately perform no Blob read and reuse the manifest checksum (`docs/domain-profiles.md`, `specs/017-domain-validation-profiles/plan.md`).
- Provenance already models upload and verification outcomes, deterministic sequence authority, self-hash integrity, safe summaries, explicit disclosure, and an application-owned `ProvenanceSink`. Persistence failure is intentionally non-authoritative relative to upload or verification (`src/provenance.ts:17-340`, `specs/015-ingest-provenance/research.md`).
- Preservation already preflights and streams one verified ingest into a new BagIt 1.0 package or new OCFL 1.1 v1 object and validates the result. It deliberately rejects existing destinations and does not manage repositories, append OCFL versions, or own retention (`README.md:210-233`, `specs/016-preservation-interoperability/plan.md`).
- React UI already projects controller-authoritative upload states and runs an application-supplied verifier after transfer completion. The UI state reaches `verified` or `verification_failed`, but not provenance persistence or preservation (`src/react-ui/types.ts:12-28`, `src/react-ui/types.ts:84-120`, `src/react-ui/types.ts:150-175`).
- The package already has explicit additive subpaths and package-consumption tests. The current root quick start terminates at `const manifest = await session.start()` and does not compose the later evidence steps (`README.md:35-102`, `README.md:127-159`, `tests/package-exports.test.ts`).

### What remains application-owned today

1. Create a manifest early enough for profile evaluation, evaluate a selected profile, and pass its binding back to a core session.
2. Forward core events into a provenance recorder and translate the profile evaluation into provenance policy evidence.
3. Detect core completion without treating it as stored verification, invoke a verifier, translate its result into provenance, and choose retry behavior.
4. Seal and persist provenance, interpret sink failure without changing earlier authority, and retain enough coordination state for restart.
5. Optionally map verified inputs into preservation, materialize a new output, and keep preservation failure separate from upload/verification success.
6. Present one cross-stage typed result. Existing `UploadSessionStatus` ends at `completed`, `failed`, or `canceled` and therefore cannot express `uploaded_unverified`, `verified`, `evidence_persisted`, or `preserved` (`src/types.ts:508-518`).

This is a composition gap, not a missing low-level capability. The new layer should reduce application lifecycle coordination while leaving each existing subsystem authoritative for its own facts.

## Feature Split Decision

**Decision**: Implement one Feature 019, “Verified Ingest Workflow,” containing the orchestration facade and its versioned evidence bundle.

**Rationale**: The bundle is the typed durable result of the facade, not an independent user journey. Splitting it into a second feature would force the workflow either to ship without a stable result contract or to invent a temporary one. Preservation remains an optional adapter stage inside the same feature; preservation repository operation, OCFL append, and retention lifecycle remain out of scope rather than becoming a second feature.

**Alternative considered**: Two dependent features—(A) workflow orchestration and (B) evidence dossier/preservation lifecycle. This provides smaller reviews, but Feature A cannot satisfy restart, terminal-state, or audit-result requirements without most of B's schema. It also risks treating preservation repository operation as implied scope. Rejected for the first release.

## Public API Alternatives

### Alternative A — Dedicated browser-safe workflow subpath (recommended)

Add `large-image-ingest/workflow` with `createVerifiedIngestWorkflow()`, a discriminated workflow state/result, checkpoint and evidence adapters, and a preservation-handoff interface. Add Node convenience adapters under `large-image-ingest/node`; keep existing `core`, `profiles`, `provenance`, and `preservation` contracts independently usable.

**Advantages**:

- Makes the stronger end-to-end contract explicitly opt-in.
- Avoids changing the meaning of `LargeImageIngestSession.completed`.
- Keeps Node filesystem code unreachable from browsers.
- Allows one cross-stage state projection while delegating upload substate to the existing session.
- Provides an additive minor-release path and a clean package boundary for adoption evidence.

**Costs**:

- Adds one public subpath and a second handle for applications that need the full workflow.
- Requires a new checkpoint/evidence adapter contract and a React projection.
- Some types reference existing profile, provenance, and core types across modules.

### Alternative B — Expand `createIngestSession()` into the end-to-end facade

Add verifier, provenance sink, checkpoint store, and preservation options to `CreateIngestSessionOptions`; expand `UploadSessionStatus` beyond completion.

**Advantages**:

- One familiar factory and fewer imports.
- Existing React controller could surface the added states with fewer new entrypoints.

**Costs**:

- Changes the established meaning and duration of `start()`, `completed`, and error behavior.
- Couples browser-safe core to provenance and optional preservation concerns.
- Makes current users vulnerable to subtle behavioral and type changes even when they only want upload.
- Encourages a second implementation of upload recovery inside the expanded lifecycle or forces complex conditional semantics into the core session.

**Decision**: Reject. This is likely major-release behavior and conflicts with the requirement to preserve the existing authoritative session contract.

### Alternative C — Documentation-only composition helper functions

Publish independent functions such as `prepareVerifiedIngest()`, `verifyStoredIngest()`, and `persistIngestEvidence()` without a long-lived workflow handle.

**Advantages**:

- Smallest runtime addition.
- Every step remains explicit and independently callable.

**Costs**:

- The application still owns legal transitions, restart checkpoints, races, retry origin, and terminal-state interpretation.
- Does not materially improve the integrated control-plane experience.

**Decision**: Keep step functions internal or as narrow validators where useful, but do not present them as the primary API.

## Recommended Architecture Decisions

### Cross-stage orchestration, not upload reimplementation

The workflow owns only the sequence and cross-stage state. During `uploading`, the existing `LargeImageIngestSession`, `UploadSessionSnapshot`, `ResumeStore`, receipts, and transport remain authoritative. The workflow projects core events and snapshots; it does not plan chunks, mark acknowledgements, retry chunks, or decide which ranges to skip.

### Profile selection precedes preparation; evaluation follows manifest creation

The user-facing flow is “select profile → prepare manifest → evaluate profile → bind session.” Current profile evaluation requires an existing manifest so it can reuse whole-file SHA-256 and avoid a duplicate source traversal. Documentation must not claim that evaluation can precede the manifest.

### Required high-assurance inputs

The verified workflow requires an explicit domain profile, whole-file SHA-256, a stored-object verifier, durable checkpoint store, and durable evidence sink. Existing lower-level APIs remain the route for uploads that intentionally omit any of these. Preservation is optional.

### One evidence persistence boundary with immutable revisions

Use one application-owned `WorkflowEvidenceSink.persist()` boundary that receives the sealed provenance artifact plus a complete bundle revision under a stable operation ID and returns a safe reference. With no preservation, one terminal revision is committed. With preservation, revision 1 durably records the audit anchor and `preservation: pending`; after the handoff, revision 2 records its exact outcome under the same evidence ID and a distinct operation ID. Revisions are immutable and contiguous. The sink may implement a database transaction, idempotent object write, or application service call. The workflow uses existing provenance recording/sealing/validation, but does not pretend unrelated legacy sink calls are atomic.

If the preservation effect succeeds but revision 2 persistence is ambiguous or fails, retry/reconciliation targets only the final evidence revision. Preservation is not invoked again. A draft whose sink operation failed is never exposed as an authoritative bundle.

Existing `ProvenanceSink` remains supported independently. A documented adapter may wrap it, but such an adapter can reach `evidence_persisted` only after both provenance and bundle writes are durably confirmed and reconciled.

### Reconciliation before repetition

Transport completion remains governed by the existing transport/session behavior. New evidence and preservation adapters receive a stable operation ID and may expose `reconcile()`. If a call may have succeeded but its acknowledgement was lost, the workflow enters `reconciliation_required`; it never automatically repeats a non-idempotent external effect.

### Integrity and trust remain separate

The evidence bundle uses the existing RFC 8785 canonicalization and SHA-256 pattern over its authoritative body. This detects changes; it does not establish actor identity or trusted time. Optional external attestation references remain provenance/application-owned.

## Browser And Node Boundary

- `large-image-ingest/workflow` is browser-safe and imports no Node built-ins or Node-only preservation exporter.
- Browser applications normally call server/broker adapters for stored verification, evidence persistence, and preservation handoff.
- `large-image-ingest/node` may provide convenience adapters that wrap `verifyNodeFileManifest()` and the existing BagIt/OCFL new-output pipeline.
- `large-image-ingest/preservation` remains Node-only and unchanged in authority and scope.
- React and React UI consume the workflow state; they do not create a parallel orchestration state machine.

## Release Decision

**Decision**: Target a minor release, expected `v1.7.0`.

**Rationale**: The recommended approach is additive: one new subpath, new types, optional Node/React adapters, and documentation. Existing root/core/session methods, status meanings, schemas, and subpaths remain unchanged. A major release would be required only if implementation changes `createIngestSession()` completion semantics, makes the facade mandatory, removes exports, or changes existing schema interpretation.

## Resolved Product Decisions

1. An explicit domain profile is mandatory for `createVerifiedIngestWorkflow()`. Profile-free uploads continue through the lower-level core API.
2. One idempotent and reconcilable evidence sink persists the sealed provenance artifact and immutable evidence-bundle revisions. Each intended revision has one stable operation identity; preservation-enabled workflows use an initial pending revision and one final outcome revision under the same evidence ID. The legacy `ProvenanceSink` remains independently supported but is not the facade's durable transaction boundary.
3. Optional preservation starts only after durable evidence persistence so every preserved result has a retained audit anchor.
4. Cancellation after upload completion stops only unstarted downstream stages and returns `stopped` while retaining `uploaded_unverified` or later authority; it never relabels completed transfer as canceled.
5. The additive React projection is part of Feature 019 at P2 and is planned for the same minor release, because the integrated control-plane experience is a primary product outcome.

These decisions do not bring OCFL repository append, retention lifecycle, provider credentials, or external trust into scope.
