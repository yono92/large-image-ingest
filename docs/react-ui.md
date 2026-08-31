# First-Party React UI

`large-image-ingest/react-ui` is the official ready-made inspection upload experience. It is optional: core, Node, transport, non-React, and headless React consumers do not import its components or stylesheet.

## Choose An Integration Surface

| Surface | Choose it when |
| --- | --- |
| `large-image-ingest/react-ui` | You want the complete panel or official primitives with lifecycle-correct defaults. |
| `large-image-ingest/react` | Your product design system will render every state and action itself. |
| Uppy UI-only recipe | Your application already uses Uppy for local selection and accepts the extra integration dependency. |

The initial first-party workflow supports one active local `File`. Multi-file queues, remote-provider pickers, image editing, annotation, and automatic preview generation are outside this release.

## Complete Panel

```tsx
import { InspectionUploadPanel } from "large-image-ingest/react-ui";
import "large-image-ingest/react-ui/styles.css";
import { createIngestController } from "large-image-ingest/react";

<InspectionUploadPanel
  createController={(file) => createIngestController(file, options)}
  recovery={{ store: resumeStore, chunking: options.chunking }}
  verifier={storedObjectVerifier}
  accept=".tif,.tiff,.png,.jpg,.jpeg"
/>
```

`createController` receives the exact selected object. Create one controller configured with the application's validation, checksum, metadata, resume, and transport policies. The UI does not accept credentials or construct transports.

Recovery configuration uses the same `ResumeStore`, chunking identity, transport capabilities, and checksum execution policy as the controller. Pass `transport.capabilities`; omitted or false `supportsPersistentResume` disables recovery without blocking ordinary upload. In browsers, pass the same `createBrowserWorkerChecksumExecutor()` through `recovery.sourceIdentity` so reselection classification stays responsive. The UI immediately projects records to filename, size, checkpoint time, acknowledged bytes, optional non-secret transport label, and compatibility. Full records, record IDs, and content-identity values remain private.

The optional verifier receives the completed manifest only after transfer completion. It returns `verified`, safe `failed` issue codes, or `unavailable`. Without an adapter the panel says verification is not configured; transfer completion never means stored-original verification.

## Composition

Wrap official primitives in `InspectionUploadProvider` and read the immutable presentation snapshot through `useInspectionUploadUi`. Available primitives cover file selection, source identity, validation, preparation, acknowledged progress, controls, recovery, verification, and safe errors. Rendering a stateful primitive outside the provider throws a clear usage error.

Upload, retry, receipt, pause, resume, cancellation, and completion authority remains in the existing controller. UI action intent is temporary presentation state only. A generation guard aborts identity preparation and discards late recovery and verification results after source replacement or removal.

## Original And Preview Boundaries

The UI stores and forwards the exact `File`. It does not call `FileReader`, `createImageBitmap`, canvas decoding, whole-source object URLs, resize, recompression, or metadata stripping. A preview must be explicitly supplied with `kind: "derivative"`, accessible alternative text or a decorative flag, and a caller-owned URL/lifecycle. It never changes original identity or the manifest.

## Safe Errors And Callbacks

Rendered errors contain a typed category, stable code when safe, fixed title, fixed recovery guidance, and retryability. Raw messages, manifests, resume records, URLs, object keys, filesystem paths, credentials, receipts, and customer metadata are not interpolated. `onError` receives the original failure for application logic. Consumer callback, slot, and subscriber failures are isolated from controller operations.

## Styling Contract

Default styles are opt-in through `large-image-ingest/react-ui/styles.css`. Selectors are scoped under `lii-` classes and public custom properties use `--lii-`. Stable token groups cover surfaces, foregrounds, border, accent/success/warning/danger/focus, typography, spacing, control height, radius, shadow, progress, and motion.

Supported bounded slots cover the panel header, caller-owned derivative preview, selection guidance, recovery guidance, and terminal follow-up actions. Slots cannot replace the native input, live region, progress semantics, lifecycle controls, or error heading.

The default CSS uses a one-column narrow layout, wrapping actions, visible focus, tabular byte values, text-plus-border status cues, and reduced-motion rules. Release checks cover keyboard paths, automated serious/critical accessibility findings, 320 CSS pixels, 200% zoom, desktop layout, and default/alternate themes.

## Recovery And Multi-Tab Safety

Browser storage retains recovery evidence, not original bytes. After reload the operator must reselect the source; Resume remains unavailable until whole-file identity and transport evidence checks pass. `restart_only`, mismatched, incompatible, and expired choices trigger no remote work and remain available until application-authorized discard. A zero-progress legacy record can guide a new ingest but is never silently represented as resumed.

Cross-tab locking is not part of this release. Applications should allow one controlling tab per recoverable upload until a separate coordination contract exists.

## Reference Experience

```bash
npm run example:inspection-ui:fixture
npm run example:inspection-ui
```

The reference app uses public exports and the provider-neutral local service. It requires no credentials or Uppy and demonstrates selection, validation failure, acknowledged progress, pause, reload recovery, mismatch rejection, cancellation, transfer completion, stored verification, and an alternate token composition.
