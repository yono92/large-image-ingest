# Uppy Integration Friction And Adapter Decision

**Decision**: `defer`

**Evidence date**: 2026-08-28

The mandatory Uppy UI-only journeys are achievable through documented public contracts without duplicate transfer ownership, source mutation, private internals, or a new runtime export. An official Uppy adapter is therefore deferred. The supported integration surface is the recipe and runnable example.

## Decision Gate

Create a separate adapter specification only when either condition is supported by repeated evidence:

1. a mandatory scenario cannot be implemented safely through public APIs; or
2. the same non-trivial coordination repeatedly belongs to the library rather than application policy.

Convenience alone does not satisfy this gate. If it is triggered later, the new specification must define ownership boundaries, lifecycle and error mapping, compatibility policy, public types, tests, and non-goals before implementation.

## Verification Results

The runnable example was exercised in a real local browser on 2026-08-28:

- a 12 MiB+8-byte TIFF completed through three 4 MiB chunks and reported stored-original verification success with duplicate accepted bytes `0`;
- pause settled after the first 4 MiB acknowledgement, page reload removed the browser `File`, same-file reselection found the compatible checkpoint, and resume completed with duplicate accepted bytes `0`;
- a 128 MiB source canceled into a terminal `canceled` state;
- a zero-byte TIFF failed SDK validation with zero uploaded bytes and no checkpoint, using the safe example message rather than exposing the misleading transport-class code;
- a paused 13 MiB record followed by 12 MiB source selection produced a safe recovery-mismatch alert, no compatible Resume action, and no additional remote work;
- no Uppy uploader, Uppy transfer status, preprocessor, remote provider, or image editor participated.

Automated evidence includes ten consecutive trials that each reject an incompatible source before remote work and then recover the matching source with zero duplicate accepted bytes, a repeated-acknowledged-range idempotency test, selection object-identity tests, local HTTP completion/cancellation/terminal-state tests, and stored checksum verification. Repository type checks, build, the existing 64 MiB reference gate, package dry-run inspection, and the full npm security audit also passed. Browser execution exposed F-006 through F-008, and packaging inspection exposed F-009; those records materially influenced the example without changing a public SDK export.

## Evidence Summary

| ID | Classification | Severity | Affected journey | Result |
| --- | --- | --- | --- | --- |
| F-001 | Application composition | Medium | Local selection | `UppyFile.data` must be narrowed to a browser `File`. A public, explicit bridge is sufficient. |
| F-002 | Documentation/example | High | Progress and controls | Uppy status/progress UI is misleading without an Uppy uploader. The recipe omits it and renders SDK state. |
| F-003 | Application composition | Medium | Reload recovery | The application must list records, reselect a source, and choose the compatible record. Existing public APIs are sufficient. |
| F-004 | Public API | Medium | Progress and pause | Acknowledged progress is chunk-granular and pause takes effect at a chunk boundary. This is not Uppy-specific and does not block correctness. |
| F-005 | Application composition | Low | File replacement/removal | A controller is bound to one source; replacement requires disposal and recreation under application policy. |
| F-006 | Example/tooling | Medium | Initial app load | Vite's no-plugin JSX transform required explicit React runtime imports despite TypeScript's automatic JSX type-check mode. |
| F-007 | Example/tooling | Medium | Pause demonstration | Loopback transfer completed too quickly for a human pause; the CLI now delays acknowledgements without changing SDK behavior. |
| F-008 | Public API | Medium | Validation failure | A preflight validation failure currently surfaces with `transport.failed`; the example translates the known message to a validation outcome. |
| F-009 | Packaging | High | npm package inspection | Generated ignored fixtures entered the tarball until equivalent `.npmignore` rules were added. |

## Friction Records

### F-001 — General Uppy file bodies require a local-file guard

- **Reproduction**: Handle Uppy `file-added` and pass `uppyFile.data` directly to the ingest controller.
- **Observed consequence**: Uppy supports bodies beyond a local browser `File`, including remote-provider shapes. The ingest recipe requires original local bytes and identity fields.
- **Severity**: Medium. An unchecked bridge could accept an unsupported source or lose the original-file guarantee.
- **Workaround**: Require `uppyFile.data instanceof File`, reject anything else safely, and pass the exact object without copying.
- **Ownership**: Application composition. The application selected which Uppy acquisition sources it enables.
- **Potential contract change**: None currently. A future adapter might package the guard only if repeated integrations prove it is part of a larger stable boundary.
- **Evidence**: `tests/uppy-selection-bridge.test.ts` covers exact-object preservation and rejection of Blob, remote, and missing bodies.

### F-002 — Uppy transfer UI would have no authoritative uploader state

- **Reproduction**: Render an Uppy dashboard or status component while intentionally configuring no uploader plugin.
- **Observed consequence**: Uppy cannot truthfully represent SDK validation, checksum, chunk receipts, pause, persistent resume, completion, or verification.
- **Severity**: High. Rendering both state models invites conflicting progress and completion claims.
- **Workaround**: Use Uppy `Dropzone` and `FilesList` for selection only. Render all lifecycle state and controls from `large-image-ingest`.
- **Ownership**: Documentation/example friction.
- **Potential contract change**: None. The ownership table and reference component remove the ambiguity.
- **Evidence**: `examples/uppy-react/src/UppySelection.tsx` contains no uploader or status component; `App.tsx` renders the SDK controller snapshot.

### F-003 — Recovery requires explicit application composition

- **Reproduction**: Reload with a durable resume record, then select the original again.
- **Observed consequence**: Browser storage retains the record but not the `File`. The application must connect selection, safe record discovery, compatibility matching, and controller resume.
- **Severity**: Medium. The steps are easy to omit, especially the compatibility check.
- **Workaround**: Use `WebStorageResumeStore.list()`, match only through the public source-compatibility contract, and expose only a safe record identifier in the UI.
- **Ownership**: Application composition. Selection UX and record-choice policy vary by application.
- **Potential contract change**: Consider a framework-agnostic recovery helper only after the same pattern appears in multiple integrations; an Uppy-specific adapter is not justified by one recipe.
- **Evidence**: `tests/uppy-selection-bridge.test.ts` tests compatible lookup; the runnable app uses the same public path.

### F-004 — Progress and pause are chunk-boundary operations

- **Reproduction**: Upload a multi-chunk source and request pause while a chunk request is active.
- **Observed consequence**: The visible byte count advances when a chunk is acknowledged, and pause settles at a safe boundary rather than at the exact click instant.
- **Severity**: Medium. The behavior is correct but should be stated so applications do not infer per-request streaming progress.
- **Workaround**: Explain acknowledged-byte semantics and select a chunk size appropriate to the desired responsiveness and transport overhead.
- **Ownership**: Public API friction, but framework-independent and not Uppy-specific.
- **Potential contract change**: A future core transport-progress contract could expose intra-chunk observations without changing receipt authority. It should not be introduced through an Uppy adapter.
- **Evidence**: The local transport and interruption tests observe receipt-based progress and ten successful recovery trials.

### F-005 — Controller lifetime follows source lifetime

- **Reproduction**: Replace or remove the selected Uppy file after constructing a controller.
- **Observed consequence**: The controller is intentionally bound to its original source; mutating the selection does not retarget it.
- **Severity**: Low. The invariant prevents accidental cross-file continuation.
- **Workaround**: Lock selection during active states, cancel before active removal, and create a new controller for a new source.
- **Ownership**: Application composition.
- **Potential contract change**: None. Retargeting an upload controller would weaken source identity.
- **Evidence**: `selection-bridge.ts` defines removal policy, and the reference UI prevents silent active detachment.

### F-006 — Type-check JSX mode did not prove the Vite runtime transform

- **Reproduction**: Start the example after a successful `typecheck:uppy-example` run with Vite configured without a React transform plugin.
- **Observed consequence**: The browser displayed a blank root and reported `React is not defined` from `main.tsx`.
- **Severity**: Medium. Static checks alone did not make the reference app usable.
- **Workaround**: Import the React runtime explicitly in each TSX module while keeping Vite dependency and configuration minimal.
- **Ownership**: Example/tooling friction, not SDK or Uppy API friction.
- **Potential contract change**: None.
- **Evidence**: Reproduced in the local browser on 2026-08-28 and resolved before runtime scenario verification.

### F-007 — Fast loopback transfer hid the pause journey

- **Reproduction**: Start a 128 MiB local fixture and click Pause as soon as the control enables.
- **Observed consequence**: The local upload and verification could finish before the paused state became observable.
- **Severity**: Medium. Transfer correctness passed, but the documented interactive journey was not reliably teachable.
- **Workaround**: The CLI local server delays each new chunk acknowledgement by 600 ms. Imported test servers retain a zero-delay default, and acknowledged ranges are idempotent if a client loses the first response.
- **Ownership**: Example/tooling friction, not SDK or Uppy API friction.
- **Potential contract change**: None. Production transports must use their own offset or receipt reconciliation rather than an artificial delay.
- **Evidence**: Reproduced with 12 MiB and 128 MiB fixtures; the reference HTTP test verifies a repeated acknowledged range does not increase accepted bytes.

### F-008 — Validation failure uses a transport-class error code

- **Reproduction**: Select an empty `.tiff` that Uppy can hold, then start ingest.
- **Observed consequence**: No remote session is created and the message says validation failed, but the existing typed code is `transport.failed`.
- **Severity**: Medium. Control flow is safe, but applications should not have to inspect a message to classify a preflight policy failure.
- **Workaround**: The example translates the exact known preflight message to `Validation failed: the selected file does not satisfy the ingest policy.` and exposes no internal details.
- **Ownership**: Public API friction in the framework-agnostic session, not an Uppy integration gap.
- **Potential contract change**: A future core specification should consider a dedicated validation lifecycle error code while preserving compatibility for existing consumers.
- **Evidence**: Reproduced in the local browser on 2026-08-28 with a zero-byte TIFF; state became `failed`, uploaded bytes remained zero, and no checkpoint was created.

### F-009 — Git-ignored fixtures were still publishable

- **Reproduction**: Run `npm pack --dry-run` after browser verification generated 12 MiB, 13 MiB, and 128 MiB local fixtures.
- **Observed consequence**: The package preview included all fixtures and reached 161 MiB unpacked even though Git ignored them.
- **Severity**: High. A documentation example must not bloat the published SDK with generated test artifacts.
- **Workaround**: Mirror the example artifact paths in root and example-local `.npmignore` files because the package `files` whitelist includes the entire `examples` directory; retain the fixture generator and instructions in the package.
- **Ownership**: Packaging friction.
- **Potential contract change**: None.
- **Evidence**: The corrected package dry-run excludes `.fixtures`, `.local-data`, and `.vite-dist` while retaining the runnable example source and README.

## Outcome

No record demonstrates an Uppy-specific mandatory correctness gap in the public API. F-004 and F-008 are framework-independent core friction, while the remaining items are documentation, tooling, or application policy. The adapter outcome is therefore exactly `defer`.

Revisit the decision after at least two additional independent integrations or if a mandatory flow requires private APIs. Do not add a convenience wrapper until its stable responsibility is clearer than the current small selection bridge.
