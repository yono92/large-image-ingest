# Runnable Uppy React Example

This example proves an Uppy selection UI can compose with one authoritative `large-image-ingest` upload lifecycle. It performs a real local HTTP transfer, persists resume records in browser storage, and verifies the stored original after completion. No cloud account or credential is required.

## Run

Requirements: Node.js 20.19 or newer (or 22.12 or newer) and npm 10 or newer. The narrower Node requirement comes from the example's Vite development server, not the SDK runtime.

From the repository root:

```bash
npm install
npm run example:uppy:fixture
npm run example:uppy
```

Open `http://localhost:4173`, then select:

```txt
examples/uppy-react/.fixtures/synthetic-inspection.tiff
```

The start command builds the package, starts the local reference service on port `4174`, and starts Vite on port `4173`. Stop both with `Ctrl+C`. Generated fixtures, uploaded bytes, and Vite output are ignored by Git.

The CLI intentionally delays each chunk acknowledgement by 600 ms so progress and pause are reproducible on a fast local machine. Override it with `LII_UPPY_EXAMPLE_CHUNK_DELAY_MS` when needed; imported test servers default to no delay.

## Verify The Journeys

### Complete and verify

1. Select the generated fixture.
2. Choose **Start ingest**.
3. Observe authoritative acknowledged-byte progress.
4. Confirm the final stored-file verification reports a matching byte count and SHA-256 identity.

### Pause, reload, and recover

1. Start the fixture and pause after at least one chunk is acknowledged.
2. Reload the page. The browser no longer owns the original `File`, but the resume record remains in Web Storage.
3. Select the same fixture again.
4. Choose **Resume compatible upload**.

The existing remote session is reused, and acknowledged ranges are not accepted as new bytes.

### Reject an incompatible source

Leave a paused record, then create and select a different-size fixture:

```bash
npm run example:uppy:fixture -- --output examples/uppy-react/.fixtures/different-inspection.tiff --size-mib 13
```

The selection has no compatible recovery entry and cannot resume the earlier upload.
The UI reports a safe recovery mismatch before any additional upload bytes are accepted; the stored record remains available for the original source.

### Cancel

Start a fresh ingest and choose **Cancel ingest**. The controller owns cancellation and remote cleanup. Uppy file removal is not treated as an upload lifecycle action.

### Validation failure

Select a local file that passes the Uppy selection restrictions but violates the configured ingest policy. The SDK rejects it before upload creation and displays a safe validation outcome.

## Architecture

- `src/UppySelection.tsx` renders only Uppy `Dropzone` and `FilesList` selection UI.
- `src/selection-bridge.ts` accepts only a local `File` and preserves the exact object.
- `src/App.tsx` owns `createIngestController`, controller controls, safe state, and recovery matching.
- `src/local-reference-transport.ts` re-exports the provider-neutral `UploadTransport` recipe from `examples/reference-local/`.
- `../reference-local/local-server.mjs` stores actual bytes and invokes the package's Node verification API for both official UI examples.

No Uppy uploader plugin is configured. Uppy does not own progress, retry, pause, resume, cancellation, or completion. The example never logs a full manifest or resume record.

This local service is intentionally small and credential-free. It is not hardened or supported as a production server. See the full [Uppy UI-only integration guide](../../docs/integrations/uppy.md) for ownership, security, and production transport guidance.
