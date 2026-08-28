# Implementation Plan: Uppy UI Integration

**Branch**: `main` | **Date**: 2026-08-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-uppy-ui-integration/spec.md`

## Summary

Add a documented Uppy UI-only composition path and a credential-free React reference application. Uppy supplies local file selection components and selected-file state; the existing large-image-ingest React controller remains the only owner of validation, checksum, manifest, upload, retry, pause, cancellation, persistent resume, progress truth, completion, and verification. The first implementation adds no public adapter and no runtime dependency. It records concrete API friction, applies an adapter decision gate after the example works, and leaves tus-js-client as a separately reviewed transport architecture choice.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18/19, ESM-first browser code, Node.js 20+ for the local reference service, and Node.js 20.19+ or 22.12+ for the Vite example launcher

**Primary Dependencies**: Existing `large-image-ingest/core`, `large-image-ingest/react`, and Node verification APIs; React optional peer; development-only Uppy 5-compatible core and React UI packages plus a lightweight browser development server

**Storage**: Browser Web Storage for existing versioned resume records; temporary local filesystem staging and completed originals in the credential-free reference service; no production database or cloud storage

**Testing**: Vitest for selection-bridge, lifecycle, removal, resume, and local transport behavior; TypeScript checks for the React example; credential-free loopback integration verification; manual browser quickstart for visible UI states

**Target Platform**: Modern browsers with `File`, `Blob`, Web Storage, Fetch, and Web Crypto support; Node.js 20+ only for the local example service

**Project Type**: Published TypeScript library with documentation and an independently runnable React example application

**Performance Goals**: Keep source handling slice/stream based with no whole-file buffering introduced by the integration; demonstrate at least three chunks, acknowledged-byte progress, interruption after durable progress, and byte-exact completion

**Constraints**: One active local file; no Uppy uploader/preprocessor/remote-source plugin; no source mutation; no new package export or runtime dependency; no sensitive resume or upload state in routine UI/logs; no cloud credentials; no tus-js-client implementation in this feature

**Scale/Scope**: One integration guide, one runnable React example and local service, focused integration coverage, one friction/decision record, one tus-js-client follow-up brief, and README/verification wiring

## Constitution Check

*GATE: Passed before research and re-checked after design.*

- Original preservation: PASS. Only the Uppy-selected local `File` is handed to the ingest controller; no preprocessing plugin, image editor, thumbnail generator, resize, recompression, or EXIF mutation participates in the reference path.
- Recoverability: PASS. large-image-ingest remains authoritative for progress, retry, pause, cancellation, resume records, same-file compatibility, completion, and verification. Browser reload recovery explicitly requires reselecting the source.
- Adapter boundaries: PASS. Uppy integration is application composition and documentation first. Core, transports, and React headless APIs do not import Uppy. A formal adapter requires a later evidence gate.
- TypeScript contracts: PASS. Initial work consumes existing public types. Example-private bridge and local HTTP contracts are documented separately; any proposed public API change must trace to friction evidence and a new adapter specification.
- Validation and security: PASS. large-image-ingest validation remains authoritative, local filenames never become filesystem paths, full manifests and resume handles remain out of routine output, and the reference path uses no credentials.
- Documentation and tests: PASS. The design covers selection, rejection, active removal, progress, pause, reload/reselection recovery, incompatible recovery, cancellation, completion, stored-file verification, example type checking, and existing package gates.

## Project Structure

### Documentation (this feature)

```text
specs/011-uppy-ui-integration/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- uppy-ui-composition-contracts.md
|   |-- local-reference-http-contract.md
|   `-- adapter-decision-contracts.md
`-- checklists/
    `-- requirements.md
```

### Source Code (repository root)

```text
README.md
package.json
package-lock.json
tsconfig.uppy-example.json

docs/
`-- integrations/
    |-- uppy.md
    |-- uppy-friction.md
    `-- tus-js-client-review.md

examples/
`-- uppy-react/
    |-- README.md
    |-- index.html
    |-- vite.config.ts
    |-- local-server.mjs
    `-- src/
        |-- App.tsx
        |-- main.tsx
        |-- local-reference-transport.ts
        `-- selection-bridge.ts

scripts/
|-- create-uppy-example-fixture.cjs
`-- run-uppy-example.cjs

tests/
|-- uppy-selection-bridge.test.ts
`-- uppy-reference-integration.test.ts
```

**Structure Decision**: Keep Uppy code entirely in documentation, examples, tests, and development dependencies. The example uses Uppy headless React selection components and an example-private local HTTP transport so the upload backend is real but provider-neutral. Do not add `src/uppy.ts`, an Uppy package subpath, `@uppy/tus`, or tus-js-client until the post-example decision gates justify separate work.

## Delivery Sequence

1. Write the ownership-first Uppy recipe and selection/lifecycle mapping before example code, so implementation has one authoritative boundary.
2. Build the runnable React example and local reference service using existing public package contracts; add repeatable fixture generation and verification.
3. Record API friction while building and exercising the example, then resolve documentation/example issues without changing public API.
4. Apply the Uppy adapter decision gate. If triggered, create a separate Spec Kit feature and stop before adapter implementation; otherwise record the deferral.
5. Finalize the tus-js-client review brief from the proven integration evidence. Any transport work begins only under a later specification and plan.

## Complexity Tracking

No constitution violations require justification.
