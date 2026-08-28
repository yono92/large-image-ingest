# tus-js-client Transport Review Brief

**State**: review-ready; implementation is out of scope

**Current outcome**: no-go for adding a runtime adapter in the Uppy UI integration

This brief separates a later transport decision from Uppy UI composition. The current recipe does not configure `@uppy/tus`, import `tus-js-client`, add a public export, or change the existing transport contract.

## Why This Is A Separate Decision

`large-image-ingest/transport-tus` currently implements the SDK's `UploadTransport` contract with browser `fetch`. The SDK owns chunk planning, retries, pause, cancel, persistent receipts, progress truth, and manifest completion. `tus-js-client` is designed to own much of the upload of a whole file. Wrapping it as if it were a per-chunk request helper would create two overlapping state machines.

Uppy selection UI does not require this change. `@uppy/tus` also couples Uppy to transfer ownership and is intentionally excluded from the UI-only recipe.

## Responsibility Matrix

| Responsibility | Current SDK owner | Likely `tus-js-client` owner | Review question |
| --- | --- | --- | --- |
| Source validation and manifest | SDK core | Caller | Keep SDK ownership. |
| Chunk sizing and slicing | SDK session | tus client | Which plan is authoritative? |
| Retry and backoff | SDK session/transport | tus client | Can one layer be disabled without losing typed behavior? |
| Upload URL persistence | SDK resume record | tus client URL storage hooks | Can the URL be stored once without parallel persistence? |
| Offset reconciliation | Current tus transport plus receipts | tus client | How are SDK receipts derived and validated? |
| Pause and cancellation | SDK controller | tus upload instance | Can controller semantics map without races? |
| Progress | Acknowledged SDK bytes | tus client callbacks | Which observations are authoritative and persistable? |
| Completion evidence | SDK manifest and transport receipt | tus success callback | How is remote success bound to the manifest identity? |
| Stored-file verification | Application/server | Outside tus client | Preserve the current separate verification step. |

## Compatibility Questions

1. Can a whole-file tus client participate behind the current per-chunk `UploadTransport` interface without fake chunk receipts or duplicate retry ownership?
2. If a new whole-file transport interface is required, can existing manifest, session snapshot, event, and typed error contracts remain stable?
3. Can the SDK remain the sole durable resume-record owner while using `tus-js-client` URL callbacks and fingerprint behavior?
4. How are server offsets reconciled with existing versioned receipts after crash, reload, or a request whose response is lost?
5. Can pause and cancel preserve the controller's current terminal-state and remote-cleanup guarantees?
6. Which tus extensions and protocol versions are required, optional, or rejected?
7. What bundle-size, browser-support, ESM/CJS, and runtime-dependency cost would adopters incur?
8. Can applications migrate from the raw `fetch` tus transport without invalidating existing resume records?

## Required Experiments

Run these experiments in a separate specification and prototype package; do not change the shipped adapter first.

1. **Whole-file ownership prototype**: Map one SDK controller to one tus client upload while retaining SDK validation, manifest identity, events, and typed errors.
2. **Crash and lost-response recovery**: Interrupt after the server commits bytes but before the client receives the response; prove server-offset reconciliation without duplicate accepted bytes.
3. **Reload recovery**: Persist one sanitized SDK resume record, reselect the source, validate compatibility, and reuse the upload URL without relying on private tus client state.
4. **Pause/cancel races**: Exercise abort during request, pause at multiple offsets, remote termination support, and cleanup failure reporting.
5. **Retry ownership**: Compare SDK-owned, client-owned, and explicitly partitioned retry policies under transient HTTP failures.
6. **Migration fixture**: Attempt recovery of an existing raw-transport tus session and document whether record migration is safe, impossible, or version-gated.
7. **Packaging**: Measure browser bundle delta, module compatibility, and whether the dependency can remain isolated to an optional subpath.

Each experiment must use a local tus server by default, require no credentials, verify the final stored original, and capture transmitted and duplicate-accepted byte counts.

## Go / No-Go Gate

Proceed to a formal adapter specification only if all of the following are true:

- exactly one layer owns chunking, retry, durable resume, pause, cancellation, and authoritative progress;
- manifest identity and existing completion verification remain intact;
- crash, reload, and lost-response trials show no duplicate accepted bytes across ten consecutive runs;
- the adapter can use supported public tus client APIs and remain an optional dependency surface;
- migration behavior for existing resume records is explicit and safely versioned;
- the maintenance or interoperability benefit is greater than keeping the small current raw transport.

Use **no-go** if the implementation requires fake receipts, parallel URL stores, two retry loops, private APIs, weakened cancellation semantics, or silent resume-record incompatibility. A no-go result does not block the existing `large-image-ingest/transport-tus` adapter.

## Prerequisite Evidence From This Feature

Before opening the follow-up specification, retain these completed Uppy integration results:

- one exact local `File` reaches one SDK controller;
- Uppy has no transfer ownership;
- public resume compatibility checks work after reselection;
- ten local interruption/recovery trials accept no duplicate bytes;
- transfer completion and stored-file verification remain distinct.

The dependency and export inspection for this feature must continue to show zero `tus-js-client` additions.

## Current Dependency And Export Inspection

Inspection on 2026-08-28 found:

- `npm ls tus-js-client --all --json` returned no installed package;
- `package.json`, `package-lock.json`, and `src/tus.ts` contain no `tus-js-client` reference;
- production `dependencies` remain empty;
- the published export keys remain `.`, `core`, `transport-s3`, `transport-tus`, `node`, `react`, and `tiff` with no Uppy or tus-js-client adapter export;
- Uppy core, Uppy React, and Vite exist only under `devDependencies` for the repository example.

This satisfies the no-runtime-change gate for the present feature.
