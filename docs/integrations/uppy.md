# Uppy UI-Only Integration

This recipe uses Uppy for local file selection and selected-file presentation. `large-image-ingest` remains the only upload engine. The boundary is deliberate: two retry, resume, or completion state machines must not control the same source.

Use the official [`large-image-ingest/react-ui`](../react-ui.md) surface for the default ready-made inspection experience. Use this Uppy recipe only when a host application already depends on Uppy selection UI.

For a complete implementation, see the [runnable React example](../../examples/uppy-react/README.md).

## Install

```bash
npm install large-image-ingest react @uppy/core @uppy/react
```

Uppy is an application dependency, not a runtime dependency of `large-image-ingest`.

## Responsibility Ownership

| Concern | Authoritative owner | Integration behavior |
| --- | --- | --- |
| Local file selection | Uppy UI | `Dropzone` and `FilesList` expose one selected local file. |
| Source bytes | Browser `File` | Pass the exact `UppyFile.data` object after checking `instanceof File`. |
| Validation and checksum | `large-image-ingest` | The ingest policy remains authoritative even when Uppy accepts a selection. |
| Manifest and chunk plan | `large-image-ingest` | Uppy does not preprocess or transform the source. |
| Upload, retry, and progress | `large-image-ingest` | Render controller state; do not render Uppy transfer state. |
| Pause, resume, and cancel | `large-image-ingest` | Invoke controller controls only. |
| Persistent recovery | `large-image-ingest` resume store | After reload, require the user to reselect the original and validate compatibility. |
| Completion and integrity evidence | `large-image-ingest` plus the server | Transfer completion and stored-file verification are separate outcomes. |
| File removal | Application policy | Allow before start and after terminal state; cancel through the controller before removing an active source. |

## Selection Bridge

Configure Uppy for one local image and do not add an uploader plugin:

```tsx
import { Uppy } from "@uppy/core";

const uppy = new Uppy({
  autoProceed: false,
  restrictions: {
    maxNumberOfFiles: 1,
    allowedFileTypes: ["image/*", ".tif", ".tiff"]
  }
});

uppy.on("file-added", (uppyFile) => {
  if (!(uppyFile.data instanceof File)) {
    uppy.removeFile(uppyFile.id);
    showSafeError("Select a local file. Remote Uppy sources are not supported.");
    return;
  }

  // Keep this exact File object. Do not copy, resize, recompress, or strip metadata.
  mountIngestController(uppyFile.data);
});
```

The full example supplies `mountIngestController` with `createIngestController`, a persistent `WebStorageResumeStore`, and an existing `UploadTransport` implementation.

Do not call `uppy.upload()`, `uppy.addUploader()`, or install `@uppy/tus` in this recipe. Do not use Uppy preprocessors or image editors on the source of record. If the application creates previews, store them as separate derivatives.

## Event Mapping

| Event or action | Source | Required response |
| --- | --- | --- |
| Selection | Uppy `file-added` | Require a local `File`, preserve its identity, and create one ingest controller. |
| Removal before start | Uppy `file-removed` | Dispose the unstarted controller and clear application selection state. |
| Removal while active | Uppy `file-removed` | Cancel through the ingest controller; never treat removal as transfer completion. |
| Start | Application control | Call the ingest controller `start()`. |
| Progress | Ingest snapshot | Render acknowledged bytes from `large-image-ingest`. |
| Pause | Application control | Call controller `pause()`; the active chunk may finish before state becomes paused. |
| Recovery | Resume store plus reselected `File` | Find a compatible record through public APIs, then call controller `resume(record)`. |
| Cancel | Application control | Call controller `cancel()` and report remote cleanup failure safely if it occurs. |
| Failure | Ingest snapshot | Render typed, redacted error information; keep Uppy transfer state out of the message. |
| Completion | Ingest snapshot | Show upload completion, then show stored-file verification as a separate result. |

## Reload Recovery

Browser storage can retain the versioned resume record, but it cannot retain the original `File`. After reload:

1. List safe recovery choices without rendering full records.
2. Ask the user to select the original file again.
3. Match the selection with the existing public resume-compatibility APIs.
4. Resume only after compatibility succeeds.

If recoverable records exist but none match the selection, present a safe recovery-mismatch outcome and do not invoke remote work. Keep the record available so the user can reselect the original or explicitly discard it through application policy.

Treat resume records as sensitive. They may contain remote upload identifiers, URLs, object keys, receipts, or customer metadata. Do not log or render the complete record. Multi-tab coordination is application-owned in this initial recipe; only one tab should control a recoverable session.

## Run The Reference Example

From a repository checkout:

```bash
npm install
npm run example:uppy:fixture
npm run example:uppy
```

Open `http://localhost:4173`. The example reuses the provider-neutral local HTTP infrastructure under `examples/reference-local/`. It transfers real bytes, persists chunk receipts, supports pause and reload recovery, and verifies the completed stored file against the source manifest.

## Supported Scope And Limitations

The supported reference path is one active local file. Remote Uppy providers, multi-file queue scheduling, Uppy upload plugins, source preprocessing, and production server deployment are outside this recipe. Styled first-party components are available separately through `large-image-ingest/react-ui`; they are intentionally not wrapped around Uppy.

Progress is authoritative but chunk-granular. A pause request takes effect at a safe chunk boundary. The local server is verification infrastructure, not a production upload service.

The example CLI adds a 600 ms acknowledgement delay per chunk so a human can reproduce pause and reload recovery even on fast loopback storage. This delay is not part of the SDK or production transport behavior.

Use this recipe when an application wants Uppy selection UI with the existing `large-image-ingest` lifecycle. Use `large-image-ingest/transport-tus` when the server already speaks tus and the SDK should retain its current transport contract. The evidence currently does not justify an Uppy-specific runtime adapter; see the [friction and adapter decision](uppy-friction.md). A possible `tus-js-client` integration remains a separate transport review described in the [follow-up brief](tus-js-client-review.md).
