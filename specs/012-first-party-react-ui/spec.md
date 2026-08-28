# Feature Specification: First-Party Inspection Upload UI

**Feature Branch**: `main` (feature directory: `012-first-party-react-ui`)

**Created**: 2026-08-28

**Status**: Draft

**Input**: User description: "Build and plan an attractive first-party UI for large-image-ingest instead of presenting the Uppy compatibility example as the library's primary experience. Keep Uppy as an optional integration recipe."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Render A Complete Inspection Upload Experience (Priority: P1)

As an application developer, I can add one official inspection upload panel, provide my existing ingest configuration, and immediately present local file selection, source identity, validation, progress, controls, completion, and integrity status without designing every lifecycle state myself.

**Why this priority**: The library becomes materially easier to evaluate and adopt when its core value is visible in a coherent workflow rather than only through headless hooks or a third-party selector.

**Independent Test**: Place the default panel in a minimal application with a credential-free transport, select a multi-chunk inspection image, and complete a verified ingest while observing every authoritative state from selection through stored-original verification.

**Acceptance Scenarios**:

1. **Given** an idle panel, **When** a user selects one supported local inspection image, **Then** the panel shows the exact source identity and starts no remote work until the user explicitly starts ingest.
2. **Given** a selected source, **When** ingest starts, **Then** the panel presents validation, source-identity preparation, acknowledged-byte progress, pause, cancellation, retry or recovery guidance, completion, and verification as distinct understandable states.
3. **Given** a validation or transport failure, **When** the panel presents the outcome, **Then** it uses a safe actionable category and does not expose a full manifest, resume record, upload URL, object key, customer metadata, or credential.
4. **Given** a successful transfer whose stored verification is still pending, **When** the panel updates, **Then** it does not claim that the original is verified until separate integrity evidence succeeds.

---

### User Story 2 - Recover An Interrupted Inspection Upload (Priority: P1)

As an inspection operator, I can return after a reload or interruption, understand that the original must be selected again, and safely resume only when the selected source is compatible with the recoverable upload.

**Why this priority**: Multi-gigabyte inspection uploads frequently outlive a page session, so recovery must be a primary experience rather than an advanced developer-only flow.

**Independent Test**: Pause a multi-chunk upload after a durable checkpoint, reload, reselect the same original, resume without accepting acknowledged ranges as new work, and complete with stored-file verification; then repeat with an incompatible source and confirm it is blocked before remote work.

**Acceptance Scenarios**:

1. **Given** recoverable state after reload, **When** no source is selected, **Then** the panel explains that browser storage retained recovery evidence but not the original file bytes.
2. **Given** a recoverable upload, **When** the same original is reselected, **Then** the panel presents a safe recovery choice and resumes only after compatibility succeeds.
3. **Given** a recoverable upload, **When** a different or incompatible source is selected, **Then** the panel presents a recoverable mismatch outcome and sends no additional upload bytes.
4. **Given** more than one recoverable upload, **When** the panel lists recovery choices, **Then** it shows only safe summaries and never exposes sensitive stored record contents.

---

### User Story 3 - Compose And Brand The Official UI (Priority: P2)

As a product team, I can use the complete default panel or compose smaller official pieces, apply my product's visual identity and terminology, and retain the same lifecycle correctness without copying internal logic.

**Why this priority**: A rigid dashboard may look attractive in a demo but becomes difficult to adopt in industrial applications with established layouts, terminology, and accessibility requirements.

**Independent Test**: Render the default panel and a custom composition from official pieces, apply an alternate theme and labels, and verify both present the same authoritative state and keyboard-operable actions.

**Acceptance Scenarios**:

1. **Given** the default panel, **When** no customization is supplied, **Then** it has a complete, responsive, legible inspection-oriented presentation.
2. **Given** a host design system, **When** visual tokens and supported class or slot customizations are applied, **Then** colors, typography, spacing, radius, and emphasis can change without forking component behavior.
3. **Given** a custom layout, **When** smaller selection, source, validation, progress, controls, recovery, and verification pieces are composed, **Then** they share one authoritative ingest controller rather than creating duplicate sessions.
4. **Given** keyboard, reduced-motion, zoom, or assistive-technology use, **When** the operator completes the workflow, **Then** all controls, status changes, errors, and focus transitions remain perceivable and operable.

---

### User Story 4 - Evaluate The Library Through Its Own Product Experience (Priority: P3)

As a prospective adopter, I can run an official reference application, explore every major success and failure state without cloud credentials, and understand when to use the first-party UI, the headless React surface, or the Uppy integration recipe.

**Why this priority**: A polished reference experience turns technical capabilities into adoption evidence and keeps the library's identity independent of Uppy.

**Independent Test**: Follow the reference instructions from a clean checkout and reproduce selection, validation failure, progress, pause, reload recovery, mismatch, cancellation, completion, and verification without source edits or external accounts.

**Acceptance Scenarios**:

1. **Given** a clean checkout, **When** the documented local commands are followed, **Then** the official reference experience is usable without credentials, manual code changes, or Uppy.
2. **Given** the project documentation, **When** an adopter chooses an integration path, **Then** the first-party UI is presented as the default ready-made experience, headless React as the custom-design path, and Uppy as an optional compatibility recipe.
3. **Given** the official reference experience, **When** each documented state is exercised, **Then** the same state can be traced to a supported public contract rather than example-only private behavior.

### Edge Cases

- The user drags multiple files while only one active source is supported.
- A selected source is removed before start, while active, while paused, or after completion.
- The browser reloads before the first durable checkpoint or while a chunk response is in flight.
- A recoverable record exists but the source file is unavailable, expired, canceled, completed, or incompatible.
- More than one browser tab attempts to control the same recoverable upload.
- Validation accepts an extension but rejects the MIME type, size, metadata, dimensions, checksum, or empty content.
- Progress remains unchanged during a long checksum or active chunk operation.
- Pause or cancellation finishes at a safe boundary rather than immediately.
- Remote cancellation or resume cleanup fails after local state has changed.
- Transfer completion succeeds but stored-original verification fails or remains unavailable.
- An application supplies a preview that is missing, broken, unrelated to the source, or incorrectly presented as the original.
- Very long filenames, untrusted metadata, right-to-left text, 200% zoom, narrow screens, and reduced-motion preferences affect the layout.
- A UI observer, host callback, or custom slot throws while the ingest operation continues.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The feature MUST provide an optional official inspection upload UI that is usable without Uppy or another upload UI library.
- **FR-002**: The official UI MUST offer both a complete default panel and smaller composable pieces for selection, source identity, validation, progress, controls, recovery, errors, and verification.
- **FR-003**: The official UI MUST consume the existing authoritative ingest lifecycle and MUST NOT create a second upload, retry, resume, cancellation, progress, or completion state machine.
- **FR-004**: The official UI MUST preserve the selected original object and MUST NOT resize, recompress, decode-and-rewrite, strip metadata, or otherwise transform the source of record.
- **FR-005**: The initial official flow MUST support one active local source at a time and MUST reject or safely explain additional, missing-byte, or remote-only selections.
- **FR-006**: The default panel MUST distinguish at minimum idle, selected, validating, preparing identity, creating upload, uploading, pausing or paused, resuming, canceling or canceled, failing, completing, completed, verification pending, verification success, and verification failure outcomes.
- **FR-007**: Visible byte progress MUST be derived from authoritative acknowledged progress and MUST NOT imply per-byte streaming progress when only chunk acknowledgements are known.
- **FR-008**: The UI MUST expose only actions valid for the current lifecycle state and MUST prevent duplicate starts, resumes, or silent source replacement while an operation is active.
- **FR-009**: The UI MUST support durable recovery after reload by explaining source reselection, listing safe recovery summaries, validating compatibility, and resuming only compatible records.
- **FR-010**: An incompatible recovery source MUST be blocked before additional remote work and MUST leave the recoverable record available for the original source or explicit discard policy.
- **FR-011**: Removal during an active operation MUST require cancellation through the authoritative controller; removal MUST NOT be represented as successful completion.
- **FR-012**: Transfer completion and stored-original verification MUST be separate visible outcomes, and verification failure MUST remain visible after transfer completion.
- **FR-013**: Routine UI and diagnostics MUST NOT render or log full manifests, full resume records, upload URLs, storage keys, credentials, customer metadata, provider receipts, or filesystem paths.
- **FR-014**: Visible errors MUST map validation, compatibility, transport, cancellation, cleanup, observer, and verification failures to safe actionable categories while retaining the original typed failure for application callbacks.
- **FR-015**: The default UI MUST be responsive from a 320 CSS-pixel viewport through desktop layouts and remain usable at 200% zoom without loss of controls or status.
- **FR-016**: All selection and lifecycle controls MUST be keyboard operable, have programmatically determinable names and states, maintain visible focus, and announce material status or error changes without excessive repetition.
- **FR-017**: Motion MUST respect reduced-motion preferences, color MUST NOT be the only status signal, and default visual contrast MUST satisfy an AA-level accessibility target.
- **FR-018**: Host applications MUST be able to customize documented visual tokens, supported class or slot boundaries, and user-facing labels without copying lifecycle logic.
- **FR-019**: Custom compositions MUST share one provided controller and MUST fail clearly when stateful pieces are rendered without the required UI context.
- **FR-020**: The UI MUST NOT read or decode the complete source solely to produce presentation. Any displayed thumbnail or preview MUST be optional, caller-supplied, and identified as a derivative rather than the original.
- **FR-021**: The official UI MUST remain an optional surface so core, Node, transport, non-React, and headless React consumers do not load its components or styles.
- **FR-022**: The feature MUST introduce no mandatory third-party upload engine, component framework, icon library, or styling runtime for existing consumers.
- **FR-023**: A credential-free official reference application MUST demonstrate selection, validation failure, progress, pause, reload recovery, incompatible-source rejection, cancellation, completion, and stored-original verification.
- **FR-024**: Documentation MUST explain when to choose the official UI, the headless React adapter, or the Uppy UI-only integration and MUST identify the initial single-local-file limitation.
- **FR-025**: Public UI contracts, documented visual tokens, accessibility behavior, and supported customization points MUST follow package versioning and release documentation requirements.

### Key Entities

- **Inspection Upload Experience**: The complete first-party user journey joining one selected source, authoritative ingest state, controls, recovery, and verification presentation.
- **Selected Source Summary**: A safe presentation of the local source identity, such as filename, type, size, and last modification, without source mutation or sensitive manifest data.
- **Upload Presentation State**: A UI-facing interpretation of authoritative lifecycle, acknowledged bytes, valid actions, safe errors, and pending or terminal outcomes.
- **Recovery Choice**: A safe summary of one durable recoverable upload that can be matched against a reselected source without exposing the underlying record.
- **Verification Outcome**: The separate pending, verified, failed, or unavailable evidence for the stored original after transfer completion.
- **Visual Theme**: The documented, bounded set of visual and textual customizations a host can apply without changing ingest behavior.
- **Preview Derivative**: An optional caller-supplied display artifact related to the source but never substituted for the original identity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer familiar with the existing SDK can display a working default inspection upload experience in 15 minutes or less after supplying an ingest configuration, without designing lifecycle UI.
- **SC-002**: 100% of required lifecycle and verification outcomes have a documented visible state, a valid-action set, and an independently reproducible test scenario.
- **SC-003**: In ten consecutive interruption trials, the matching source resumes to verified completion with zero duplicate accepted bytes, while an incompatible source is rejected before remote work in all ten trials.
- **SC-004**: Keyboard-only users can complete selection, start, pause, resume, cancellation, recovery, and result review with no inaccessible control or focus trap.
- **SC-005**: Automated accessibility checks report zero serious or critical violations in every required default-panel state, and manual checks confirm status is not communicated by color alone.
- **SC-006**: The default experience remains fully operable at 320 CSS pixels, 200% zoom, and desktop width with no clipped action or unreadable status.
- **SC-007**: The UI introduces zero source mutations and zero UI-originated whole-file reads; completed stored originals continue to verify against the source manifest.
- **SC-008**: Core and non-UI package consumers observe no added UI code or stylesheet loading and no new mandatory runtime dependency.
- **SC-009**: A host can produce a visibly distinct theme and change supported labels using documented customization points without copying or modifying lifecycle components.
- **SC-010**: A clean-checkout evaluator can reproduce all nine reference outcomes—selection, validation failure, progress, pause, reload recovery, mismatch rejection, cancellation, completion, and verification—without credentials or Uppy.
- **SC-011**: Package inspection contains the official UI, its styles, documentation, and reference source while excluding generated fixtures, build artifacts, and sensitive local state.
- **SC-012**: Existing type checks, tests, builds, reference integrity checks, and package-consumption checks remain successful after the optional UI is added.

## Assumptions

- The first public UI targets the same supported React versions as the existing optional headless adapter.
- The initial workflow supports one local source and one authoritative controller; multi-file queue scheduling remains a later feature.
- Applications continue to provide upload transport, validation policy, metadata, resume storage, and server-side verification integration.
- A polished default theme and composable pieces ship together as one optional public surface rather than remaining example-private.
- The feature includes an official credential-free reference application in addition to reusable UI contracts.
- English is the default copy, while documented label overrides provide an initial localization path; a full translation catalog is outside the first release.
- The UI does not generate thumbnails or previews. A host may supply a derivative preview through a documented presentation slot.
- Remote-provider acquisition, image editing, annotation, image viewing, tiled inspection navigation, batch scheduling, and production backend deployment are outside this feature.
- Uppy remains a supported optional integration recipe and is not a dependency or implementation detail of the official UI.
