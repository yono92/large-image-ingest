# First-Party Inspection Upload Reference

This credential-free application uses only the public `large-image-ingest/react-ui`, headless controller, core recovery store, and provider-neutral local reference transport.

```bash
npm install
npm run example:inspection-ui:fixture
npm run example:inspection-ui
```

Open `http://127.0.0.1:4176`. Select the generated TIFF from `examples/reference-local/.fixtures/`, start ingest, observe acknowledged progress, pause/resume or reload and reselect the same original, test a different-file mismatch, cancel an active transfer, and confirm transfer completion remains separate from stored-original verification. Select an unsupported file to reproduce validation failure. The “Composed theme” view demonstrates public primitives and token-based branding without copying lifecycle logic.

The example never generates a preview or transforms the selected original. The local server stores temporary data under the operating-system temporary directory and requires no provider credentials.
