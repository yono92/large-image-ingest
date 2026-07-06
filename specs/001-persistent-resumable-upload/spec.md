# Feature Specification: Persistent Resumable Upload

**Feature Branch**: `001-persistent-resumable-upload`

**Created**: 2026-07-02

**Status**: Implemented and included in the `v1.0.0` release

**Input**: User description: "Implement real resumable persistence for large image ingest sessions; current behavior only retries chunks inside one in-memory session."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resume After Interruption (Priority: P1)

An operator starts uploading a multi-GB inspection image, loses the browser session or refreshes the page, selects the same original file again, and continues from the last confirmed checkpoint instead of starting from byte zero.

**Why this priority**: This is the primary user value. Without it, large upload reliability remains limited to transient retry.

**Independent Test**: Use a fake transport and durable test store to upload two chunks, stop the runtime, recreate the ingest session with the same file, and verify upload continues at the first incomplete chunk.

**Acceptance Scenarios**:

1. **Given** a recoverable upload record with two completed chunks, **When** the same original file is provided again, **Then** the session resumes from the next incomplete chunk.
2. **Given** a recoverable upload record, **When** the resumed upload completes, **Then** the record is removed by the default cleanup policy.
3. **Given** a recoverable upload record, **When** the selected file does not match the recorded file identity, **Then** no upload bytes are sent and a typed resume conflict is reported.

---

### User Story 2 - Persist Reliable Checkpoints (Priority: P2)

A frontend engineer provides a durable resume store and expects the SDK to write progress only after a chunk has been accepted by the transport.

**Why this priority**: Incorrect checkpoints can silently skip bytes and corrupt inspection artifacts.

**Independent Test**: Configure a fake transport that fails before acknowledging a chunk and verify that the failed chunk is not marked complete in the resume record.

**Acceptance Scenarios**:

1. **Given** an active upload, **When** a chunk upload succeeds, **Then** the resume record is updated with the new checkpoint.
2. **Given** an active upload, **When** a chunk upload fails before acknowledgement, **Then** the resume record still points to the failed chunk as incomplete.
3. **Given** a pause request, **When** the current chunk settles, **Then** the session leaves a recoverable paused record.

---

### User Story 3 - Validate Transport Resume State (Priority: P3)

A transport adapter author restores provider-specific resume information and validates that the remote upload session is still usable before the SDK skips completed chunks.

**Why this priority**: Local checkpoints alone are not enough; the remote upload target may have expired, been canceled, or belong to another artifact.

**Independent Test**: Use one fake transport with resume validation and one without it. Verify that only the validating transport can resume a stored upload.

**Acceptance Scenarios**:

1. **Given** a transport that can validate remote resume state, **When** a stored upload is resumed, **Then** the transport confirms the remote session before chunks are skipped.
2. **Given** a transport that cannot validate remote resume state, **When** a stored upload is resumed, **Then** the SDK fails before upload with a typed unsupported-transport conflict.
3. **Given** an expired resume handle, **When** a resume is attempted, **Then** the SDK reports the record as expired and does not upload bytes.

---

### User Story 4 - Surface Recoverable Sessions (Priority: P4)

A UI developer lists recoverable sessions and shows whether each record is active, paused, failed, expired, completed, canceled, or incompatible with the selected file.

**Why this priority**: Resume persistence only helps users if applications can present safe recovery choices.

**Independent Test**: Seed a resume store with records in each lifecycle status and verify that only recoverable records are offered by default.

**Acceptance Scenarios**:

1. **Given** a resume store with active and paused records, **When** recoverable sessions are listed, **Then** both records are visible.
2. **Given** completed or canceled records, **When** recoverable sessions are listed by default, **Then** they are not offered for recovery.
3. **Given** a selected file, **When** recoverable sessions are listed, **Then** incompatible records are distinguishable from compatible records.

### Edge Cases

- The browser cannot reopen local file bytes after refresh; the application must obtain the original file again before resume.
- The selected file name, size, MIME type, last modified time when available, or metadata fingerprint differs from the stored record.
- The stored chunk size, total byte count, or total chunk count differs from the current session options.
- The remote transport session expired, was finalized elsewhere, or now points to a different artifact.
- The resume store write fails after a chunk succeeds.
- The application cancels an upload and later lists recoverable sessions.
- Sensitive metadata or transport handles are present in the resume record.
- The current in-flight chunk is interrupted during pause or abort.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The SDK MUST define a versioned persistent resume record separate from the final ingest manifest.
- **FR-002**: The SDK MUST preserve the original file and MUST NOT persist original file bytes, decoded image data, generated derivatives, or transformed original content in resume records.
- **FR-003**: The SDK MUST store enough resume state to identify the ingest manifest, original file identity, chunking identity, transport identity, upload progress, lifecycle status, and relevant timestamps.
- **FR-004**: The SDK MUST treat transport resume handles and customer metadata in resume records as sensitive and MUST NOT emit them through default logs.
- **FR-005**: The SDK MUST require the application to provide the original file again before browser resume.
- **FR-006**: The SDK MUST compare the provided file against the resume record before any resumed upload bytes are sent.
- **FR-007**: File matching MUST include at least file size, media type, name, last modified time when available, and the existing metadata fingerprint.
- **FR-008**: The SDK MUST reject resume before upload when stored chunking identity does not match the current file and chunk plan.
- **FR-009**: The SDK MUST checkpoint progress only after the transport confirms a chunk has been durably accepted.
- **FR-010**: The SDK MUST skip completed chunk ranges on resume and continue at the first incomplete chunk for sequential uploads.
- **FR-011**: The SDK MUST update the resume record after every confirmed chunk.
- **FR-012**: The default completion cleanup policy MUST remove completed resume records.
- **FR-013**: The SDK MUST support an explicit pause flow that leaves a recoverable record after the current in-flight chunk settles.
- **FR-014**: The SDK MUST support an explicit cancel flow that prevents the record from being offered for default recovery.
- **FR-015**: The SDK MUST expose typed observable state or events for resume discovery, resume start, checkpoint persistence, resume conflict, pause, completion, expiration, and cancellation.
- **FR-016**: The SDK MUST distinguish transient retry failures from persistent resume failures in public error codes or equivalent typed results.
- **FR-017**: The SDK MUST require transports to validate or refresh remote resume state before local completed chunks are skipped.
- **FR-018**: The SDK MUST fail persistent resume before upload when the selected transport cannot validate remote resume state.
- **FR-019**: The SDK MUST keep transport and storage behavior adapter-based and provider-neutral.
- **FR-020**: The SDK MUST provide a small browser storage adapter for simple persistent records and a generic store contract for custom or encrypted stores.

### Key Entities

- **Resume Record**: Versioned operational state for one recoverable ingest session. It contains manifest identity, file identity, chunking identity, transport identity, progress, lifecycle status, and timestamps. It does not contain original file bytes.
- **File Identity**: The set of observable file attributes used to decide whether a user-selected file can resume a stored upload.
- **Chunk Progress**: The completed chunk range set and next incomplete chunk position used for sequential resume.
- **Transport Resume State**: Provider-specific remote upload information that may include upload identifiers, resume handles, expiration, and adapter-owned metadata.
- **Resume Conflict**: A typed failure that prevents resumed upload before bytes are sent because local, file, chunking, transport, or expiration checks did not pass.

### Out Of Scope

- Transport-specific tus or S3 protocol behavior; those adapters are covered by `specs/001-official-transports/`.
- Browser resume without the user providing the original file again.
- Cross-device resume unless the application supplies compatible shared storage and transport handles.
- Strong whole-file checksum verification before resume.
- Parallel chunk upload or sparse remote chunk reconciliation.
- Persisting image previews, tiles, thumbnails, decoded metadata, or original bytes.
- Guaranteeing local browser storage encryption.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In fake-transport tests, an interrupted sequential upload resumes by uploading only incomplete chunks in 100% of covered cases.
- **SC-002**: File mismatch, chunking mismatch, expired record, and unsupported transport resume attempts are rejected before upload bytes are sent in 100% of covered conflict tests.
- **SC-003**: A failed chunk acknowledgement never advances the stored checkpoint in 100% of covered failure tests.
- **SC-004**: A completed upload removes its recoverable record by default in 100% of covered completion tests.
- **SC-005**: Public resume outcomes are distinguishable from transient retry outcomes by typed events, typed state, or typed errors in all covered session flows.
- **SC-006**: Resume records created by the SDK contain no original file bytes or generated derivative bytes in all covered persistence tests.

## Assumptions

- The first implementation remains sequential to match the existing prototype.
- Completed chunks are stored as compact ranges so future parallel planning can evolve without changing the record concept.
- The existing metadata fingerprint is sufficient for first-pass resume matching, but it is not cryptographic proof of content equality.
- Local resume records can contain sensitive metadata or transport handles, so applications choose storage according to their threat model.
- The default cleanup policy deletes completed records; later policies may retain sanitized audit breadcrumbs.
