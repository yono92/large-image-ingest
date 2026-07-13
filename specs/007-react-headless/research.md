# Research: React Headless Adapter

## Decision: Use An External Controller And `useSyncExternalStore`

**Decision**: Map the core session into a stable controller with `subscribe` and `getState`, and bind hooks with React's external-store API.

**Rationale**: The core session exists outside React. React documents `useSyncExternalStore` for subscribing safely to external mutable sources, including concurrent rendering and server snapshots.

**Alternatives considered**:

- Mirror events with `useEffect` and component state: rejected because Strict Mode cycles and tearing are easier to mishandle in every consumer.
- Put React state inside core: rejected because core must remain framework-agnostic.

## Decision: Publish An Optional Subpath First

**Decision**: Export `large-image-ingest/react` and keep React as an optional peer dependency compatible with React 18 and 19.

**Rationale**: It creates one coordinated 1.3.0 release, preserves existing package installation, and avoids requiring an npm organization before the adapter's boundaries are proven.

**Alternatives considered**:

- Publish `@large-image-ingest/react` immediately: deferred because it requires separate scope ownership and release configuration.
- Export React from the package root: rejected because non-React imports could resolve React unnecessarily.

## Decision: Controller Owns Operations, Not Visuals

**Decision**: The controller creates core sessions, deduplicates one active start/resume operation, delegates pause/cancel, and publishes immutable state. The React layer adds only provider and hooks.

**Rationale**: Custom industrial UI needs behavior and reliable state, not a fixed dashboard.

**Alternatives considered**:

- Ship Dropzone and progress components: deferred until headless usage validates terminology and state needs.
- Make each hook create its own core session: rejected because multiple consumers could duplicate uploads.

## Decision: Keep Resume Listing Out Of The First Controller

**Decision**: Expose the active record ID now; defer a reactive resume-record collection until stores have a subscription or refresh contract.

**Rationale**: The current `ResumeStore` only supports asynchronous list operations and has no change notification. Polling inside the first adapter would add hidden behavior.

**Alternatives considered**:

- Poll `ResumeStore.list`: rejected because cadence, lifecycle, and storage cost are application-specific.
