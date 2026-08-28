# Implementation Plan: First-Party Inspection Upload UI

**Branch**: `main` | **Date**: 2026-08-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/012-first-party-react-ui/spec.md`

## Summary

Ship an optional first-party React UI that makes the library's inspection-specific lifecycle visible through a polished default panel and composable primitives. The UI preserves one exact local source, delegates all ingest operations to the existing headless controller, adds safe recovery and verification presentation, ships opt-in static CSS, and includes a credential-free official reference application. Uppy remains an integration recipe and is not imported by the new surface.

The feature includes two small prerequisite public-contract corrections: use the existing `validation.failed` category for preflight policy rejection, and expose additive preparation/checksum progress from the headless controller. No manifest, resume schema, transport, or storage contract changes.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18/19, ESM-first plus existing CommonJS output, CSS custom properties, Node.js 20+ for package build and local reference service

**Primary Dependencies**: Existing `large-image-ingest/core` and `large-image-ingest/react`; React optional peer; native DOM elements; static CSS; no Uppy, component framework, CSS runtime, icon dependency, or upload engine in the public UI

**Storage**: Existing application-supplied `ResumeStore` such as `WebStorageResumeStore`; UI holds only transient source/presentation state; local temporary filesystem remains reference-app infrastructure

**Testing**: Vitest controller/reducer tests, React DOM component tests, accessibility scanner, credential-free browser interaction/responsive checks, fake transports, existing local HTTP recovery/verification harness, type checks, package export/consumption tests, and package dry-run inspection

**Target Platform**: Modern browsers supporting File, drag/drop, Fetch, Web Storage when recovery is configured, CSS custom properties, and supported React 18/19 applications; server rendering must import/render without browser-global access

**Project Type**: Published TypeScript SDK with optional React subpath, new optional styled React subpath and stylesheet, and a runnable web reference application

**Performance Goals**: UI-originated work remains constant-space relative to source size; initial idle render adds no source read; UI update frequency is bounded to controller/preparation revisions; no source preview decode; public UI JavaScript and CSS are measured before release and stay an optional convenience layer rather than a second application framework

**Constraints**: One active local file; exact original preservation; acknowledged progress only; separate transfer/verification outcomes; no sensitive record/manifest/URL rendering; opt-in styles; no global CSS leakage; accessible at 320 CSS pixels and 200% zoom; zero impact on non-UI entrypoints

**Scale/Scope**: One public `react-ui` subpath, one stylesheet subpath, approximately ten focused components including the panel/provider, one presentation hook/coordinator, two narrow headless/core corrections, one reference app, three contract documents, and layered unit/DOM/browser/package verification

## Constitution Check

*GATE: Passed before research and re-checked after design.*

- **Original preservation: PASS.** The UI retains and forwards the exact selected `File`. It performs no preview generation, decoding, resize, recompression, EXIF mutation, or whole-file presentation read. Optional preview input is explicitly a caller-owned derivative.
- **Recoverability: PASS.** Durable records remain in the existing store/schema. The UI projects safe summaries, requires source/chunking compatibility, keeps acknowledged progress authoritative, distinguishes control intent from settled state, and never resumes a mismatch.
- **Adapter boundaries: PASS.** Core and transports remain framework/provider neutral. Styled behavior lives only under an optional React UI subpath; transport and stored verification are supplied through existing/adapted application contracts.
- **TypeScript contracts: PASS.** New public component, provider, hook, label, theme, recovery-summary, verification, error, and preparation types are explicit. Existing controller additions are additive; validation code correction is documented and tested. Manifest and resume schemas do not change.
- **Validation and security: PASS.** Validation remains core-owned. The plan eliminates message-based validation classification, sanitizes visible errors, avoids full record/manifest/provider evidence in render state, and treats filenames/labels/slots as untrusted application input.
- **Documentation and tests: PASS.** The release updates README, roadmap, React/headless docs, Uppy positioning, new UI docs, changelog, examples, package exports, and style import instructions. Tests cover component states, state/action ownership, recovery, accessibility, responsive behavior, source preservation, observer isolation, exports, CSS packaging, and existing repository gates.

No constitution violation requires a complexity exception.

## Project Structure

### Documentation (this feature)

```text
specs/012-first-party-react-ui/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- lifecycle-presentation-contract.md
|   |-- react-ui-public-contract.md
|   `-- styling-accessibility-contract.md
`-- checklists/
    `-- requirements.md
```

### Source Code (repository root)

```text
src/
|-- session.ts                         # validation.failed correction
|-- react-controller.ts                # preparation/checksum progress bridge
|-- react.ts                           # existing headless surface remains unstyled
|-- react-ui.ts                        # public react-ui exports
`-- react-ui/
    |-- context.ts
    |-- coordinator.ts
    |-- types.ts
    |-- labels.ts
    |-- safe-error.ts
    |-- InspectionUploadPanel.tsx
    |-- InspectionUploadProvider.tsx
    |-- InspectionFileDropzone.tsx
    |-- InspectionSourceCard.tsx
    |-- InspectionValidationSummary.tsx
    |-- InspectionPreparationProgress.tsx
    |-- InspectionUploadProgress.tsx
    |-- InspectionUploadControls.tsx
    |-- InspectionRecoveryPrompt.tsx
    |-- InspectionVerificationStatus.tsx
    `-- InspectionErrorNotice.tsx

styles/
`-- react-ui.css

examples/
|-- reference-local/                   # provider-neutral fixture/server/transport shared by examples
|   |-- create-fixture.cjs
|   |-- local-server.mjs
|   `-- local-reference-transport.ts
|-- inspection-upload-react/
|   |-- README.md
|   |-- index.html
|   |-- vite.config.ts
|   `-- src/
|       |-- App.tsx
|       |-- main.tsx
|       `-- example-theme.css
`-- uppy-react/                        # remains optional integration; imports shared local reference code

scripts/
|-- run-inspection-ui-example.cjs
`-- verify-package-consumption.cjs

tests/
|-- react-controller.test.ts
|-- react-ui-coordinator.test.ts
|-- react-ui-components.test.tsx
|-- react-ui-recovery.test.tsx
|-- react-ui-accessibility.test.tsx
|-- react-ui-css.test.ts
|-- react-ui-reference.test.ts
|-- package-exports.test.ts
`-- ui-browser/
    `-- inspection-upload.spec.ts

README.md
CHANGELOG.md
docs/roadmap.md
docs/react-ui.md
package.json
tsconfig.json
tsconfig.cjs.json
tsconfig.inspection-ui-example.json
```

**Structure Decision**: Keep the UI in the current package as optional subpath exports, but isolate implementation beneath `src/react-ui/` and stylesheet delivery beneath `styles/`. Extract the local reference target from the Uppy-named example into provider-neutral infrastructure so both examples prove the same transport and integrity behavior without making Uppy the library identity.

## Public API And Packaging Impact

### Additive exports

- `large-image-ingest/react-ui`: components, provider, hook, labels, and public UI types.
- `large-image-ingest/react-ui/styles.css`: opt-in default stylesheet.

### Headless/core corrections

- `IngestControllerState` receives optional preparation/checksum progress fields.
- The controller publishes authoritative `validating` and `creating` transitions around existing manifest preparation and transport creation while preserving operations and existing fields.
- Preflight policy rejection uses `validation.failed`, already present in `IngestErrorCode`, and affected error/snapshot types are aligned without narrowing existing accepted codes.
- UI callback/observer composition preserves user callbacks and prevents UI callback failure from stopping ingest.

### Package metadata

- React remains an optional peer.
- No public runtime dependency is added beyond the already optional React peer.
- CSS is marked as a side effect and explicitly exported; no automatic document injection.
- Package files and npm ignore rules include the stylesheet and reference source while excluding generated fixtures, screenshots, browser traces, local data, and development builds.
- ESM, CommonJS, and declarations are verified for the JavaScript subpath; stylesheet consumption is verified independently.

## Component Architecture

```text
InspectionUploadPanel
  -> InspectionUploadProvider
       -> presentation coordinator
       -> application createController(File)
       -> existing IngestProvider/controller
       -> optional ResumeStore projection
       -> optional completion verifier
  -> default primitive composition
```

The coordinator owns selection and presentation state only. Its reducer consumes controller revisions and action results, but cannot synthesize uploaded bytes, completion, compatibility, or verification success.

Provider and panel accept stable configuration objects. The implementation internally stabilizes callback boundaries so normal host rerenders do not recreate a controller. Changing the selected `File` is the only supported controller replacement path.

## Delivery Sequence

### Phase A - Contract Prerequisites

1. Correct validation error classification and type it through controller state.
2. Add preparation/checksum progress to the headless controller while preserving consumer callbacks.
3. Add focused regression tests and documentation for these additive behaviors.

Exit: no message inspection or fake timer is needed to present validation and source preparation.

### Phase B - Unstyled Behavior And Composition

1. Implement UI types, safe error mapping, labels, coordinator, provider, and hook.
2. Implement exact local selection, controller lifetime, action gating, recovery projection/classification, and verification adapter flow.
3. Add deterministic fake-controller/store/verifier tests for every state and race.

Exit: all required journeys work through semantic but minimally styled components and one authoritative controller.

### Phase C - Default Components And Theme

1. Implement the complete panel and focused primitives with native semantics.
2. Add default CSS, stable tokens, documented state attributes, responsive layout, reduced motion, and bounded slots.
3. Run state-matrix accessibility scans, keyboard journeys, narrow/zoom checks, and CSS leakage tests.

Exit: the panel is attractive and usable without host CSS, while alternate theming requires no component fork.

### Phase D - Official Reference Experience

1. Extract provider-neutral local example infrastructure from the Uppy-named directory.
2. Build the official inspection UI reference app using only public package exports.
3. Demonstrate all nine required outcomes and an alternate theme.
4. Keep the Uppy example working as a documented integration recipe against the shared reference infrastructure.

Exit: the README can lead with the project's own UI while still proving third-party compatibility.

### Phase E - Release Convergence

1. Update README, roadmap, changelog, React UI guide, Uppy positioning, examples, and package maps.
2. Run type checks, unit/DOM/browser tests, build, 64 MiB reference gate, ten-trial recovery gate, package consumption, npm audit, and package dry-run.
3. Inspect CSS/JS size and tarball contents; record browser/accessibility evidence.
4. Converge code and docs against all feature requirements before any version/tag decision.

## Testing Strategy

### Unit and contract tests

- preparation state and validation error classification;
- one controller per exact file and no duplicate operations;
- action matrix for every phase;
- controller callback/observer isolation;
- safe error mapping with redaction cases;
- recovery summary projection, expiry, mismatch, multi-choice, discard policy, and stale async result races;
- verification not-configured/pending/success/failure/unavailable/retry and stale result races;
- preview descriptor never reads the source.

### Component and accessibility tests

- default panel and every primitive inside/outside provider;
- native file input plus drag/drop/multiple-file rejection;
- accessible names, roles, progress values, disabled state, error/live-region behavior, focus transitions, and reduced motion;
- default and alternate labels/theme tokens;
- source identity rendered as text, never HTML;
- server render with no browser globals.

### Browser/reference tests

- 320-pixel, desktop, and 200%-zoom layouts;
- keyboard-only selection through verification;
- pause, reload, compatible resume, mismatch rejection, cancel, and verification failure;
- no global style leakage into a surrounding host fixture;
- all network requests go only through the configured local transport/reference verifier;
- zero Uppy code in the official reference bundle.

### Release gates

```bash
npm run typecheck
npm run typecheck:examples
npm run typecheck:uppy-example
npm run typecheck:inspection-ui-example
npm test
npm run test:ui
npm run build
npm run test:reference
npm run smoke:exports
npm pack --dry-run
npm audit --audit-level=moderate
```

`test:ui` remains credential-free. Browser installation/setup is documented separately from package runtime dependencies.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Public component API grows too quickly | Export one panel, one provider/hook, and only journey-aligned primitives; keep internal DOM/layout private. |
| UI becomes another upload state machine | Reducer derives presentation only; action/state contracts trace to controller/store/verifier owners. |
| Validation and preparation remain vague | Land typed validation and preparation progress prerequisites before styled work. |
| Full resume records leak into slots | Project immediately to safe summaries; keep record IDs/private records inside coordinator. |
| CSS affects host apps | Opt-in import, prefixed selectors/tokens, no reset, leakage fixture tests. |
| Styled UI bloats non-UI consumers | Optional export, no root re-export, static CSS, no new runtime dependency, consumption/tree-shaking tests. |
| Automatic previews violate large-file principles | No preview generation; explicit derivative-only descriptor. |
| Async verification attaches to a replaced source | Operation generation/abort signal and stale-result tests. |
| Multi-tab controllers conflict | Document one controlling tab in v1 and keep coordination out of this contract. |
| Uppy and official examples duplicate infrastructure | Extract provider-neutral local reference code and test both consumers. |

## Complexity Tracking

No constitution violations require justification. The new public UI surface is warranted by the explicit product goal and existing headless/integration evidence; it remains isolated from core and optional for all consumers.

## Post-Design Constitution Re-Check

- Original preservation remains explicit in preview and selection contracts.
- Recovery uses the existing versioned store and compatibility logic; no new record schema is introduced.
- Core remains UI-free; styled code and CSS are isolated optional exports.
- Public types, CSS tokens, labels, and exports have test and release obligations.
- Sensitive state is projected before render and errors are categorized safely.
- Documentation, browser accessibility, package, and existing integrity gates are included.

**Result**: PASS. Planning can proceed to task generation without a complexity exception.

## Agent Context Update

The generated agent-context updater could not run because this Spec Kit installation provides PowerShell scripts and `pwsh` is unavailable in the workspace. No manual AGENTS.md change is required: existing guidance already covers React as an optional adapter, original preservation, derivative boundaries, typed errors, package exports, documentation, and verification. This plan is the feature-specific source of truth.
