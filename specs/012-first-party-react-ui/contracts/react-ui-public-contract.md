# Contract: First-Party React UI Public Surface

## Package Boundaries

- `large-image-ingest/react-ui` exports the provider, complete panel, primitives, hooks, and public UI types.
- `large-image-ingest/react-ui/styles.css` exports the default static stylesheet.
- `large-image-ingest/react` remains headless and imports no styled UI.
- Root, core, transport, Node, TIFF, and non-React entrypoints import neither React UI code nor CSS.
- React remains an optional peer dependency. Uppy is not a dependency of this surface.

## Required Public Components

### `InspectionUploadPanel`

Complete default experience. It accepts the same behavioral configuration as the provider and renders all required primitives in the supported order.

Required input:

- `createController(file)`: application-owned factory that receives the exact selected `File` and returns one existing `IngestController` configured with transport, validation, checksum, metadata, and resume policy.

Optional input:

- recovery options containing the same resume store used by created controllers and compatible chunking identity;
- completion-verification adapter;
- native-selection hints such as accepted file descriptions;
- safe derivative preview descriptor;
- label overrides;
- bounded slots for header, preview, and supplementary guidance;
- root class/style and lifecycle callbacks.

The panel must not accept a transport directly, inspect provider credentials, or mutate controller options.

### `InspectionUploadProvider`

Owns one presentation coordinator and supplies immutable `InspectionUiState` plus actions to primitives. It renders no required layout by itself.

It must:

- preserve the exact selected source;
- create/dispose one controller per selected source;
- subscribe through the existing headless contract;
- project resume records into safe choices;
- track pending control intent without changing authoritative lifecycle truth;
- start completion verification only after transfer completion;
- isolate consumer callbacks from upload control flow.

### Primitives

- `InspectionFileDropzone`: native picker and drag/drop selection with keyboard alternative.
- `InspectionSourceCard`: safe source identity, derivative preview slot, and valid removal action.
- `InspectionValidationSummary`: validation/preparation outcome without raw manifest rendering.
- `InspectionPreparationProgress`: bounded source-identity progress or indeterminate state.
- `InspectionUploadProgress`: acknowledged byte count, total, normalized progress, and semantic status.
- `InspectionUploadControls`: only currently valid start, pause, resume, cancel, or retry controls.
- `InspectionRecoveryPrompt`: safe recovery choices, reselection guidance, compatibility outcome, and optional application-authorized discard action.
- `InspectionVerificationStatus`: not-configured, pending, verified, failed, and unavailable outcomes.
- `InspectionErrorNotice`: safe categorized failure and supported recovery action.

Every stateful primitive requires `InspectionUploadProvider` and fails with a clear usage error outside it. Pure formatting helpers may accept explicit values and remain context-free only when documented as such.

## Required Hook

`useInspectionUploadUi()` returns the immutable aggregate UI snapshot and stable actions:

- `selectFile(file)`
- `removeSource()`
- `start()`
- `pause()`
- `resume(recoveryKey?)`
- `cancel()`
- `refreshRecovery()`
- `discardRecovery(recoveryKey)` only when discard is configured
- `retryVerification()` only when verification reports retryable

Actions reject with the original typed error for application code while the rendered state receives only a safe categorized error.

## Recovery Adapter Contract

Recovery configuration contains:

- the existing `ResumeStore` also used by controller options;
- the chunking identity needed for compatibility classification;
- optional clock for deterministic expiry tests;
- optional application confirmation/callback for discarding a record.

The provider may call `list`, `get`, and compatibility helpers. It must not render full records or pass them to slots. It may retain record IDs in private coordinator state solely to invoke existing resume/delete contracts.

## Completion Verification Contract

The optional adapter receives the completed manifest and a redacted/safe completion context. It returns:

- `verified` with no sensitive payload;
- `failed` with safe issue codes/severity;
- `unavailable` with safe retry guidance.

The adapter owns network/backend communication. The UI owns pending/retry presentation. Absence of an adapter produces `not_configured`, never `verified`.

## Preview Derivative Contract

An optional preview descriptor contains:

- `kind: "derivative"`;
- a caller-owned display source;
- accessible alternative text or an explicit decorative flag;
- optional status/failure label.

The UI does not derive the preview from the original, manage its storage lifecycle, or attach it to a manifest.

## Label Contract

Export a complete default label object and accept partial overrides keyed by stable semantic purpose rather than markup location. Required keys cover selection, source details, lifecycle phases, controls, recovery, verification, errors, byte formatting, and empty states.

Changing labels must not remove programmatic control names. Full internationalization catalogs, pluralization engines, and locale loading are outside v1.

## Headless Prerequisite Contract Changes

Before the styled components ship:

1. preflight policy failure uses the existing `validation.failed` error category instead of `transport.failed`;
2. controller state gains additive preparation/checksum progress sufficient to distinguish validation/source preparation from upload creation;
3. existing start, resume, pause, cancel, snapshot, manifest, and error fields remain source compatible;
4. user-provided checksum progress observers continue to run and UI observer failure cannot break ingest.

These changes must update core/headless specs, public types, README examples, and tests in the same release.

## Non-Goals

- No transport or storage implementation.
- No multi-file queue or batch scheduler.
- No Uppy wrapper.
- No remote-provider acquisition.
- No automatic preview/thumbnail generation.
- No annotation, viewer, tile navigation, or image editor.
- No replacement for the headless React surface.
