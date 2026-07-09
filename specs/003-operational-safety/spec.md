# Feature Specification: 1.1.0 Operational Safety

**Feature Branch**: `003-operational-safety`

**Created**: 2026-07-09

**Status**: Draft

**Input**: User description: "1.2 1.3 은 TODO로 정리해 놓고 1.1.0 기획하자"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Log Safe Operational Summaries (Priority: P1)

As an application developer, I can turn ingest events, session snapshots, resume records, and verification reports into safe summaries for logs, progress UI, and support diagnostics without exposing customer metadata, credentials, upload URLs, full manifests, or sensitive resume handles.

**Why this priority**: Safe observability directly supports the constitution's sensitive-data handling principle and reduces the chance that consumers copy unsafe event or snapshot objects into logs.

**Independent Test**: Can be tested by passing representative events, full snapshots, resume records, and verification reports through the summary/redaction behavior and verifying that sensitive fields are removed while status, progress, IDs, and typed codes remain available.

**Acceptance Scenarios**:

1. **Given** an ingest event containing a full manifest, **When** a safe summary is produced, **Then** the summary includes the event type, manifest ID, status or progress where available, and no raw manifest metadata.
2. **Given** a snapshot or resume record containing transport resume handles, remote upload IDs, presigned URLs, or opaque transport data, **When** a redacted form is produced, **Then** sensitive values are omitted and the redaction list names the removed field categories.
3. **Given** a verification report with typed issue codes, **When** a safe summary is produced, **Then** the issue codes and paths remain visible and raw customer metadata or full manifests remain absent.

---

### User Story 2 - Configure Retry Behavior Predictably (Priority: P2)

As an application developer, I can configure retry behavior for transient upload failures so long uploads behave predictably under unstable networks while pause, cancel, permanent conflicts, and resume mismatches still stop promptly.

**Why this priority**: Large inspection uploads are expensive to restart. Retry behavior must be observable and configurable without turning permanent data-integrity conflicts into repeated attempts.

**Independent Test**: Can be tested with fake transports that emit transient, permanent, pause, cancel, and resume-conflict failures and verifying retry counts, delays, events, and terminal states.

**Acceptance Scenarios**:

1. **Given** a retryable chunk failure, **When** a retry policy allows another attempt, **Then** the session emits retry state and retries without advancing durable progress until the chunk succeeds.
2. **Given** a non-retryable transport conflict, resume mismatch, pause, or cancel request, **When** upload is in progress, **Then** the session does not apply retry backoff and transitions to the appropriate terminal or recoverable state.
3. **Given** retry policy limits are exhausted, **When** the final retry fails, **Then** the failure summary includes a typed code and retryability value suitable for recovery UI.

---

### User Story 3 - Validate Real-World Integration Paths Opt-In (Priority: P3)

As a maintainer, I can run explicitly opt-in integration checks for real TUS, S3-compatible, and NAS-backed environments without requiring credentials or external services in the default test suite.

**Why this priority**: Local fakes prove core behavior, but provider-specific offset behavior, presigned URL headers, mounted filesystem semantics, and cleanup guarantees need optional infrastructure validation before broader production adoption.

**Independent Test**: Can be tested by running the default test suite without credentials, then enabling one integration target with explicit environment variables and verifying only that target runs.

**Acceptance Scenarios**:

1. **Given** no integration environment variables, **When** default verification runs, **Then** no real network, cloud, or mounted NAS dependency is required.
2. **Given** a configured integration target, **When** the opt-in integration command runs, **Then** only that target's checks execute and cleanup runs after success or failure.
3. **Given** an integration check fails, **When** diagnostic output is produced, **Then** credentials, presigned URLs, customer metadata, full manifests, and sensitive resume records are not printed.

---

### User Story 4 - Use A Minimal Server Example (Priority: P4)

As an adopter, I can reference a minimal server-side example for a real upload path so I can connect the SDK to a TUS-compatible endpoint or broker-backed storage path without guessing the application-owned server responsibilities.

**Why this priority**: The SDK already exposes adapter boundaries, but examples should make the boundary between SDK code and application-owned server code concrete.

**Independent Test**: Can be tested by typechecking examples and verifying that the server-side guidance keeps credentials, path generation, and cleanup on the application side.

**Acceptance Scenarios**:

1. **Given** a developer reading examples, **When** they inspect the server-side flow, **Then** they can identify which code creates upload sessions, owns credentials, generates storage keys or paths, completes uploads, and performs cleanup.
2. **Given** a sample flow, **When** it handles filenames or metadata, **Then** untrusted values are treated as labels and never used directly as filesystem paths or object keys.

### Edge Cases

- Safe summaries must preserve enough IDs and typed codes for support diagnostics while removing values that could expose customer data or credentials.
- Retry policies must not retry validation failures, checksum mismatches, remote offset conflicts, unsupported resume, expired resume records, pause, or cancel.
- Integration commands must remain opt-in even when environment variables are partially configured.
- Cleanup for integration checks must run after failed uploads, failed multipart completion, failed NAS finalize, or interrupted TUS sessions.
- Server examples must not imply that browsers can write directly to SMB, NFS, NAS, WebDAV, SFTP, or local filesystems.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The SDK MUST provide a documented way to produce safe operational summaries from ingest events without exposing full manifests, customer metadata, credentials, upload URLs, or sensitive resume handles.
- **FR-002**: The SDK MUST provide a documented way to redact session snapshots and resume records for logging or support diagnostics while retaining status, progress, manifest ID, record ID, typed error code, and redaction metadata.
- **FR-003**: Safe summaries and redacted views MUST preserve typed error codes, retryability, lifecycle status, chunk progress, and public IDs needed for recovery UI.
- **FR-004**: Safe summary behavior MUST be covered by tests for manifest-bearing events, snapshot transport sessions, resume records, receipt transport details, and verification reports.
- **FR-005**: The SDK MUST support configurable retry policy behavior for transient chunk failures without changing the default retry behavior for existing consumers.
- **FR-006**: Retry policy behavior MUST distinguish retryable transient failures from permanent validation, verification, remote resume, offset conflict, pause, cancel, and cleanup failures.
- **FR-007**: Retry attempts MUST remain observable through typed events or safe summaries that include attempt count and retryability without sensitive transport details.
- **FR-008**: The SDK MUST keep default tests credential-free and service-free while adding opt-in integration test entry points for real TUS, S3-compatible, and NAS-backed paths.
- **FR-009**: Integration checks MUST require explicit environment configuration and MUST skip with a clear message when required configuration is absent.
- **FR-010**: Integration checks MUST avoid logging credentials, presigned URLs, raw customer metadata, full manifests, and sensitive resume records.
- **FR-011**: Integration checks MUST include cleanup guidance or cleanup behavior for abandoned remote uploads, incomplete multipart uploads, and staged NAS sessions.
- **FR-012**: The documentation MUST include at least one minimal server-side example or guide that clarifies application-owned responsibilities for credentials, storage keys or paths, cleanup, and final verification.
- **FR-013**: Public API additions MUST be TypeScript-first, exported through the appropriate package subpaths, and documented with examples.
- **FR-014**: The feature MUST preserve original files by default and MUST NOT add any behavior that resizes, recompresses, decodes and rewrites, strips EXIF, or mutates original bytes.
- **FR-015**: The feature MUST keep core provider-neutral and framework-agnostic; TUS, S3, NAS, server examples, and integration targets must remain adapter- or example-owned.

### Key Entities *(include if feature involves data)*

- **Safe Event Summary**: A redacted operational representation of an ingest event containing event type, public IDs, status, progress, retryability, and typed codes.
- **Redacted Snapshot**: A snapshot representation suitable for logs or support diagnostics, with transport secrets and opaque remote data removed.
- **Redacted Resume Record**: A resume record representation suitable for recovery lists or diagnostics, with sensitive transport state and manifest metadata removed.
- **Retry Policy**: Application-selected behavior defining retry attempts, delay, backoff, and non-retryable conditions for transient upload failures.
- **Integration Target**: An opt-in external environment configuration for real TUS, S3-compatible, or NAS-backed validation.
- **Server Example Flow**: Documentation or example code that shows application-owned upload session, credential, storage key/path, cleanup, and verification responsibilities.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Safe summary tests cover 100% of event families that can carry manifests, snapshots, resume records, receipts, verification issues, or transport errors.
- **SC-002**: No safe summary or redacted diagnostic fixture contains customer metadata, presigned URLs, credentials, full manifests, resume tokens, opaque transport payloads, or raw storage paths in covered tests.
- **SC-003**: Retry policy tests prove retry, no-retry, pause, cancel, and resume-conflict behavior with deterministic fake transports in 100% of covered cases.
- **SC-004**: Default verification commands continue to pass without real network services, cloud credentials, object storage buckets, mounted NAS paths, or TUS servers.
- **SC-005**: Each opt-in integration target documents required environment variables, skip behavior, cleanup expectations, and sensitive-output safeguards.
- **SC-006**: At least one server-side example or guide is validated before release and clearly separates SDK responsibilities from application-owned credentials and storage policy.

## Assumptions

- Version 1.1.0 is an additive minor release; existing public event, snapshot, resume, transport, and manifest shapes should remain source-compatible.
- Safe summaries are additive helpers or documented redaction paths, not a breaking replacement for existing full caller-controlled objects.
- Retry policy improves transient failure behavior but does not introduce parallel upload.
- Integration tests are opt-in and may be documented or scripted, but they must stay outside default CI unless explicitly configured.
- Preview, thumbnail, tile, React, and parallel-upload features are deferred to later minor releases.
