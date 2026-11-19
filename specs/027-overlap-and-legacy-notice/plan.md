# Implementation Plan: Checksum/Upload Overlap And Legacy Resume Notice

- `src/session-overlap.ts`: admission check, starting the checksum with the session abort signal, settling it into the manifest with the `expected` check, and promoting the resume record in one write.
- `src/session-runtime.ts`: builds the manifest with `checksum: false` when overlapping, starts the checksum after validation, skips the initial resume record, settles the checksum before `completeUpload`; emits `resume:legacy-record` in `resume()`.
- `src/session-transfer.ts`: after each stored receipt, promotes the record when the checksum has finished, and rethrows a failed checksum.
- `src/types.ts`: `overlapChecksum` option and `resume:legacy-record` event; `src/diagnostics.ts` projects the event.
- Tests: `tests/session-overlap.test.ts`, legacy event assertion in `tests/s3.test.ts`.
