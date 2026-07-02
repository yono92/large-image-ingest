# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]

**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]

**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]

**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]

**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]

**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]

**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]

**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]

**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Original preservation: confirms the source artifact is never mutated and all
  previews, tiles, compressed outputs, or metadata extracts are derivatives.
- Recoverability: defines observable progress/failure states and distinguishes
  transient retry from durable resume when uploads are involved.
- Adapter boundaries: keeps core logic framework-agnostic and provider-neutral;
  transport, storage, preview, Node, and React behavior remain adapters.
- TypeScript contracts: identifies public types, versioned artifacts, and
  compatibility impact for manifests, sessions, events, errors, and adapters.
- Validation and security: covers untrusted filenames/metadata, typed error
  codes, sensitive token handling, and opt-in network/cloud tests.
- Documentation and tests: lists README/spec updates and focused tests required
  for manifest, validation, state transition, chunking, retry/resume, checksum,
  and fake-transport behavior.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
?쒋?? plan.md              # This file (/speckit-plan command output)
?쒋?? research.md          # Phase 0 output (/speckit-plan command)
?쒋?? data-model.md        # Phase 1 output (/speckit-plan command)
?쒋?? quickstart.md        # Phase 1 output (/speckit-plan command)
?쒋?? contracts/           # Phase 1 output (/speckit-plan command)
?붴?? tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
?쒋?? models/
?쒋?? services/
?쒋?? cli/
?붴?? lib/

tests/
?쒋?? contract/
?쒋?? integration/
?붴?? unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
?쒋?? src/
??  ?쒋?? models/
??  ?쒋?? services/
??  ?붴?? api/
?붴?? tests/

frontend/
?쒋?? src/
??  ?쒋?? components/
??  ?쒋?? pages/
??  ?붴?? services/
?붴?? tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
?붴?? [same as backend above]

ios/ or android/
?붴?? [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
