# Feature Specification: Verified Ingest Workflow

**Feature Branch**: `[019-verified-ingest-workflow]`

**Created**: 2026-09-07

**Status**: Released in 1.7.0

**Input**: User description: "Unify explicit domain-policy evaluation, resumable transfer, independent stored-object verification, provenance sealing and persistence, and optional preservation handoff as one verifiable ingest workflow without replacing existing authoritative subsystems."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Complete One Verified Ingest (Priority: P1)

As an application integrator, I can run one source through an official workflow that prepares and evaluates its policy, uploads it resumably, verifies the stored original independently, and persists durable evidence, so that I do not have to coordinate each lifecycle boundary myself.

**Why this priority**: The main product gap is integration ownership. The existing capabilities are individually strong but do not provide one authoritative end-to-end outcome.

**Independent Test**: Run one valid source with application-supplied transport, verifier, and evidence persistence adapters; confirm the workflow reaches durable evidence completion, preserves the exact original identity, and reports each authoritative boundary distinctly.

**Acceptance Scenarios**:

1. **Given** a valid source, selected domain policy, resumable transport, stored-object verifier, and evidence sink, **When** the workflow succeeds, **Then** it reports preparation, transfer, independent verification, and durable evidence completion in order and returns one versioned evidence bundle.
2. **Given** transfer completion but no successful stored-object verification, **When** state is inspected, **Then** the workflow reports uploaded-but-unverified or verification-failed and never reports verified.
3. **Given** the workflow is not used, **When** an application uses existing core, provenance, preservation, Node, or React APIs, **Then** its behavior and public contracts remain unchanged.
4. **Given** a selected source, **When** any workflow stage runs, **Then** the original bytes are never decoded, resized, recompressed, rewritten, or stripped of metadata.

---

### User Story 2 - Recover Without Ambiguous Authority (Priority: P1)

As an operator, I can pause, cancel, retry, or continue after a process restart and can see which subsystem owns the current fact, so that acknowledged upload work is reused safely and failed post-upload steps do not corrupt transfer authority.

**Why this priority**: A control plane is credible only when recovery semantics remain explicit across process and system boundaries.

**Independent Test**: Inject interruption or failure at every workflow boundary, restore from retained workflow evidence with the exact source, and verify the documented retry point, idempotency key, remote-mutation count, and terminal state.

**Acceptance Scenarios**:

1. **Given** a paused or interrupted upload with durable resume state, **When** the exact source and matching policy are restored, **Then** the existing session recovery contract remains upload authority and acknowledged ranges are not retransmitted.
2. **Given** a metadata-equal source with different bytes, **When** restoration is attempted, **Then** it is rejected by whole-file identity before remote recovery or mutation.
3. **Given** upload succeeded but verification, evidence persistence, or preservation failed, **When** the failed stage is retried, **Then** upload is not repeated and the prior authoritative success remains visible.
4. **Given** cancellation before transfer completion, **When** the transport can abort, **Then** cancellation remains authoritative and no later stage starts; cancellation after upload completion does not rewrite the completed transfer as canceled.

---

### User Story 3 - Retain A Portable Evidence Dossier (Priority: P2)

As an auditor or downstream system, I can receive a versioned evidence bundle that references the manifest, policy evaluation, transfer result, verification result, provenance persistence, and optional preservation handoff without mixing operational secrets into durable evidence.

**Why this priority**: The workflow needs one stable result contract, but it must preserve the established separation among source description, recovery state, provenance, and preservation output.

**Independent Test**: Validate successful and failed bundle fixtures, mutate references and state claims, and inspect safe projections to prove cross-artifact integrity, terminal-state consistency, and non-disclosure.

**Acceptance Scenarios**:

1. **Given** a completed workflow, **When** its bundle is validated, **Then** every included reference agrees on source identity, manifest identity, policy identity, workflow state, and integrity status.
2. **Given** resume state or provider secrets exist during upload, **When** a bundle or default diagnostic is produced, **Then** neither contains the full resume record, credentials, presigned URLs, object keys, raw receipts, raw provider errors, or customer metadata values.
3. **Given** evidence persistence failed after a valid provenance artifact was sealed, **When** the workflow outcome is inspected, **Then** it does not expose the unpersisted draft as an authoritative bundle, distinguishes sealed evidence from durably persisted evidence, and exposes a retry-safe recovery action.
4. **Given** no external signature or trusted timestamp was supplied, **When** the bundle is inspected, **Then** it makes no claim of actor identity, trusted time, non-repudiation, regulatory compliance, or legal admissibility.

---

### User Story 4 - Hand Off To Preservation Deliberately (Priority: P2)

As a preservation integrator, I can optionally hand a verified, evidence-persisted ingest to an application-owned preservation adapter and observe whether the handoff was accepted, completed, or failed without turning the SDK into a preservation repository.

**Why this priority**: Preservation closes the evidence lifecycle for adopters that need it, but repository management is a separate operational concern.

**Independent Test**: Run the same verified ingest with no preservation adapter, a successful new-output export adapter, and a failing adapter; confirm all three preserve verification and evidence authority while reporting distinct final states.

**Acceptance Scenarios**:

1. **Given** preservation is not configured, **When** durable evidence is persisted, **Then** the workflow completes successfully at evidence persistence and reports preservation as not requested.
2. **Given** preservation is configured, **When** its application adapter succeeds, **Then** the workflow reports preserved and records only a safe handoff result reference.
3. **Given** preservation fails, **When** state is inspected or retried, **Then** verified and evidence-persisted authority remains intact and only preservation is retried.
4. **Given** an existing OCFL object or storage root, **When** the first workflow release is used, **Then** it does not append a version, manage repository history, apply retention, or claim repository conformance beyond the delegated adapter result.

### Edge Cases

- Policy evaluation passes with warnings, fails, or cannot evaluate required evidence.
- Process termination occurs before a stage begins, during an authoritative operation, or after success but before checkpoint persistence.
- A checkpoint write is lost while the external operation may already have succeeded.
- An upload completion response is lost and the application transport must reconcile the remote outcome.
- Stored verification returns unavailable, fails with retryable issues, fails permanently, or succeeds after a prior failure.
- Provenance sealing succeeds but its sink write fails or its success acknowledgement is lost.
- Preservation handoff is requested before verification or evidence persistence has become authoritative.
- A resumed workflow is supplied a different policy digest, manifest, transport category, or source bytes.
- Pause or cancel races with chunk acknowledgement, transfer completion, verification, or evidence persistence.
- Multiple callers try to continue the same workflow instance concurrently.
- A source has no whole-file SHA-256 because checksum generation was disabled.
- A future evidence-bundle version contains unknown fields or claims an unsupported terminal state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The feature MUST provide one opt-in, framework-agnostic orchestration workflow for one source from preparation through durable evidence and optional preservation handoff.
- **FR-002**: The workflow MUST compose existing authoritative policy, manifest, upload session, verification, provenance, and preservation capabilities rather than reimplementing their rules or creating a second upload state machine.
- **FR-003**: Existing public APIs and subpaths MUST remain independently usable and behaviorally unchanged when the workflow is not selected.
- **FR-004**: The workflow MUST preserve the exact input object passed to the authoritative upload session and MUST NOT decode, resize, recompress, rewrite, normalize, or strip metadata from the original.
- **FR-005**: Source identity MUST be based on a whole-file SHA-256, and a metadata-equal source with different bytes MUST be rejected before remote recovery, acknowledged-byte reuse, or other remote mutation.
- **FR-006**: The workflow MUST distinguish at least prepared, uploading, uploaded-but-unverified, verified, evidence-persisted, and preserved states.
- **FR-007**: Each workflow state MUST identify the subsystem whose output is authoritative and the durable evidence that supports the state.
- **FR-008**: Transfer completion MUST NOT imply stored-original verification, and stored verification MUST be supplied through an application-owned adapter.
- **FR-009**: The workflow MUST expose typed nonterminal, terminal-success, terminal-incomplete, canceled, and failed outcomes so callers cannot mistake a stopped or partially completed workflow for preserved success.
- **FR-010**: Pause, resume, retry, cancellation, and process-restart continuation MUST have explicit legal state transitions and typed invalid-transition outcomes.
- **FR-011**: Durable upload recovery MUST continue to use the existing resume record and session authority; the workflow checkpoint MUST reference but MUST NOT duplicate secret resume state.
- **FR-012**: The workflow MUST persist enough non-secret stage and idempotency evidence to continue after process restart without repeating already authoritative stages.
- **FR-013**: Every externally visible stage effect MUST define a stable application-visible operation identity and an idempotency or reconciliation rule.
- **FR-014**: A stage whose success acknowledgement is lost MUST enter a typed ambiguous/reconciliation-required outcome rather than being silently repeated when repetition could create duplicate external effects.
- **FR-015**: Upload retry MUST remain governed by the existing core session; post-upload retry MUST begin at verification, evidence persistence, or preservation as appropriate and MUST NOT recreate or re-upload the source.
- **FR-016**: Cancellation before upload completion MAY abort transport work, while cancellation after an authoritative upload completion MUST preserve that completion and stop only not-yet-started downstream work.
- **FR-017**: Verification failure, provenance persistence failure, and preservation failure MUST preserve all earlier authoritative successes and expose only the failed stage as retryable when policy permits.
- **FR-018**: The workflow MUST accept application-owned boundaries for transport/broker credentials, stored-object verification, evidence persistence, and optional preservation; it MUST NOT own credentials, object-key policy, external signing, trusted timestamping, or retention policy.
- **FR-019**: The browser-compatible workflow surface MUST contain no Node-only filesystem or preservation exporter dependency.
- **FR-020**: Node-only helpers MAY adapt stored-file verification and the existing BagIt/OCFL exporters to workflow boundaries without making them default or browser-reachable.
- **FR-021**: The first release MUST orchestrate exactly one source while using identities and result containers that do not require a breaking redesign to group multiple files later.
- **FR-022**: The feature MUST define a versioned evidence bundle distinct from the manifest, resume record, provenance artifact, diagnostics, and preservation package.
- **FR-023**: The evidence bundle MUST reference the manifest and exact source identity, applied profile evaluation, upload completion, independent verification, provenance seal and persistence, and optional preservation result.
- **FR-024**: The evidence bundle MUST include a current workflow state, terminal classification, stage attempts, stable operation identities, safe issue codes, and integrity protection over its authoritative fields.
- **FR-025**: The evidence bundle MUST distinguish absent, pending, succeeded, failed, unavailable, and not-requested evidence where those categories are meaningful; omission MUST NOT be interpreted as success.
- **FR-026**: Resume records, manifests, provenance artifacts, and workflow checkpoints MUST remain separate according to their operational role, retention expectation, and sensitivity.
- **FR-027**: Default diagnostics, events, bundle summaries, and persistence outcomes MUST NOT expose credentials, presigned URLs, object keys, raw provider errors, customer metadata values, full manifests, full resume records, or raw receipts.
- **FR-028**: Full bundle export MUST be explicit, version-validated, bounded to documented fields, and must not copy unknown future fields into safe summaries.
- **FR-029**: The workflow and evidence bundle MUST report integrity separately from external actor trust and MUST NOT claim trusted signing, trusted time, legal admissibility, or regulatory compliance.
- **FR-030**: Optional preservation success MUST mean only that the configured application-owned handoff completed according to its adapter contract; it MUST NOT imply repository management, OCFL version append, storage-root conformance, retention lifecycle, replication, or disaster recovery.
- **FR-031**: Provider qualification claims MUST remain separate from credential-free representative conformance, and workflow results MUST identify only the evidence category actually supplied.
- **FR-032**: Observer and callback failures MUST remain isolated from authoritative workflow operations and MUST be reported through typed non-sensitive outcomes.
- **FR-033**: Documentation MUST include a first-screen golden path of no more than 30 nonblank code lines plus detailed state, recovery, idempotency, trust, adapter, browser/Node, preservation, and migration guidance.
- **FR-034**: Public schema and API additions MUST be versioned, TypeScript-first, additive, and covered by package-consumption tests for ESM, CommonJS, browser-safe, Node, React, and existing subpaths.
- **FR-035**: When preservation is requested, the evidence sink MUST commit an initial preservation-pending bundle revision before handoff and a final outcome revision afterward under the same evidence identity but distinct stable operation identities; failure to persist the final revision MUST retry or reconcile evidence finalization only and MUST NOT repeat preservation.
- **FR-036**: New React and React UI projections MUST subscribe to workflow authority and expose its legal actions without duplicating workflow transitions or changing existing React controller and panel behavior.

### Key Entities

- **Verified Ingest Workflow**: One explicit orchestration handle that coordinates existing authorities for one source without replacing them.
- **Workflow State**: A typed projection of the last authoritative stage outcome, legal actions, safe issues, and supporting evidence references.
- **Workflow Checkpoint**: Restart-oriented, non-secret coordination state that references upload recovery and downstream operation identities without embedding credentials or full resume data.
- **Stage Attempt**: One invocation of a workflow stage with a stable operation identity, attempt number, outcome, and reconciliation status.
- **Evidence Bundle**: A versioned, integrity-protected dossier of cross-artifact references and workflow outcomes for one ingest.
- **Verification Adapter**: An application-owned authority that compares the stored original with manifest identity evidence.
- **Evidence Sink**: An application-owned durability boundary for the sealed provenance artifact and evidence bundle.
- **Preservation Handoff Adapter**: An optional application-owned boundary that may invoke existing Node exporters or another repository integration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A golden-path integration completes policy evaluation, resumable transfer, stored verification, provenance persistence, and optional preservation with no more than 30 nonblank application code lines, excluding adapter implementations and imports.
- **SC-002**: In the reference integration, application-owned lifecycle coordination responsibilities fall from the current measured 14 to at most 5 while preserving all existing safety invariants.
- **SC-003**: Every fixture for prepared, uploading, uploaded-but-unverified, verified, evidence-persisted, preserved, canceled, and failed outcomes maps to exactly one valid typed state and one documented authority.
- **SC-004**: Across injected restart points, 100% of already authoritative stages are not repeated; ambiguous external outcomes require reconciliation before retry.
- **SC-005**: Across metadata-equal/different-byte, policy-mismatch, manifest-mismatch, and resume-mismatch fixtures, 100% are rejected before remote mutation or acknowledged-byte reuse.
- **SC-006**: Across transfer, verification, evidence persistence, and preservation failure fixtures, 100% preserve all earlier authoritative successes and expose the correct next safe action.
- **SC-007**: Mutation tests detect 100% of covered evidence-bundle identity, state, stage-order, result-reference, and integrity changes.
- **SC-008**: Safe-output inspection finds zero credentials, presigned URLs, object keys, raw provider errors, customer metadata values, full manifests, full resume records, or raw receipts in default workflow diagnostics, events, checkpoints, and summaries.
- **SC-009**: Browser package checks prove zero Node built-in imports are reachable from browser-compatible workflow entrypoints, and large-source tests retain bounded reads without a source-size-linear application buffer.
- **SC-010**: All pre-feature public API fixtures and package-consumption tests pass unchanged, and consumers can continue using core, provenance, preservation, profiles, Node, React, and React UI separately.
- **SC-011**: Conformance tests cover every legal state transition, invalid transition, failure boundary, restart boundary, and idempotency rule in the published matrix.
- **SC-012**: Documentation and type-level examples distinguish credential-free representative conformance from real-provider qualification and make zero external signing, trusted-time, repository-management, or compliance claims.
- **SC-013**: For every preservation success, failure, and lost-finalization-acknowledgement fixture, the final durable bundle revision records the exact handoff outcome and no evidence-finalization retry invokes preservation again.

## Assumptions

- One workflow instance owns one source in the first release; a future batch coordinator may group independent workflow identities.
- Whole-file SHA-256 is mandatory for this higher-assurance workflow even though lower-level APIs retain their existing checksum configurability.
- A verified terminal success requires durable provenance and evidence-bundle persistence; preservation remains optional and, when omitted, evidence persistence is the successful terminal boundary.
- Profile selection remains explicit. The workflow may accept a bundled or derived profile definition but never infers a profile from the source.
- The application supplies transport/broker behavior, a stored-object verifier, one durable evidence sink, and any preservation handoff.
- The workflow checkpoint is stored through an application-owned store and contains only safe references needed to restart coordination.
- Existing provenance integrity remains self-hash integrity unless an application supplies independently verifiable attestation evidence.
- Preservation handoff may use the existing new-output BagIt/OCFL functions, but the workflow does not add repository operations.

## Non-Goals

- A central SaaS control plane, hosted coordinator, administrator console, or mandatory backend service.
- Upload transport or storage credentials, object-key policy, broker implementation, or provider-specific qualification.
- A second upload state machine, replacement resume record, replacement manifest, or replacement provenance artifact.
- Multi-file queues, atomic multi-file transactions, or cross-file rollback in the first release.
- OCFL storage-root operation, append/update of existing OCFL objects, arbitrary preservation import, retention scheduling, legal holds, replication, or disaster recovery.
- External signing, key management, trusted timestamping, actor identity proof, non-repudiation, legal admissibility, or regulatory certification.
- Image decoding, previews, derivative generation, resize, recompression, EXIF removal, pixel inspection, or source rewriting.
