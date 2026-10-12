# Feature Specification: Real-File Onboarding And Package Portability

**Feature Branch**: `codex/typescript-tooling` (existing maintenance checkout)
**Created**: 2026-10-12
**Status**: Implemented and verified for 1.8.2
**Input**: Implement all three proposed improvements: use my image in the executable example, validate real package-manager installations, and explain example failures safely.

## User Scenarios & Testing

### User Story 1 - Verify my original (Priority: P1)

A developer supplies their own local image to the minimal example and confirms the stored original matches the source.
**Why this priority**: Evaluate the SDK with the developer's actual inspection artifact.
**Independent Test**: Upload a supplied image, compare source/stored bytes and checksums, and confirm the source remains unchanged.
**Acceptance Scenarios**:
1. No file argument preserves the generated TIFF example.
2. A supplied non-empty regular file uploads untouched bytes and independently verifies stored bytes without a whole-file memory read.
3. Missing, unreadable, empty or non-regular input fails before transfer with a safe cause.
4. Paths with spaces work; changed input cannot produce verified success.

### User Story 2 - Install with my package manager (Priority: P2)

A developer installs the same distributable using npm, pnpm, Yarn or Bun and imports the SDK and runs examples.
**Why this priority**: Installation support needs executable evidence.
**Independent Test**: Install a local distributable in isolated consumers, import modules and run both examples without optional peers or checkout tooling.
**Acceptance Scenarios**:
1. All four managers install the package and resolve ESM and CommonJS.
2. Both commands verify stored originals; the workflow also reconstructs its client and reloads evidence.
3. Yarn PnP works without node_modules or hardcoded package paths.
4. A missing manager or failed stage fails qualification rather than reporting a successful skip.

### User Story 3 - Understand an example failure (Priority: P3)

A developer sees a stable cause and next action when an example fails.
**Why this priority**: One generic permissions/ports message obscures input and integrity failures.
**Independent Test**: Exercise usage, source, storage, port, validation and verification failures and inspect private-value disclosure.
**Acceptance Scenarios**:
1. Failures exit nonzero and distinguish the specified causes.
2. Default errors contain no source filename, customer path, URL, credentials, checksum, manifest or raw exception text.
3. Help exits successfully, documents applicable options and performs no upload.

### Edge Cases
- Duplicate/unknown options and missing values fail with usage guidance; the workflow rejects a file option rather than inventing domain metadata.
- Output never overwrites the source; source bytes remain read-only and targets retain server-controlled paths.
- Known extensions may supply MIME labels, but dimensions and domain metadata are never invented.
- Files changed during transfer/verification cannot be labelled verified.
- Symlinks to regular files are read-only inputs; directories and device/FIFO inputs are rejected before opening.
- Consumer tests use local distributables and loopback HTTP, no cloud credentials; tool setup may download pinned managers.
- PnP loader state remains available to launched Node processes.

## Requirements

### Functional Requirements
- **FR-001**: The minimal example MUST accept an optional local source while preserving the fixture default and artifact-root option.
- **FR-002**: Sources MUST be non-empty regular files, opened read-only with bounded file-backed reads; originals MUST remain unchanged and independently verified.
- **FR-003**: Both examples MUST have executable commands resolving through every manager including Yarn PnP, without adding core SDK exports or runtime dependencies.
- **FR-004**: Isolated consumer tests MUST actually install through npm, pnpm, Yarn PnP and Bun, check ESM/CommonJS, verify absent optional peers and execute both examples.
- **FR-005**: CI MUST run all four pinned manager qualifications; repository tooling stays npm. Missing tools and failed stages MUST fail qualification.
- **FR-006**: Both CLIs MUST validate arguments, support help, reject unsupported options and return nonzero on failure.
- **FR-007**: Errors MUST provide stable codes and fixed actionable guidance for usage, input access/type/empty/change, storage access, port conflict, validation, stored verification and unknown failure.
- **FR-008**: Default failures MUST omit sensitive paths, names, URLs, metadata, manifests, checksums and raw exceptions; consumer tests MUST not expose raw manager output by default.
- **FR-009**: Focused tests MUST cover supplied-file integrity, bounded reads, source mutation, CLI failures/help/privacy and consumer outcomes; required package checks MUST pass.
- **FR-010**: Docs, changelog and release metadata MUST describe 1.8.2, qualified environments, commands and recovery limits. Bun qualification covers installation with Node execution.

### Key Entities
- Example input: fixture or read-only local source with identity and size.
- Example failure: stable code and fixed guidance separate from private cause.
- Consumer qualification: manager/version, import outcomes and verified example outcomes from one packed artifact.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Fixture and supplied-source journeys preserve bytes and complete independent stored verification.
- **SC-002**: Four of four manager installations pass both module formats and both examples without peers or checkout dependencies.
- **SC-003**: Each failure category has automated assertions for correct cause, nonzero exit and private-value omission.
- **SC-004**: Input setup performs no whole-file read; hashing/transfer stay bounded by existing chunk sizes.

## Assumptions
- Node.js 20+ remains the example runtime. Bun is an installer qualification only.
- File input applies to the minimal example; full workflow retains labelled fixture/domain metadata.
- Local examples retain single-process teaching/recovery limits; no new production server or storage adapter is added.
- SDK APIs and schemas remain unchanged; this is example/distribution maintenance in 1.8.2.

## Clarifications

### Session 2026-10-12
- The user authorized all three improvements. Existing constraints resolve preservation, privacy and runtime scope. No critical question remains. Functional scope, data, CLI behavior, quality, integrations, edge cases, constraints, terminology and completion signals are clear.
