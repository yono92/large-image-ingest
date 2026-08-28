# Feature Specification: Uppy UI Integration

**Feature Branch**: `main` (feature directory: `011-uppy-ui-integration`)

**Created**: 2026-08-26

**Status**: Implemented

**Input**: User description: "Provide an Uppy UI-only integration recipe, an actually runnable React example, a record of API friction found while using it, a conditional official Uppy adapter specification, and a later review plan for a tus-js-client transport adapter."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add Uppy Without Duplicating Upload Ownership (Priority: P1)

As an application developer with an Uppy-based file-selection experience, I can hand a selected inspection image to large-image-ingest and retain Uppy for visible file selection while large-image-ingest remains the sole owner of validation, checksum, manifest, upload lifecycle, persistent resume, and completion evidence.

**Why this priority**: The integration is only safe and understandable when one system owns transfer state. Competing upload, retry, or resume engines can corrupt progress, duplicate bytes, or make completion unverifiable.

**Independent Test**: Follow the recipe in a React application, select one local inspection image through the Uppy interface, complete an ingest through the existing large-image-ingest lifecycle, and confirm that no second uploader or source transformation participates.

**Acceptance Scenarios**:

1. **Given** a local image selected in the Uppy interface, **When** the developer starts ingest, **Then** the exact selected source is passed to one large-image-ingest session without preprocessing, recompression, or an Uppy upload plugin.
2. **Given** an active ingest, **When** progress, pause, cancellation, failure, or completion changes, **Then** the visible application state is derived from the large-image-ingest session and does not claim a conflicting Uppy transfer state.
3. **Given** a paused or interrupted ingest with a durable resume record, **When** the user reloads, selects the same original again, and requests resume, **Then** large-image-ingest validates compatibility before continuing from acknowledged progress.
4. **Given** an incompatible reselected file, **When** resume is requested, **Then** the upload does not continue and the application presents a recoverable compatibility error without exposing the stored resume record.

---

### User Story 2 - Run a Complete React Reference Flow (Priority: P1)

As a prospective adopter, I can install and run a self-contained React example without cloud credentials, then observe selection, validation, upload progress, pause, reload recovery, completion, and final integrity evidence.

**Why this priority**: A copyable snippet is not sufficient evidence that the two libraries compose correctly across lifecycle and recovery boundaries.

**Independent Test**: On a clean checkout, follow the example instructions using only local services, interrupt a multi-chunk upload, reload, reselect the same file, resume it, and verify the completed stored bytes against the original identity.

**Acceptance Scenarios**:

1. **Given** a supported development environment and a clean checkout, **When** the documented setup and start commands are followed, **Then** the example becomes usable without external accounts, credentials, or manual source edits.
2. **Given** a multi-chunk local image, **When** the user starts ingest, **Then** the example displays authoritative lifecycle state and byte progress through completion.
3. **Given** at least one acknowledged chunk, **When** the session is paused or the page is reloaded, **Then** the example can recover after the same source is selected again and does not re-acknowledge already committed chunks as new work.
4. **Given** a completed ingest, **When** final verification runs, **Then** the example reports whether the stored original matches the manifest identity and expected bytes.

---

### User Story 3 - Turn Integration Friction Into an Adapter Decision (Priority: P2)

As a library maintainer, I can review concrete friction discovered while building and exercising the recipe, distinguish documentation gaps from public API gaps, and make an evidence-backed decision about whether an official Uppy adapter deserves its own specification.

**Why this priority**: Publishing an adapter before real integration evidence risks adding a permanent abstraction that merely wraps a few application-owned lines.

**Independent Test**: Review the completed friction record and decision record, trace every entry to a reproducible integration step, and confirm that the outcome is either a bounded adapter specification or an explicit deferral with documented workarounds.

**Acceptance Scenarios**:

1. **Given** a difficulty encountered while building or running the example, **When** it is recorded, **Then** the record identifies the affected journey, observable consequence, severity, current workaround, ownership boundary, and possible public-contract implication.
2. **Given** a friction item that can be removed by clearer documentation or example code, **When** it is classified, **Then** it does not by itself justify a new public adapter.
3. **Given** evidence that a mandatory scenario cannot be met safely through documented public APIs, **When** the decision gate is applied, **Then** a separate official Uppy adapter specification is produced before adapter implementation begins.
4. **Given** no qualifying public API gap, **When** the decision gate is applied, **Then** the adapter is explicitly deferred and the recipe remains the supported integration surface.

---

### User Story 4 - Bound the Later tus-js-client Review (Priority: P3)

As a library maintainer, I can evaluate a future tus-js-client transport adapter as a separate transport-ownership decision, without silently expanding the Uppy UI work into a second resumable upload engine.

**Why this priority**: tus-js-client overlaps with existing chunking, retry, resume, cancellation, and remote upload ownership. It needs an architectural review after the UI integration is proven.

**Independent Test**: Read the follow-up review brief and confirm that it identifies ownership conflicts, compatibility questions, required experiments, decision criteria, and the prerequisite evidence from the Uppy integration without introducing runtime behavior in this feature.

**Acceptance Scenarios**:

1. **Given** the Uppy integration evidence, **When** the tus-js-client follow-up is reviewed, **Then** UI composition concerns and transport concerns remain separate.
2. **Given** overlapping retry, chunking, resume, cancellation, and progress responsibilities, **When** the future adapter is evaluated, **Then** each responsibility has one proposed owner or is identified as an unresolved blocker.
3. **Given** this feature is completed, **When** its shipped dependencies and public exports are inspected, **Then** no tus-js-client runtime adapter or dependency has been added as part of this scope.

### Edge Cases

- The Uppy selection contains no underlying local file or references a remote-provider source rather than local bytes.
- A second file is selected while the first file has active or recoverable ingest state.
- The selected file is removed from Uppy before start, during upload, or after a persistent checkpoint exists.
- Uppy validation accepts a file that large-image-ingest rejects under the application policy.
- The page reloads before the first durable checkpoint or while a chunk request is in flight.
- The user selects a same-named file whose bytes, size, or last-modified identity differs from the recoverable source.
- Progress callbacks or visible UI updates fail while the underlying ingest continues.
- Cancellation succeeds locally but remote cleanup is unavailable or fails.
- A resume record contains upload identifiers, URLs, object keys, receipts, or customer metadata that must not appear in routine logs or error UI.
- The example is opened in more than one browser tab and both tabs attempt to control the same recoverable ingest.
- Final storage verification disagrees with the source manifest after the UI has observed transfer completion.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The integration guide MUST define Uppy as the owner of local file selection and visible selection UI only for the reference flow.
- **FR-002**: The guide and example MUST define large-image-ingest as the sole owner of source validation, checksum calculation, manifest generation, chunk planning, upload execution, retry, pause, cancellation, persistent resume, progress truth, completion, and integrity evidence.
- **FR-003**: The reference flow MUST NOT configure a second upload engine, transform the source, or represent Uppy transfer state as authoritative.
- **FR-004**: The initial recipe MUST support one active local file at a time and MUST state that remote Uppy sources, preprocessing plugins, image editors, multi-file queue scheduling, and styled components supplied by this library are outside its scope.
- **FR-005**: The recipe MUST provide a clear ownership and event-mapping reference for selection, start, progress, pause, resume, cancellation, failure, removal, and completion.
- **FR-006**: The integration MUST preserve the selected original byte-for-byte and MUST represent previews or other display artifacts, if an application adds them later, as separate derivatives.
- **FR-007**: The runnable React example MUST be installable and usable from a clean checkout with no cloud credentials or external storage account.
- **FR-008**: The example MUST exercise an actual local transfer and final stored-file verification rather than simulating completion only in UI state.
- **FR-009**: The example MUST demonstrate validation failure, progress, pause or interruption, persistent recovery after reload and same-file reselection, cancellation, completion, and verification outcome.
- **FR-010**: Persistent recovery MUST use the existing versioned resume behavior and MUST require source compatibility validation before remote work resumes.
- **FR-011**: The example MUST avoid logging or rendering full manifests, resume records, upload URLs, credentials, customer metadata, or provider receipt evidence by default.
- **FR-012**: Failures from visible UI observers MUST remain separate from transfer control failures, and the user MUST receive a safe, actionable status for validation, compatibility, transport, cancellation, and verification outcomes.
- **FR-013**: The initial integration MUST use documented public package contracts and MUST NOT require a new public export or an Uppy-specific runtime adapter to satisfy the recipe.
- **FR-014**: Every material integration difficulty discovered during implementation or verification MUST be recorded with a reproducible step, observed consequence, severity, workaround, ownership classification, and potential contract change.
- **FR-015**: Friction MUST be classified at minimum as documentation/example friction, application composition friction, or public API friction.
- **FR-016**: The adapter decision record MUST distinguish convenience from correctness and MUST identify whether existing public APIs can satisfy every mandatory acceptance scenario without duplicate transfer ownership, source mutation, loss of recoverability, or reliance on private internals.
- **FR-017**: An official Uppy adapter specification MUST be created only if the decision record identifies at least one mandatory scenario that cannot be met safely through documented public APIs, or repeated integration coordination that belongs consistently to the library rather than the application; otherwise the adapter MUST be explicitly deferred.
- **FR-018**: If an Uppy adapter specification is triggered, it MUST define ownership boundaries, lifecycle and error mapping, compatibility policy, public types, test obligations, and non-goals before implementation begins.
- **FR-019**: This feature MUST produce a separate tus-js-client follow-up review brief covering transport responsibility ownership, compatibility with current manifests and resume records, migration risk from the existing tus transport, required experiments, and a go/no-go decision gate.
- **FR-020**: The tus-js-client review in this feature MUST NOT add a runtime dependency, public adapter, parallel upload behavior, or change to an existing transport contract.
- **FR-021**: Documentation MUST state the supported reference scope, known limitations, resume security considerations, and how adopters should choose between the existing Uppy recipe, a future Uppy adapter, the current tus transport, and any later tus-js-client work.

### Key Entities

- **Selected Source**: The one local file chosen through Uppy and handed unchanged to a large-image-ingest session, including the identity attributes needed for validation and recovery.
- **Integration Session**: The application-level association between a selected source, its authoritative large-image-ingest controller state, and any recoverable record identifier; it does not create a second upload session.
- **Resume Record**: The existing versioned, potentially sensitive record of source identity, acknowledged progress, and remote transport evidence used to recover an interrupted ingest.
- **Friction Record**: Reproducible evidence about an integration obstacle, including severity, affected journey, workaround, ownership boundary, and possible public-contract implication.
- **Adapter Decision**: The evidence, criteria, outcome, and follow-up scope used to create or defer a formal Uppy adapter specification.
- **Transport Review Brief**: The bounded follow-up analysis for deciding whether tus-js-client should replace, complement, or remain separate from the existing tus transport.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer unfamiliar with this repository can start the reference example from a clean checkout in 10 minutes or less by following its documented steps, without credentials or source edits.
- **SC-002**: In the reference flow, 100% of source bytes are uploaded through one authoritative ingest lifecycle, and the completed stored file passes byte-count and checksum verification against the generated manifest.
- **SC-003**: In 10 consecutive interruption-and-recovery trials after at least one acknowledged chunk, the same source resumes successfully without re-creating already acknowledged progress; an incompatible source is rejected in every trial before additional upload work.
- **SC-004**: All eight required visible outcomes—selection, validation, progress, pause or interruption, recovery, cancellation, completion, and verification—are independently reproducible from the documented example.
- **SC-005**: A reviewer can identify the single owner for each selection and ingest responsibility from one ownership table, with no responsibility assigned authoritatively to both Uppy and large-image-ingest.
- **SC-006**: Every integration issue found during implementation and verification has a complete friction record, and 100% of public API change proposals trace to at least one such record.
- **SC-007**: The Uppy adapter decision ends in exactly one documented outcome: a bounded formal adapter specification triggered by qualifying evidence, or an explicit deferral that cites the safe public-API recipe.
- **SC-008**: The tus-js-client follow-up brief reaches an explicit review-ready state with responsibility mapping, compatibility questions, experiments, risks, and decision criteria, while this feature adds zero tus-js-client runtime dependencies or public exports.
- **SC-009**: The reference example and all existing package verification gates complete successfully without requiring cloud credentials or weakening original-preservation, typed-error, or resume-record security guarantees.

## Assumptions

- The first supported Uppy recipe targets local browser file selection and one active file; remote-provider acquisition and multi-file scheduling can be evaluated after this path is stable.
- Uppy is adopted for its selection interface and surrounding application UI, not as the byte-transfer, retry, or resume engine in this feature.
- Existing large-image-ingest core, React headless, resume-store, transport, and verification contracts are expected to be sufficient; the implementation phase will record evidence if that assumption fails.
- The runnable example may include a local reference service and temporary local storage solely to prove actual transfer, recovery, and verification without credentials.
- Browser recovery cannot persist the original image bytes and therefore requires the user to select the same original again after reload.
- The formal Uppy adapter, if justified, and any tus-js-client transport adapter are separate follow-up features with their own specification and plan before implementation.
- Parallel chunk upload, production deployment guidance for a specific provider, and customer design-partner validation are not prerequisites for this integration feature.
