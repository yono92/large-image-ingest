# Feature Specification: Reference Integration And Benchmarks

**Feature Branch**: `agent/sdk-1-3-0`

**Created**: 2026-07-13

**Status**: Implemented

**Input**: User description: "Include README corrections, a real large-file reference integration, and reproducible benchmarks in the current 1.3.0 PR."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Verify A Recoverable End-To-End Ingest (Priority: P1)

As an SDK evaluator, I can run a local reference workflow that uploads a file through real HTTP requests, interrupts the upload, resumes it from durable state with a new session, and verifies the stored original against its manifest.

**Why this priority**: The core product claim is safe recoverable ingestion, not isolated helper behavior.

**Independent Test**: Run the reference verification command with a generated fixture and confirm interruption, durable resume, zero acknowledged-byte retransmission, completion, and stored-file checksum verification.

**Acceptance Scenarios**:

1. **Given** a generated source artifact, **When** the reference workflow runs, **Then** chunks cross an HTTP boundary and the stored artifact matches the manifest checksum.
2. **Given** a forced client failure after acknowledged chunks, **When** a new session resumes from the durable record, **Then** acknowledged chunks are not uploaded again.
3. **Given** no external credentials or services, **When** default verification runs, **Then** it remains local, deterministic, and self-cleaning.

---

### User Story 2 - Measure Large-File Behavior Reproducibly (Priority: P1)

As an SDK evaluator, I can choose a fixture size and receive a machine-readable report covering checksum time, upload and resume time, throughput, memory, retransmission, and final integrity.

**Why this priority**: A library named for large-image ingest needs public evidence that its memory use is bounded and recovery works at meaningful sizes.

**Independent Test**: Execute the benchmark at two supported sizes and verify the report contains environment, configuration, timing, memory, recovery, and integrity fields without sensitive values.

**Acceptance Scenarios**:

1. **Given** a selected fixture size, **When** the benchmark completes, **Then** it writes valid JSON and prints a concise summary.
2. **Given** a fixture larger than the configured chunk, **When** it is processed, **Then** no application-owned whole-file buffer is required.
3. **Given** benchmark results, **When** they are published, **Then** the exact command, environment, limitations, and date are recorded.

---

### User Story 3 - Evaluate Scope From npm Documentation (Priority: P2)

As a prospective adopter, I can understand the package boundary, see verified results, and reproduce them without mistaking headless React bindings for a styled UI or TIFF probing for image rendering.

**Why this priority**: Clear positioning and credible evidence are required for adoption and prevent scope confusion.

**Independent Test**: Review the packaged README and benchmark guide and confirm they describe current exports, exclusions, measured results, and reproduction commands consistently.

**Acceptance Scenarios**:

1. **Given** the 1.3.0 README, **When** a reader reviews package scope, **Then** optional React and TIFF subpaths are described without contradictory exclusions.
2. **Given** published measurements, **When** a reader inspects them, **Then** results are clearly identified as measurements from a stated environment rather than universal performance guarantees.

### Edge Cases

- Empty and sub-chunk fixtures.
- A fixture whose size is not a multiple of the chunk size.
- Failure before any chunk and after one or more acknowledged chunks.
- A stale or malformed durable resume file.
- A target file that is truncated or changed before verification.
- Benchmark interruption leaving temporary files.
- Systems with insufficient free disk space.
- Benchmark output paths outside the repository-owned results directory.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The reference workflow MUST exercise the published package entrypoints after a successful build.
- **FR-002**: Chunk transfer MUST cross a local HTTP boundary and write to a temporary staging target without loading the source artifact as one application-owned buffer.
- **FR-003**: The workflow MUST force at least one failure after acknowledged progress and resume using a new ingest session and a durable resume store.
- **FR-004**: The workflow MUST prove that acknowledged chunks are not retransmitted during resume.
- **FR-005**: Completion MUST verify stored size and whole-file SHA-256 against the generated manifest.
- **FR-006**: Benchmark configuration MUST support a small CI size and caller-selected larger sizes without changing source code.
- **FR-007**: Reports MUST include fixture size, chunk size, timing, throughput, process memory peaks, recovery counters, final integrity, runtime environment, and the exact safe command shape.
- **FR-008**: Reports and console output MUST NOT include credentials, endpoint secrets, full manifests, resume tokens, or source file contents.
- **FR-009**: Temporary source, staging, resume, and target data MUST be isolated under a generated temporary directory and removed after successful or failed runs unless explicitly retained for diagnosis.
- **FR-010**: Default CI and publish verification MUST remain credential-free and execute a bounded reference scenario.
- **FR-011**: Large benchmark fixtures and runtime data MUST NOT be included in the npm tarball.
- **FR-012**: The packaged README and benchmark guide MUST include measured results, methodology, limitations, and reproducible commands.
- **FR-013**: The README MUST distinguish optional headless React bindings from styled UI and TIFF metadata probing from decoding or rendering.
- **FR-014**: This feature MUST NOT add runtime APIs, image transformation behavior, cloud credentials, or production server claims.
- **FR-015**: The local harness MUST reject sizes that the active runtime cannot represent accurately and MUST document how larger browser or provider runs differ.

### Key Entities

- **Reference Run**: One isolated source generation, upload, interruption, resume, completion, and verification lifecycle.
- **Benchmark Configuration**: Fixture size, chunk size, failure point, output location, and retention policy.
- **Benchmark Result**: Versioned machine-readable environment, timing, memory, recovery, and integrity evidence.
- **Durable Resume Store**: File-backed test-owned state that survives creation of a replacement ingest session.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The default verification completes an HTTP upload, forced interruption, new-session resume, and stored-file verification with zero acknowledged bytes retransmitted.
- **SC-002**: Every completed report contains all required configuration, timing, memory, recovery, integrity, and environment fields and can be parsed without project-specific tooling.
- **SC-003**: The reference run succeeds for at least a 1 GiB fixture on the recorded development environment without source-size-linear JavaScript heap growth.
- **SC-004**: Default CI uses no external credentials and leaves no generated fixture or storage data in the repository.
- **SC-005**: The npm dry-run package contains benchmark documentation but no benchmark fixtures, temporary storage, or local server implementation.
- **SC-006**: README scope statements contain no contradiction about React, TIFF decoding, rendering, transformations, or styled UI.

## Assumptions

- The first reference stack uses a local HTTP storage service built from native runtime APIs so it is deterministic and credential-free.
- Real provider tests remain opt-in because default verification cannot require external tus, S3, or NAS infrastructure.
- Memory evidence covers the benchmark process and demonstrates bounded application behavior; it is not a guarantee for every browser, operating system, or storage provider.
- Measured results are published only after actual execution on a named environment.
