# Implementation Plan: Session Module Split

## Approach

- `src/session.ts` becomes a thin facade: `LargeImageIngestSession` holds a private `SessionRuntime` and forwards its six public methods.
- `src/session-runtime.ts`: internal `SessionRuntime` class with all session state, `start`, `resume`, lifecycle control, snapshots and events. Not exported from any entry point.
- `src/session-transfer.ts`: sequential chunk loop, retry, checkpointing, receipts and completion.
- `src/session-parallel.ts`: parallel worker pool, admission, chunk integrity evidence and parallel resume checks.
- `src/session-resume.ts`: source identity, resume record creation, validation, hydration and status updates.
- Former private methods become functions taking the runtime as the first argument; bodies are moved mechanically (`this.` → `rt.`). Shared constants move to `src/session-state.ts`.

## Verification

`npm run typecheck`, `npm test`, `npm run build`, `npm run size`, and a diff of non-`private` lines in `dist/esm/session.d.ts` against the 1.9.2 build.
