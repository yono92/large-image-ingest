# Feature Specification: Official Transport Conformance

**Feature Branch**: `[014-transport-conformance]`

**Created**: 2026-08-31

**Status**: Implemented

**Input**: User description: "Demonstrate that the official S3, tus, and NAS paths preserve the same recoverability and integrity guarantees, while documenting protocol-specific differences and keeping real-provider qualification opt-in."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trust Recovery Across Official Transports (Priority: P1)

As an SDK integrator, I can choose any official transport and rely on the same safety outcomes when an upload is interrupted, resumed, completed, and verified.

**Why this priority**: A provider-neutral public contract is credible only when every official transport proves the recovery and integrity behavior it advertises.

**Independent Test**: Run the common conformance scenarios against each official transport target, force failures before and after acknowledged progress, and confirm that every target produces the required provider-neutral outcomes without reusing unsafe state.

**Acceptance Scenarios**:

1. **Given** an upload interrupted after acknowledged progress, **When** the exact source resumes through any official transport, **Then** only unacknowledged source ranges are transferred and the completed stored original passes size and whole-file checksum verification.
2. **Given** a different source with matching descriptive metadata, **When** resume is attempted, **Then** the attempt is rejected before remote mutation for every official transport.
3. **Given** a malformed, incomplete, duplicated, or transport-incompatible receipt set, **When** recovery or completion is attempted, **Then** the unsafe operation is rejected with a typed outcome and no false completion is reported.
4. **Given** a transport session that is missing, expired, behind, or ahead of local recovery evidence, **When** reconciliation runs, **Then** the result follows a documented safe action rather than silently trusting either side.

---

### User Story 2 - Understand Capability Differences Without Losing Safety (Priority: P1)

As a platform engineer, I can inspect a conformance report and understand both the guarantees shared by all official transports and the protocol-specific evidence used to satisfy them.

**Why this priority**: S3 multipart receipts, tus offsets, and NAS staging records are not structurally identical, but applications still need one accurate account of what each transport can safely do.

**Independent Test**: Compare the declared capabilities and observed conformance results for the three official transports and verify that every positive declaration has corresponding behavioral evidence and every unsupported behavior is absent or explicitly false.

**Acceptance Scenarios**:

1. **Given** an official transport capability summary, **When** it claims snapshot or persistent recovery, **Then** at least one successful interruption-and-recovery scenario demonstrates that exact claim.
2. **Given** a provider-specific limitation, **When** results are normalized, **Then** the limitation remains visible without leaking credentials, paths, object keys, upload locations, or raw provider receipts.
3. **Given** a conformance failure, **When** the report is reviewed, **Then** it identifies the failed invariant, scenario, transport category, and safe diagnostic category without exposing sensitive values.

---

### User Story 3 - Qualify A Real Deployment Target (Priority: P2)

As an operator, I can run the same conformance contract against an explicitly configured real or representative S3-compatible service, tus endpoint, or NAS mount before approving that target for production use.

**Why this priority**: Credential-free reference targets protect the default development workflow, while production environments still need evidence for their own provider, protocol implementation, mount semantics, and policies.

**Independent Test**: Opt into qualification for one configured target, execute the applicable common and transport-specific scenarios, and produce a versioned report containing environment, configuration categories, results, limitations, and cleanup status without secrets.

**Acceptance Scenarios**:

1. **Given** no explicit provider configuration, **When** the default suite runs, **Then** it uses credential-free test-owned targets and performs no external mutation.
2. **Given** explicit qualification configuration, **When** a real-target run completes, **Then** the report distinguishes verified behavior from skipped or unsupported scenarios.
3. **Given** a qualification run that creates remote or mounted staging data, **When** it succeeds or fails, **Then** cleanup status is reported and abandoned data can be identified safely without printing sensitive locations.

### Edge Cases

- Failure before any source bytes are acknowledged and immediately after the final source range is acknowledged.
- Loss of the response after a remote side accepts a chunk or completion request.
- A local recovery record that is behind or ahead of the provider's authoritative state.
- A transport session expiring between validation and the next remote action.
- Duplicate completion requests or concurrent attempts to resume the same session.
- S3-compatible behavior that differs from Amazon S3 multipart semantics.
- A tus endpoint that omits optional checksum, termination, expiration, or concatenation extensions.
- NAS locks, staged chunks, or metadata that are stale, partially written, or changed by another process.
- Sources with zero bytes, one chunk, a partial final chunk, and the maximum supported chunk count.
- Provider errors containing credentials, URLs, object keys, filesystem paths, or customer metadata.
- Cleanup that fails after the remote original is already durably completed and verified.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The feature MUST define one versioned conformance scenario catalog covering source validation, interruption, acknowledgement, durable recovery, reconciliation, completion, cancellation, and stored-original verification.
- **FR-002**: Every official S3, tus, and NAS transport path MUST be evaluated against every common scenario that applies to a capability it advertises.
- **FR-003**: Conformance MUST be based on observable safety outcomes and MUST NOT require provider-specific receipt formats or protocol operations to be identical.
- **FR-004**: Resume scenarios with acknowledged progress MUST establish strong whole-file source identity before any acknowledged source range is skipped or any remote recovery mutation occurs.
- **FR-005**: Exact-source recovery MUST transfer no source range already proven acknowledged by mutually consistent local and transport evidence.
- **FR-006**: Missing, malformed, duplicated, out-of-range, or transport-incompatible recovery evidence MUST be rejected before it can authorize source-range skipping or completion.
- **FR-007**: Each official transport MUST define safe reconciliation outcomes for missing, expired, locally-ahead, remotely-ahead, matched, and unverifiable session state where those conditions can occur.
- **FR-008**: Completion scenarios MUST distinguish successful transfer finalization from independent stored-original verification.
- **FR-009**: A transport MUST NOT report conformance for completion integrity unless the finalized stored original is verified against the manifest's expected byte count and whole-file checksum.
- **FR-010**: Duplicate or ambiguous completion outcomes MUST be reconciled without issuing more than one authoritative completion result to the application.
- **FR-011**: Capability declarations MUST distinguish generic resumability, in-process snapshot recovery, durable persistent recovery, abort support, expiration awareness, parallelism, and chunk-integrity support.
- **FR-012**: Every positively advertised recovery or integrity capability MUST map to at least one passing behavioral scenario; unsupported or unverified capabilities MUST be absent, false, or explicitly unqualified.
- **FR-013**: Results MUST use provider-neutral scenario and outcome categories while retaining a safe transport category and provider-specific limitation summary.
- **FR-014**: Conformance reports MUST be versioned and MUST record the scenario catalog version, library version, target category, environment, non-sensitive configuration, applicable scenarios, results, skipped scenarios, limitations, timing, and cleanup status.
- **FR-015**: Default conformance verification MUST be deterministic, credential-free, isolated, and safe to run without external services or durable production data.
- **FR-016**: Real-provider and mounted-NAS qualification MUST require explicit opt-in configuration and MUST never be part of credential-free default checks.
- **FR-017**: Routine results, errors, and diagnostics MUST NOT expose credentials, presigned URLs, bearer-style upload URLs, object keys, filesystem paths, customer metadata, full manifests, full recovery records, or raw provider receipts.
- **FR-018**: The source original MUST remain byte-for-byte unchanged throughout every conformance scenario; temporary targets and derivatives MUST remain separately identified.
- **FR-019**: A failed or skipped scenario MUST NOT be presented as verified, and a report MUST preserve the distinction between library behavior, representative-target behavior, and real-deployment qualification.
- **FR-020**: Conformance coverage MUST include successful cleanup, cleanup failure after completion, and abandoned-session reporting without changing an already authoritative upload result.
- **FR-021**: Existing custom transports MUST remain usable and MUST NOT be described as conformant unless they separately run and pass the applicable catalog.
- **FR-022**: Documentation MUST explain the shared invariants, protocol-specific evidence, target qualification boundary, result interpretation, and limitations of the evidence.

### Key Entities

- **Conformance Catalog**: A versioned collection of common and transport-specific scenarios with prerequisites, actions, expected outcomes, and required evidence categories.
- **Conformance Scenario**: One independently executable recovery, completion, integrity, security, or cleanup behavior.
- **Target Profile**: A non-sensitive description of the transport category and environment being evaluated, without credentials or secret locations.
- **Capability Claim**: One advertised behavior that must be supported by scenario evidence.
- **Conformance Result**: The outcome of one scenario, including pass, fail, skip, or unsupported status and safe diagnostic categories.
- **Qualification Report**: A versioned aggregation of target identity, catalog version, scenario results, limitations, and cleanup status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All three official transport categories pass 100% of common scenarios applicable to their advertised capabilities using credential-free representative targets.
- **SC-002**: Across source-mismatch scenarios, 100% of non-identical sources are rejected before remote recovery, transfer, or completion mutation.
- **SC-003**: Across interrupted-resume scenarios, zero source bytes covered by valid acknowledged evidence are retransmitted and every completed stored original matches the expected byte count and whole-file checksum.
- **SC-004**: Across malformed and conflicting recovery fixtures, 100% are rejected or mapped to a documented safe restart or cleanup outcome before unsafe source-range skipping.
- **SC-005**: Every positive official capability declaration has at least one passing behavior result, with zero capability claims supported only by static metadata or documentation.
- **SC-006**: Every generated report contains all required version, environment, configuration, scenario, evidence, limitation, and cleanup fields and can be interpreted without inspecting provider secrets.
- **SC-007**: Safe-output fixtures expose zero credentials, sensitive URLs, object keys, filesystem paths, customer metadata values, full manifests, full recovery records, or raw provider receipts.
- **SC-008**: Repeating the deterministic credential-free suite produces the same scenario statuses and integrity outcomes in 100% of ten consecutive release-gate runs.
- **SC-009**: A real-target qualification run clearly labels 100% of scenarios as passed, failed, skipped, or unsupported and never promotes an incomplete run to a conformant result.
- **SC-010**: Existing public upload and custom-transport behavior remains source-compatible, while conformance status is added only as evidence and never inferred from compatibility alone.

## Assumptions

- The persistent source-identity work in feature 013 is complete before durable resume conformance is treated as authoritative.
- Conformance means equivalent safety outcomes, not identical protocols, receipt shapes, throughput, or remote lifecycle operations.
- Representative credential-free targets are sufficient for default regression evidence but do not certify every production provider or mount configuration.
- Real-provider credentials, provisioning, cost control, retention policy, and service availability remain application and operator responsibilities.
- Performance comparison between transport providers is outside this feature; timing is recorded only to diagnose and reproduce conformance runs.
- The first catalog covers one active upload session per source; broad distributed ownership and cross-region failover require separate specifications.
- This feature does not add a production upload backend or make legal, regulatory, or provider certification claims.
