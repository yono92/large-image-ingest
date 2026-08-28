# Composition Contracts: Uppy UI-Only Integration

These are application composition contracts, not new public large-image-ingest exports.

## Ownership Matrix

| Responsibility | Authoritative owner | Integration behavior |
|---|---|---|
| Local picker/dropzone and selected-file list | Uppy | Headless UI components add or remove one local file. |
| Source bytes and identity handed to ingest | Application bridge | Pass the exact local `File`; reject remote or transformed data. |
| Validation policy | large-image-ingest | Uppy restrictions may mirror basic rules for early feedback only. |
| Checksum, fingerprint, manifest | large-image-ingest | Never copied from or delegated to Uppy upload state. |
| Chunk planning and byte transfer | large-image-ingest transport | No Uppy uploader plugin and no `uppy.upload()` call. |
| Retry, pause, resume, cancellation | large-image-ingest session/controller | Uppy pause/retry/cancel upload APIs are not used. |
| Durable resume record and compatibility | large-image-ingest resume APIs | Uppy selection is empty after reload; user reselects the original. |
| Progress and failure truth | large-image-ingest controller | Uppy context upload status/progress is not displayed as authoritative. |
| Final stored-file verification | Reference or production server plus large-image-ingest verification | Transfer completion and integrity verification remain distinct states. |
| Layout, accessibility, labels, styling | Application | The library still ships no styled components. |

## Selection Bridge

The example-private bridge accepts an Uppy file only when its data is the local browser `File` selected by the user.

```ts
interface SelectedSource {
  uppyFileId: string;
  file: File;
}

type SelectionResult =
  | { ok: true; source: SelectedSource }
  | { ok: false; code: "selection.remote_unsupported" | "selection.file_unavailable" };
```

Behavior:

- `file-added` evaluates the source and creates one Selected Source.
- A second file is rejected by Uppy restrictions while another is selected or recoverable work is active.
- `file-removed` before start clears the selection and controller.
- Removal during an active operation is disabled or converted into an explicit large-image-ingest cancellation flow before Uppy state is cleared.
- Removing a paused selection does not implicitly delete its durable resume record; discarding recoverable work is a separate explicit action.
- The bridge never calls upload, retry, pause, resume, or cancellation methods on Uppy.

## Controller Composition

- Create one large-image-ingest controller for one Selected Source.
- Keep the controller mounted while its controls and status components render.
- Recreate the controller only when a different local file is accepted or after terminal state is intentionally reset.
- Use the controller snapshot and typed errors for visible status.
- Do not copy full snapshots or resume records into Uppy file metadata.

## Recovery Mapping

1. List recoverable records through the existing resume store helpers without displaying sensitive record contents.
2. Ask the user to reselect the original through Uppy.
3. Classify the selected file against candidate records.
4. Enable resume only for a compatible record.
5. Call the large-image-ingest controller's resume action with that record ID.
6. Keep incompatible records intact unless the user explicitly discards them.

## Visible State Mapping

| large-image-ingest state | Example presentation | Uppy behavior |
|---|---|---|
| `idle` | Ready to start | Selection enabled. |
| `validating` / `starting` / `creating` | Preparing original | Selection/removal locked. |
| `uploading` | Acknowledged byte progress | Selection/removal locked. |
| `paused` | Resume record available when persisted | Same file remains selected; resume control is application-owned. |
| `resuming` | Validating stored and remote state | Selection/removal locked. |
| `completing` | Finalizing stored original | Selection/removal locked. |
| `completed` | Transfer complete; verification pending or complete | Uppy does not synthesize upload success. |
| `failed` | Safe typed error and allowed recovery action | Uppy file remains available for retry/recovery decisions. |
| `canceled` | Canceled and remote cleanup result | Selection may be cleared after terminal confirmation. |

## Non-Goals

- No Uppy uploader plugin.
- No custom Uppy plugin in the initial recipe.
- No remote provider, webcam, screen capture, URL importer, image editor, or thumbnail generator.
- No authoritative Uppy progress or completion state.
- No multi-file upload queue.
- No source preview or derivative generation.
