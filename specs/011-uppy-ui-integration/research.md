# Research: Uppy UI Integration

## Decision: Use Uppy Headless React Components For Selection Only

**Decision**: Use the current Uppy major's core plus React headless selection components, with one stable Uppy instance, one-file restrictions, automatic upload disabled, and no uploader, remote-source, preprocessor, image-editor, or thumbnail-generation plugin.

**Rationale**: Uppy documents three React UI levels and places its headless components under `UppyContextProvider`. `Dropzone` and `FilesList` provide recognizable Uppy selection UI without requiring the Dashboard's upload status controls. This keeps the example small and prevents Uppy from presenting a second authoritative upload lifecycle. See the official [Uppy React documentation](https://uppy.io/docs/react/).

**Alternatives considered**:

- Full Dashboard with upload controls hidden: viable, but rejected for the first recipe because Dashboard normally includes an upload button/status bar and thumbnail generator. Each must be deliberately disabled, creating more ways to blur ownership. See [Dashboard options](https://uppy.io/docs/dashboard/).
- A plain native file input: rejected because it would not validate the requested Uppy integration.
- Uppy hooks plus entirely application-styled controls: valid later, but the headless components give a runnable and visibly Uppy-based baseline with less example code.

## Decision: Treat Only A Local Browser `File` As A Supported Selected Source

**Decision**: Read Uppy file state through its documented state/event surface, accept exactly one local `File`, and reject or explain Blob-only or remote-provider entries in the initial recipe.

**Rationale**: The library requires a Blob-like source with file identity. Local Uppy selection supplies the original browser file without a download or transform. Uppy documents `file-added`, `file-removed`, and immutable file state for composition; those are sufficient without a custom Uppy plugin. See [Uppy core events and state](https://uppy.io/docs/uppy/).

**Alternatives considered**:

- Accept remote Uppy sources through Companion: deferred because remote acquisition changes who owns the source bytes and may require an intermediate download, authentication, and source-identity policy.
- Wrap arbitrary Uppy Blobs by adding a name: rejected for the reference path because it can erase provenance and recovery identity details.
- Support a multi-file queue immediately: deferred because the existing React controller is intentionally one file and one active operation per controller; scheduling is an application-level feature not needed to prove composition.

## Decision: Keep large-image-ingest State Authoritative Instead Of Mirroring An Uppy Upload

**Decision**: Use Uppy only to observe selection. Render validation, progress, pause, resume, cancellation, failure, completion, and verification from the large-image-ingest controller and reference service. Do not call Uppy upload/pause/retry/cancel APIs and do not synthesize an Uppy upload result.

**Rationale**: Uppy upload APIs operate on Uppy uploader plugins and their state. The existing ingest session already owns chunk planning, retry, durable receipts, and transport state. Mirroring both directions would create race conditions and misleading completion semantics. Uppy explicitly notes that its pause/resume operations require a resumable uploader plugin; that is not part of this UI-only path. See [Uppy core upload APIs](https://uppy.io/docs/uppy/).

**Alternatives considered**:

- Copy acknowledged progress into Uppy file state: deferred as optional UI polish because it makes Uppy appear authoritative and requires careful terminal/error mapping.
- Implement an Uppy uploader plugin immediately: rejected until real API friction proves reusable library-owned coordination.
- Let Uppy upload while large-image-ingest observes: rejected because the current library cannot create authoritative per-chunk receipts, resume records, and completion verification from opaque external transfer state.

## Decision: Use A Credential-Free Local HTTP Reference Transport In The Example

**Decision**: Give the React example an example-private local HTTP transport and Node service modeled on the existing loopback reference harness. The service stages actual byte ranges, records acknowledgements, supports recovery lookup and cancellation, verifies the stored original, and reports only safe status.

**Rationale**: This proves real network transfer, reload recovery, and final stored-file integrity without binding the Uppy recipe to S3, tus, NAS, credentials, or an external service. It also isolates UI composition from transport choice, which is central to the library's adapter model.

**Alternatives considered**:

- In-memory fake transport: rejected because UI completion alone would not prove stored-byte integrity or recovery across a page reload.
- Existing raw tus transport plus a new local tus server: rejected for the first example because implementing a protocol server distracts from the Uppy composition and incorrectly suggests tus is required.
- Cloud-backed example: rejected because it would require credentials and provider-specific setup.

## Decision: Manage Example Dependencies At The Repository Root

**Decision**: Add compatible Uppy and browser development packages as root development dependencies, keep React as the existing optional peer, and provide root scripts that build the library, start the local service and client, and create a deterministic multi-chunk fixture.

**Rationale**: One root install gives contributors and evaluators a reproducible lockfile and lets the example exercise built package exports. Uppy remains absent from runtime dependencies and production entrypoints.

**Alternatives considered**:

- A nested example package with a second lockfile: rejected because it creates duplicate dependency maintenance and a two-install quickstart.
- An npm workspace conversion: rejected as unnecessary structural change for one example.
- Import library source through development aliases: rejected because it would not prove the published subpath contracts.

## Decision: Record Friction Before Designing A Public Uppy Adapter

**Decision**: Keep a structured friction log during implementation. Create a separate Uppy adapter specification only when a mandatory flow is unsafe or impossible through documented public APIs, or when at least two medium-or-higher evidence records independently identify the same application-agnostic coordination gap.

**Rationale**: The current public surface already exposes file-based controllers, lifecycle state, controls, resume records, and typed ingest errors. A recipe may be sufficient. The evidence gate prevents packaging convenience-only glue while still allowing a repeated ownership or correctness problem to become a formal adapter feature.

**Alternatives considered**:

- Commit to an adapter now: rejected because its required API is not yet known.
- Never add an adapter: rejected because actual composition may reveal missing lifecycle or state contracts.
- Treat line count as the gate: rejected because a small amount of correctness-critical code can justify an adapter while a larger amount of application-specific UI code does not.

## Decision: Defer tus-js-client Until A Transport-Ownership Review

**Decision**: Do not use `@uppy/tus` or tus-js-client in this feature. After the Uppy example is validated, review whether tus-js-client should remain unnecessary, replace the raw fetch tus implementation, or require a new transport-owned whole-file execution mode.

**Rationale**: Uppy states that `@uppy/tus` wraps tus-js-client, so using it would give Uppy the transfer engine rather than UI-only responsibility. tus-js-client itself owns a whole `File`/`Blob` upload, automatic retries, progress callbacks, abort/termination, upload URL storage, and optional parallel uploads. The current large-image-ingest `UploadTransport` instead receives one core-planned chunk at a time and owns its own retry and versioned resume record. Nesting the two models would duplicate authority. See [Uppy Tus](https://uppy.io/docs/tus/) and the official [tus-js-client API](https://github.com/tus/tus-js-client/blob/main/docs/api.md?plain=1).

**Alternatives considered**:

- Use `@uppy/tus` in the Uppy example: rejected because it violates the UI-only boundary and bypasses authoritative ingest receipts.
- Wrap tus-js-client inside the current per-chunk method: rejected as a planning default because tus-js-client is designed to own the whole source and upload URL; treating every core chunk as an independent upload would be incorrect.
- Replace the current raw fetch tus adapter immediately: deferred until protocol extension coverage, bundle/dependency cost, progress semantics, retry ownership, resume migration, and testability are compared with measured needs.

## Resolved Technical Context

- Uppy compatibility target: current 5-compatible Uppy packages, pinned to matching compatible versions in the implementation lockfile.
- UI shape: headless Uppy local selection components; large-image-ingest application controls beside them.
- Example transport: example-private local HTTP adapter, not a new package export.
- Recovery: existing `WebStorageResumeStore`, recoverable-record listing/classification, same-file reselection, and server-side session lookup.
- Verification: reference service verifies staged/completed bytes against the manifest and exposes a safe outcome.
- Public API impact: none expected; all proposals wait for friction evidence and a separate specification.
- tus-js-client impact: review document only; zero runtime or development dependency in this feature unless a later dedicated feature approves it.
