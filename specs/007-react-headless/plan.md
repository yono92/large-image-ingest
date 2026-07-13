# Implementation Plan: React Headless Adapter

**Branch**: `agent/sdk-1-3-0` | **Date**: 2026-07-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-react-headless/spec.md`

## Summary

Add an optional `large-image-ingest/react` subpath with a stable external ingest controller, context provider, and headless state/progress/control hooks. Use React's external-store subscription contract for concurrent rendering and SSR while keeping React out of all existing entrypoints and shipping no visual components or CSS.

## Technical Context

**Language/Version**: TypeScript 5.x; React 18 and 19 public APIs; Node.js 20+ build and test runtime

**Primary Dependencies**: React as an optional peer dependency; no new dependency for core entrypoints

**Storage**: Existing optional `ResumeStore`; adapter state remains in memory

**Testing**: Vitest with fake core transports and focused React test-renderer consumers

**Target Platform**: React browser applications and React server rendering; existing non-React browser and Node consumers remain supported

**Project Type**: TypeScript library with optional package subpath

**Performance Goals**: One immutable controller snapshot per state revision; no duplicate active session operation; subscriber notification proportional to active listeners

**Constraints**: No styled UI, CSS, React import from root/core/transports/Node, global controller state, or change to original file/manifest/resume contracts

**Scale/Scope**: One file and one active ingest operation per controller; multiple React consumers per provider

## Constitution Check

*GATE: Passed before research and rechecked after design.*

- Original preservation: PASS. The adapter forwards the original file to core without decoding or mutation.
- Recoverability: PASS. Snapshot, progress, terminal state, resume record ID, pause, resume, and cancel remain explicit.
- Adapter boundaries: PASS. React is isolated to `large-image-ingest/react`; core and transports never import it.
- TypeScript contracts: PASS. Controller state, actions, provider props, and hooks are exported from the optional subpath.
- Validation and security: PASS. The adapter reuses redacted event snapshots and does not add default logging or persistence.
- Documentation and tests: PASS. Package exports, optional peer behavior, Strict Mode subscription cycles, SSR, progress, actions, and failure mapping receive focused tests and examples.

## Project Structure

```text
src/
|-- react-controller.ts
`-- react.ts

tests/
|-- react-controller.test.ts
|-- react.test.ts
`-- package-exports.test.ts

specs/007-react-headless/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/react-headless-contracts.md
|-- checklists/requirements.md
`-- tasks.md
```

**Structure Decision**: Keep the first React adapter as an optional subpath in the existing package. Split to a scoped companion package only if its dependencies, components, or release cadence grow independently.

## Complexity Tracking

No constitution violations require justification.
