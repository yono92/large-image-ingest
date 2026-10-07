# Feature Specification: TypeScript Tooling Sources

**Feature Branch**: `codex/typescript-tooling`
**Created**: 2026-10-07
**Status**: Implemented and verified
**Input**: Explain Spec Kit shell scripts and eliminate handwritten JavaScript sources from Git.

## User Scenarios & Testing

### User Story 1 - One typed source language (Priority: P1)
A maintainer edits SDK, examples, development scripts, benchmarks and test fixtures using TypeScript with meaningful compile-time checks.
**Independent Test**: Inventory source files and run the compiler over every migrated source group.
**Acceptance Scenarios**:
1. All 44 existing handwritten JavaScript sources have typed counterparts, with no handwritten .js/.mjs/.cjs left in the working source tree.
2. Wrong adapter arguments or incompatible persisted records fail type checking without blanket suppression.

### User Story 2 - Keep executable onboarding (Priority: P2)
A consumer runs packaged examples with Node 20+ without installing a development loader.
**Independent Test**: Pack the SDK and run both compiled onboarding examples in an isolated consumer.
**Acceptance Scenarios**:
1. Minimum transfer independently verifies stored bytes.
2. Full workflow reconstructs its client and reloads persisted evidence after recovery.
3. Existing ESM/CommonJS SDK entrypoints remain compatible.

### User Story 3 - Keep reproducible developer workflows (Priority: P3)
A contributor runs build, tests, examples and benchmark commands from a clean checkout.
**Independent Test**: Run package checks without pre-existing generated files; preserve historical evidence separately from new measurements.
**Acceptance Scenarios**:
1. Build bootstraps without relying on already compiled development scripts.
2. Test fixtures and child processes execute on the supported runtime.
3. SDK commands work without Spec Kit executables; skills requiring these tools document separate provisioning; local feature pointers are not shared state.

### Edge Cases
- CommonJS and ESM module semantics, package root resolution and child-process loaders must remain correct.
- JSON/network input retains runtime validation and conservative errors.
- Source migration changes benchmark source hashes and line counts; historical figures must not be relabelled as current.
- Uploaded originals, recovery authority and safe output remain unchanged.

## Requirements
- **FR-001**: Replace all 44 handwritten JavaScript sources with TypeScript, including tools, benchmarks, examples and test fixtures.
- **FR-002**: Typecheck migrated code; use typed SDK contracts and explicit external-data boundaries. Do not use ts-nocheck or blanket implicit-any exemptions.
- **FR-003**: Keep public SDK APIs, artifact schemas and original-preservation behavior unchanged.
- **FR-004**: Compile shipped executable examples to JavaScript before packaging; consumer commands must need only Node 20+.
- **FR-005**: Keep development commands and tests executable from a clean checkout, without generated JavaScript committed to Git.
- **FR-006**: Update source imports, child-process commands, build configuration, package scripts, CI and documentation together.
- **FR-007**: Remove shell helpers locally and remove .cjs/.mjs/.sh files from all Git branch/tag histories at the user’s explicit request; ignore these extensions and keep machine-local feature state outside Git.
- **FR-008**: Preserve dated historical benchmark evidence; refresh changed-source evidence and its claims honestly.
- **FR-009**: Verify source inventory, typecheck, tests, build, package consumer, reference/conformance and browser checks appropriate to changed tooling.

## Success Criteria
- **SC-001**: Zero handwritten JavaScript source files remain outside ignored generated/dependency directories.
- **SC-002**: Every migrated source is covered by compiler checks with no blanket suppression.
- **SC-003**: Both packaged examples complete verified workflows without a loader or optional peers.
- **SC-004**: Standard developer and package compatibility checks pass from a clean generated-output state.
- **SC-005**: Evidence accurately identifies the migrated source revision and measurement boundaries.

## Assumptions & Clarifications
- User explicitly requires TypeScript source; compiled JavaScript is still the executable npm distribution format.
- User explicitly authorized pushing the migration and removing .cjs/.mjs/.sh files from past commits and tags, including force-pushing rewritten history. Remove all six local shell helpers and document the separate tool dependency.
- Existing constitution 1.0.0 applies; no public API/version bump or new release is part of this migration request.
- A development-only loader is allowed; npm consumers must not depend on it.
- No critical ambiguity remains after this scope clarification.
