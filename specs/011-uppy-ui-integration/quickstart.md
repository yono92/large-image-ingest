# Quickstart Validation: Uppy UI Integration

This guide defines the post-implementation validation target. The commands and example files described here do not exist until the feature is implemented.

## Prerequisites

- Node.js 20.19 or newer, or Node.js 22.12 or newer (Vite development-server requirement)
- npm 10 or newer
- A browser with File, Blob, Fetch, Web Storage, and Web Crypto support
- No cloud account, storage credentials, or tus server

## Install And Start

```bash
npm install
npm run example:uppy:fixture
npm run example:uppy
```

Expected result:

- the library builds before the example starts;
- one local reference service and one browser development server start;
- the terminal prints only local addresses and a temporary artifact root;
- the browser page exposes an Uppy local selector plus large-image-ingest controls and status;
- no external network target or credential is requested.

## Ownership Check

Inspect the running UI and browser network panel.

Expected result:

- Uppy provides file selection and selected-file presentation;
- there is no Uppy upload button, uploader plugin, upload progress, or tus/S3 request;
- start, pause, resume, cancel, failure, completion, and verification come from the large-image-ingest flow;
- network requests go only to the local reference service.

## Complete A Verified Upload

1. Select the generated multi-chunk fixture through Uppy.
2. Start ingest.
3. Observe acknowledged byte progress through completion.
4. Wait for the separate verification result.

Expected result:

- the exact selected `File` becomes the manifest original;
- progress reaches the source byte count;
- local status reports completion and stored-file verification success;
- duplicate accepted bytes remain zero;
- routine UI and logs contain no full manifest, resume record, filesystem path, or upload secret.

## Pause, Reload, And Resume

1. Start the fixture upload and pause after at least one chunk is acknowledged.
2. Record the displayed safe record ID, then reload the page.
3. Confirm that Uppy has no selected source after reload.
4. Select the same generated fixture again.
5. Resume the compatible record.

Expected result:

- recovery is unavailable until the source is reselected and classified;
- the previous remote upload is reused;
- already acknowledged ranges are not uploaded again;
- completion and final stored-file verification succeed.

Repeat this scenario 10 times through the focused integration test or documented stress option; all runs must retain zero duplicate bytes.

## Reject An Incompatible Source

1. Leave a recoverable record from a paused upload.
2. Select a same-named file with different size, modification identity, or bytes.
3. Attempt recovery.

Expected result:

- compatibility fails before additional bytes are accepted;
- the safe UI identifies a file mismatch without exposing record contents;
- the original record remains available until explicitly discarded.

## Cancel And Remove

1. Start a fresh ingest.
2. Attempt to remove the selected file while upload is active.
3. Confirm or invoke cancellation through the large-image-ingest control.
4. Remove the file after terminal cancellation.

Expected result:

- Uppy removal never silently detaches an active source;
- remote staging is cleaned or a safe cleanup failure is reported;
- no later chunk or completion call mutates the canceled session.

## Validation Failure

Select a local file that Uppy can hold but the configured ingest policy rejects, such as an empty allowed-extension fixture.

Expected result:

- large-image-ingest validation remains authoritative;
- no remote upload session is created;
- the UI displays a safe typed validation outcome.

## Friction And Decision Review

Review `docs/integrations/uppy-friction.md` after all scenarios pass.

Expected result:

- each observed issue has the evidence fields defined in [adapter-decision-contracts.md](contracts/adapter-decision-contracts.md);
- the final Uppy adapter outcome is exactly `defer` or `specify-adapter`;
- any `specify-adapter` result points to a separate formal feature specification;
- the tus-js-client brief remains a separate review and adds no dependency or public export.

## Repository Verification

```bash
npm run typecheck
npm run typecheck:examples
npm run typecheck:uppy-example
npm test
npm run build
npm run test:reference
npm pack --dry-run
```

Expected result:

- all existing gates remain green;
- the React example type-checks against built public exports;
- default tests remain credential-free;
- package inspection includes the runnable example and guide but no Uppy or tus-js-client runtime dependency.
