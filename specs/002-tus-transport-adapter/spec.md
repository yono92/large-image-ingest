# Feature Specification: TUS Transport Adapter

**Feature Branch**: `002-tus-transport-adapter`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Prioritize the next Spec Kit feature for a real transport adapter. Start with a tus-compatible transport because it is the most natural fit for browser restart and resume, and it directly validates the persistent resume session contract. Keep strong checksum/verification and package structure cleanup as follow-up features."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload Through TUS-Compatible Transport (Priority: P1)

A frontend engineer configures a TUS-compatible endpoint and uses the SDK to upload a large inspection image through the existing ingest session flow without writing a custom transport from scratch.

**Why this priority**: This is the first real transport adapter and proves that the provider-neutral core can connect to a resumable upload protocol while preserving the original file.

**Independent Test**: Use a local fake TUS-compatible endpoint or protocol simulator to start an upload, send chunks, complete the upload, and verify that the ingest session observes progress and completion without mutating the original file.

**Acceptance Scenarios**:

1. **Given** a configured TUS-compatible upload endpoint, **When** an operator starts an ingest session for a large image, **Then** the adapter creates a remote upload session and uploads the original bytes in deterministic chunks.
2. **Given** an active upload, **When** each chunk is accepted by the remote endpoint, **Then** the session reports progress through the existing typed ingest events.
3. **Given** a completed upload, **When** the session finishes, **Then** the original file remains unmodified and the final manifest still represents the original artifact.

---

### User Story 2 - Resume A Remote TUS Upload (Priority: P2)

An operator loses the browser session after several chunks have completed, reselects the same original file, and resumes the remote TUS upload instead of starting over.

**Why this priority**: Persistent resume is only trustworthy when the active transport confirms that the remote upload session still matches the local checkpoint.

**Independent Test**: Start an upload with the adapter and persistent resume store, stop after confirmed chunks, create a new session with the same file and record, and verify the adapter validates the remote session before incomplete chunks continue.

**Acceptance Scenarios**:

1. **Given** a recoverable resume record and a still-valid remote upload session, **When** the same original file is selected again, **Then** the adapter validates the remote state before any completed chunks are skipped.
2. **Given** a recoverable resume record, **When** the remote upload reports a different offset than the local checkpoint, **Then** the SDK rejects resume before sending more bytes and reports a typed transport conflict.
3. **Given** a remote upload session that no longer exists or is expired, **When** resume is attempted, **Then** no bytes are uploaded and the user receives a recoverable failure state.

---

### User Story 3 - Surface TUS Transport Failures Safely (Priority: P3)

A frontend engineer needs actionable failure states when the remote TUS endpoint rejects a chunk, reports an invalid offset, times out, or denies the upload.

**Why this priority**: Large inspection uploads need safe recovery UI. Ambiguous transport failures can cause duplicate uploads, skipped bytes, or lost operator time.

**Independent Test**: Simulate endpoint failures for unauthorized upload, missing remote session, invalid offset, transient network failure, and finalization failure, then verify the adapter maps each case to typed session outcomes without exposing sensitive handles.

**Acceptance Scenarios**:

1. **Given** a transient network failure, **When** a chunk upload fails, **Then** the existing retry behavior can retry the chunk without advancing the persistent checkpoint prematurely.
2. **Given** a permanent remote rejection, **When** a chunk upload fails, **Then** the session fails with a typed transport error that applications can show in recovery UI.
3. **Given** sensitive remote upload handles, **When** transport errors or events are emitted, **Then** default payloads do not expose credentials, presigned URLs, or full resume handles.

---

### User Story 4 - Configure Adapter Boundaries (Priority: P4)

A platform engineer configures endpoint URL, metadata mapping, headers, credential behavior, and storage hints without changing core ingest logic.

**Why this priority**: The adapter must support real deployments while preserving the core package boundary and avoiding hard-coded storage assumptions.

**Independent Test**: Configure the adapter with endpoint and metadata options, run an upload against a fake endpoint, and verify the remote session receives only intended metadata and safe headers.

**Acceptance Scenarios**:

1. **Given** application-provided metadata, **When** the adapter creates a remote upload, **Then** only approved metadata fields are sent to the remote endpoint.
2. **Given** custom headers or credentials, **When** events or errors are emitted, **Then** sensitive values are not logged or included in default event payloads.
3. **Given** an application that does not use TUS, **When** it imports the core package, **Then** the core ingest behavior remains provider-neutral and does not require TUS configuration.

### Edge Cases

- The remote endpoint reports an upload offset lower than the local completed checkpoint.
- The remote endpoint reports an upload offset higher than the local completed checkpoint.
- The remote endpoint accepts session creation but rejects the first chunk.
- The browser session is refreshed after a chunk has been accepted remotely but before the local resume store write succeeds.
- The remote upload expires or is deleted before resume.
- The selected file no longer matches the stored resume record.
- The endpoint returns unauthorized, forbidden, not found, conflict, timeout, or malformed protocol responses.
- The adapter is configured with sensitive headers, credentials, upload URLs, or resume tokens.
- The endpoint supports a maximum chunk size that differs from the application's chunk plan.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The SDK MUST provide a TUS-compatible upload adapter that can be used through the existing ingest session transport contract.
- **FR-002**: The adapter MUST create a remote upload session for the original file without resizing, recompressing, decoding, or otherwise mutating the original bytes.
- **FR-003**: The adapter MUST upload file content in chunk boundaries compatible with the active ingest session chunk plan.
- **FR-004**: The adapter MUST return remote upload identity and resume state needed by the persistent resume record.
- **FR-005**: The adapter MUST validate remote resume state before the core skips any locally completed chunk range.
- **FR-006**: The adapter MUST reject resume before upload when remote offset, remote identity, expiration, or endpoint availability conflicts with the stored resume record.
- **FR-007**: The adapter MUST distinguish transient retryable transport failures from permanent resume conflicts or unrecoverable remote failures.
- **FR-008**: The adapter MUST refresh remote resume metadata when the remote endpoint rotates or updates resume handles.
- **FR-009**: The adapter MUST map remote session creation, chunk upload, resume validation, completion, and failure outcomes into typed SDK events or errors.
- **FR-010**: The adapter MUST avoid exposing sensitive headers, credentials, upload URLs, customer metadata, or full resume handles through default events, errors, or logs.
- **FR-011**: The adapter MUST allow applications to provide endpoint location, safe metadata mapping, and request customization without changing core ingest logic.
- **FR-012**: The adapter MUST keep TUS-specific behavior outside the provider-neutral core contracts.
- **FR-013**: The adapter MUST work with fake or local protocol-compatible endpoints in default tests without real cloud credentials or external network dependencies.
- **FR-014**: The adapter MUST document how retry, pause, cancel, and persistent resume interact with remote TUS upload state.
- **FR-015**: The adapter MUST update README examples and public contract documentation when its public API is introduced.

### Key Entities *(include if feature involves data)*

- **TUS Upload Session**: Remote resumable upload resource associated with one original inspection file and one ingest manifest.
- **Remote Offset**: The byte position acknowledged by the remote endpoint and used to validate whether local checkpoint state can be trusted.
- **TUS Resume State**: Adapter-owned upload identity, optional resume handle, expiration information, and safe metadata needed to validate remote recovery.
- **Transport Configuration**: Application-provided endpoint, metadata mapping, request customization, and credential policy for one adapter instance.
- **Transport Conflict**: Typed failure that prevents upload or resume because remote state cannot be safely reconciled with local ingest state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In protocol-simulator tests, a fresh upload creates a remote session, uploads all planned chunks, and completes successfully in 100% of covered happy-path cases.
- **SC-002**: In resume tests, local completed chunks are skipped only after remote state validation succeeds in 100% of covered recovery cases.
- **SC-003**: Remote offset mismatch, missing remote session, expired remote state, and unsupported resume validation are rejected before additional upload bytes are sent in 100% of covered conflict cases.
- **SC-004**: Failed chunk acknowledgements do not advance persistent checkpoints in 100% of covered adapter failure cases.
- **SC-005**: Default test runs require no real TUS server, cloud credentials, or external network access.
- **SC-006**: No covered event or error payload exposes configured credentials, presigned URLs, sensitive headers, or full resume handles.

## Assumptions

- The first adapter targets the current sequential upload model; parallel upload and sparse remote reconciliation remain out of scope.
- The application supplies the original file again for browser resume, consistent with the existing persistent resume feature.
- Strong whole-file checksum verification, per-chunk checksum fields, and server-side checksum attestation are separate follow-up features.
- Package splitting into separate published packages is a planning concern for a later package-structure feature; this feature may still preserve module boundaries in the current package.
- The adapter can be validated against local fakes or protocol simulators before testing against a real TUS server.
- Applications are responsible for choosing credential storage and request authorization strategy appropriate to their deployment.
