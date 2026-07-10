# Feature Specification: React Headless Adapter

**Feature Branch**: `agent/sdk-1-3-0`

**Created**: 2026-07-10

**Status**: Implemented

**Input**: User description: "Add React headless hooks as part of the same 1.3.0 release, without turning the core SDK into a styled upload UI."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bind Upload State To React (Priority: P1)

As a React application developer, I can subscribe to one ingest session and render current status, byte progress, errors, manifest results, and recovery identifiers without manually translating every core event.

**Why this priority**: The core already exposes complete state, but each React consumer currently has to build lifecycle-safe subscriptions and state mapping independently.

**Independent Test**: Drive a fake ingest session through upload and completion, then verify a mounted hook consumer receives stable idle, uploading, and completed state with correct progress and no duplicate session operations.

**Acceptance Scenarios**:

1. **Given** an idle controller, **When** upload starts, **Then** subscribed React consumers receive uploading state and monotonic byte progress.
2. **Given** an upload completes, **When** the final snapshot arrives, **Then** consumers receive completed state and the resulting manifest.
3. **Given** an upload fails, **When** the promise rejects, **Then** consumers receive failed state and the original typed error.

---

### User Story 2 - Control Uploads Without Prescribed UI (Priority: P1)

As a React application developer, I can start, resume, pause, and cancel through stable headless actions that can be attached to any design system.

**Why this priority**: Industrial applications require custom layouts and controls; the adapter should supply behavior without imposing visual components or CSS.

**Independent Test**: Bind the returned actions to a hook consumer, invoke each supported action, and verify it delegates once to the active core session while state updates remain observable.

**Acceptance Scenarios**:

1. **Given** a configured controller, **When** `start` is invoked, **Then** one core session starts and repeated concurrent calls share the same in-flight result.
2. **Given** an active session, **When** pause or cancel is invoked, **Then** the core action is delegated and React state reflects the resulting snapshot.
3. **Given** a persistent record ID, **When** resume is invoked, **Then** the controller delegates persistent resume and exposes the record ID in state.

---

### User Story 3 - Compose State Through Context (Priority: P2)

As a React application developer, I can provide one controller to a component subtree and consume session, progress, and control hooks independently without prop drilling.

**Why this priority**: Upload progress, controls, recovery, and diagnostics often appear in separate application components.

**Independent Test**: Render multiple consumers under one provider and verify they observe the same controller snapshot, while use outside the provider fails with an actionable error.

**Acceptance Scenarios**:

1. **Given** multiple consumers under one provider, **When** controller state changes, **Then** each consumer receives the same state revision.
2. **Given** a context hook outside the provider, **When** it runs, **Then** it fails with a clear adapter usage error.

### Edge Cases

- A component unmounts while upload continues.
- React Strict Mode subscribes and unsubscribes more than once.
- Multiple components invoke start during the same render cycle.
- Pause or cancel is requested while no operation is active.
- A core observer callback fails and is reported without breaking React updates.
- Server rendering reads an idle snapshot without accessing browser globals.
- React is not installed and consumers never import the React subpath.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The adapter MUST be published through an optional React-specific subpath and MUST NOT be imported by existing root, core, transport, or Node entrypoints.
- **FR-002**: The adapter MUST expose a stable external controller with subscribe, snapshot, start, resume, pause, and cancel operations.
- **FR-003**: Controller state MUST include lifecycle status, byte progress, current snapshot, manifest result, error, and active resume record ID when available.
- **FR-004**: Concurrent start or resume calls MUST NOT create duplicate active operations.
- **FR-005**: React state subscription MUST be safe under concurrent rendering, Strict Mode subscription cycles, and server rendering.
- **FR-006**: The adapter MUST provide a context provider and hooks for complete session state, progress, and controls.
- **FR-007**: Hooks that require context MUST fail with an actionable typed or standard error when no provider exists.
- **FR-008**: The adapter MUST render no visible UI and MUST ship no mandatory CSS.
- **FR-009**: React MUST remain an optional peer dependency so non-React consumers can install and use the core package without loading React.
- **FR-010**: Controller subscriptions MUST be removable and MUST NOT retain unmounted React consumers.
- **FR-011**: Existing core observer, snapshot redaction, original preservation, manifest, resume, and transport behavior MUST remain unchanged.
- **FR-012**: Documentation MUST include one custom progress and controls example and explicitly distinguish headless behavior from styled components.

### Key Entities

- **Ingest Controller**: Stable bridge that owns one core session, maps notifications to immutable UI state, deduplicates active operations, and exposes actions.
- **React Ingest State**: Immutable snapshot consumed by React, containing lifecycle, progress, result, error, and recovery information.
- **Ingest Provider**: Context boundary that supplies one controller to multiple headless hooks.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Hook tests observe every required terminal state and accurate byte progress without duplicate transport start, resume, or completion calls.
- **SC-002**: 100% of subscription tests remove listeners after unmount and remain correct under repeated subscribe/unsubscribe cycles.
- **SC-003**: Importing existing non-React entrypoints requires no React runtime and their package smoke tests remain unchanged.
- **SC-004**: The React subpath type checks against supported React 18 and 19 APIs and passes focused render-hook tests.
- **SC-005**: Existing type checks, tests, builds, and package consumption checks continue to pass.

## Assumptions

- The first adapter targets React 18+ because its external-store subscription API is available there.
- The current single-package subpath model is preferred for the first adapter; a scoped companion package can be introduced later if independent release cadence becomes necessary.
- Styled dropzones, dashboards, file grids, TIFF rendering, and multi-file queues remain outside this headless feature.
