# Feature Specification: Comparative Adoption Evidence

**Feature Branch**: `[018-adoption-evidence]`

**Created**: 2026-08-31

**Status**: Implemented

**Input**: User description: "Quantify how much application-owned implementation and fault-handling work the library removes compared with representative generic upload compositions, using fair reproducible scenarios rather than unsupported claims about failure probability."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compare Equivalent Integration Work (Priority: P1)

As a prospective adopter, I can compare this library with representative generic resumable-upload compositions that satisfy the same inspection-ingest requirements and see how much application-owned code, configuration, state coordination, and verification work each approach requires.

**Why this priority**: Adoption claims are credible only when every candidate delivers the same required outcome and the measurement boundary is transparent.

**Independent Test**: Build or validate three reference integrations against one frozen journey, apply the same code-counting and responsibility-classification rules, and confirm that each measured difference traces to reviewable application-owned files and requirements.

**Acceptance Scenarios**:

1. **Given** the comparative evaluation, **When** a candidate is included, **Then** it must complete the same source selection, validation, checksum, manifest, resumable transfer, completion, and stored-original verification journey before its implementation metrics are compared.
2. **Given** application-owned and dependency-owned behavior, **When** implementation size is measured, **Then** generated code, fixtures, vendored packages, comments, formatting, and unrelated UI are classified consistently and do not distort the comparison.
3. **Given** a capability supplied by a dependency in one candidate but by application code in another, **When** responsibilities are reported, **Then** both the application code difference and dependency responsibility remain visible.
4. **Given** a candidate cannot safely satisfy a required journey, **When** comparison runs, **Then** the gap is reported as unsupported or incomplete rather than filled by simulation or silently removed from scope.

---

### User Story 2 - Compare Observed Failure Handling (Priority: P1)

As a reliability reviewer, I can run the same deterministic fault scenarios against every candidate and see which failures are detected, safely recovered, rejected, or incorrectly reported as success.

**Why this priority**: A controlled scenario matrix produces auditable evidence, whereas a general claim that one integration has a lower real-world failure probability would require operational population data that the project does not have.

**Independent Test**: Inject the complete fault catalog at the same lifecycle boundaries for each eligible candidate, repeat all nondeterministic scenarios, and verify that raw outcomes, transmitted-byte counters, terminal states, and stored-file integrity results are retained.

**Acceptance Scenarios**:

1. **Given** a network interruption after acknowledged progress, **When** a candidate resumes, **Then** the evaluation records whether acknowledged bytes are retransmitted and whether the final stored original matches the expected identity.
2. **Given** a metadata-equal but content-different source, **When** recovery is attempted, **Then** the evaluation records whether the mismatch is detected before remote mutation.
3. **Given** a lost completion response, duplicate receipt, stale recovery record, remote-state conflict, or stored-file corruption, **When** the scenario runs, **Then** the evaluation records the candidate's observable outcome without normalizing an unsafe success into a pass.
4. **Given** provider errors containing sensitive values, **When** safe output is captured, **Then** the evaluation records whether each candidate leaks forbidden data under the shared disclosure policy.

---

### User Story 3 - Reproduce And Challenge Product Claims (Priority: P2)

As an independent evaluator or maintainer, I can reproduce the evidence from a clean environment, inspect raw machine-readable results, understand all limitations, and verify that marketing summaries do not exceed the measured evidence.

**Why this priority**: Comparative evidence becomes a durable product advantage only when others can rerun it and challenge its assumptions.

**Independent Test**: Follow the documented evaluation procedure from a clean checkout, regenerate the reference fixtures and reports, compare results with the published artifact, and trace every summary claim to raw measurements and a stated denominator.

**Acceptance Scenarios**:

1. **Given** a published comparative claim, **When** its source is inspected, **Then** the exact candidate versions, scenario catalog, counting rules, environment, date, raw results, exclusions, and limitations are available.
2. **Given** repeated evaluation in the same supported environment, **When** deterministic metrics are compared, **Then** code and responsibility counts remain identical and scenario classifications remain stable.
3. **Given** a new release changes the library or a comparison dependency, **When** the evidence is reused, **Then** the report is marked stale until the affected candidate and scenarios are rerun.
4. **Given** results that show no advantage or a regression, **When** the report is produced, **Then** they remain visible and are not omitted from the aggregate summary.

### Edge Cases

- One candidate satisfies the happy path but cannot implement safe persistent resume without additional application state.
- Candidate APIs divide responsibility differently, making raw line counts misleading without a responsibility matrix.
- One reference implementation uses generated client code or a hosted service that hides server-side behavior.
- A comparison dependency changes behavior or defaults without a major-version change.
- Reformatting, comments, test fixtures, or shared infrastructure change line counts without changing responsibility.
- A fault injection point is not observable or controllable in one candidate.
- A scenario passes because it retries all bytes rather than safely reusing acknowledged evidence.
- A candidate correctly blocks an unsafe operation but cannot provide a user-recoverable outcome.
- A hosted or real-provider result varies because of network, region, load, or service policy.
- A stored file is correct while the candidate reports failure, or corrupted while the candidate reports success.
- A comparison produces credentials, URLs, paths, customer metadata, or provider receipts in captured output.
- Developer elapsed-time data is self-reported, interrupted, or collected by evaluators with unequal experience.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The feature MUST define a versioned comparative evaluation protocol containing the required user journey, candidate eligibility rules, responsibility taxonomy, measurement rules, fault catalog, outcome taxonomy, report schema, and claim policy.
- **FR-002**: The initial evaluation MUST include this library and at least two representative generic compositions: one resumable-protocol composition and one object-storage multipart composition.
- **FR-003**: All eligible candidates MUST implement the same authoritative requirements for original preservation, validation, whole-file identity, manifest generation, interruption, durable resume, progress, completion, and stored-original verification.
- **FR-004**: Candidate-specific UI, styling, unrelated file sources, media transformation, and hosted processing features MUST remain outside the measured journey unless they are required equally for every candidate.
- **FR-005**: A candidate that cannot satisfy a required safety outcome MUST be reported as incomplete or unsupported for that outcome and MUST NOT receive simulated evidence.
- **FR-006**: Measurement MUST distinguish application-owned code, test-owned code, shared evaluation infrastructure, generated code, and dependency-owned behavior.
- **FR-007**: Application-owned implementation metrics MUST include non-generated logical code lines, touched files, separately coordinated lifecycle responsibilities, required configuration decisions, public integration boundaries, and candidate-specific verification cases.
- **FR-008**: Code-counting rules MUST define treatment of blank lines, comments, type declarations, configuration, copied examples, generated artifacts, fixtures, and shared code before candidate implementations are measured.
- **FR-009**: Shared evaluation infrastructure MUST either be excluded consistently from all candidates or attributed explicitly where it fulfills a candidate responsibility.
- **FR-010**: Dependency count and dependency-owned responsibilities MUST be reported separately from application-owned code and MUST NOT be converted into an unqualified implementation-size advantage.
- **FR-011**: Developer elapsed time MAY be reported only as supplemental evidence when evaluator experience, interruptions, start and stop rules, reuse of prior code, and uncertainty are documented; it MUST NOT be the sole basis for a product claim.
- **FR-012**: The common fault catalog MUST include at least: failure before acknowledgement, failure after acknowledgement, lost acknowledgement response, metadata-equal source mismatch, stale recovery state, remote-behind state, remote-ahead state, expired session, missing receipt, duplicate receipt, lost completion response, stored-byte corruption, cleanup failure after completion, and sensitive provider-error output.
- **FR-013**: Each applicable fault scenario MUST use stable typed outcome categories and record detected or undetected status, pre-mutation rejection, recovery action, acknowledged bytes retransmitted, completion-call count, final application status, and stored-original verification result when meaningful.
- **FR-014**: A scenario MUST count as a safe pass only when its predefined invariant is satisfied; extra retransmission, indefinite failure, silent restart, or eventual byte correctness MUST NOT hide a violated recovery or reporting invariant.
- **FR-015**: Nondeterministic or timing-sensitive scenarios MUST run at least ten trials per candidate and report every trial, while deterministic static measurements MUST be calculated from frozen candidate revisions.
- **FR-016**: The evaluation MUST report observed scenario outcomes and MUST NOT describe them as real-world defect probability, incident-rate reduction, availability, or universal provider reliability.
- **FR-017**: Every aggregate percentage MUST state its numerator, denominator, excluded scenarios, weighting method, and whether scenarios were deterministic or repeated.
- **FR-018**: Reports MUST retain raw per-candidate and per-scenario measurements even when they show parity, an advantage for another candidate, or a regression in this library.
- **FR-019**: A published comparison MUST identify exact candidate versions or revisions, scenario-catalog version, environment, configuration, date, commands or procedure, limitations, and known sources of bias.
- **FR-020**: Reproduction MUST be credential-free by default and MUST use isolated representative targets; real-provider comparisons MAY be published only as explicit opt-in supplemental evidence.
- **FR-021**: The comparison MUST verify that all completed reference originals match the same expected byte count and whole-file checksum before performance or implementation metrics are treated as comparable.
- **FR-022**: Routine evaluation output and published raw data MUST NOT contain credentials, secret URLs, object keys, filesystem roots, customer metadata values, full recovery records, full manifests, or raw provider receipts.
- **FR-023**: Published product summaries MUST link each quantitative claim to a report field and MUST include the comparison boundary and principal limitation in adjacent text.
- **FR-024**: Evidence MUST be marked stale when a candidate version, shared requirement, counting rule, fault scenario, or authoritative library behavior changes without a corresponding rerun.
- **FR-025**: Evaluation success MUST mean that the comparison is complete, fair, reproducible, and accurately reported; it MUST NOT require this library to win any metric.
- **FR-026**: The evaluation MUST preserve originals and MUST not decode, resize, recompress, strip metadata, or otherwise alter source artifacts to simplify a candidate.
- **FR-027**: Documentation MUST explain candidate selection, fairness controls, responsibility boundaries, counting rules, scenario definitions, raw-result access, reproducibility, staleness, and prohibited claims.

### Key Entities

- **Evaluation Protocol**: The versioned rules governing candidates, journey, measurements, faults, outcomes, reports, and claims.
- **Candidate Integration**: One frozen reference implementation that attempts the complete common journey.
- **Responsibility Matrix**: A mapping of validation, identity, manifest, chunking, retry, resume, progress, completion, verification, diagnostics, and cleanup to application or dependency ownership.
- **Implementation Measurement**: Reviewable counts of application-owned code and integration surface under the frozen counting policy.
- **Fault Scenario**: One controlled failure or inconsistency with a predefined invariant and lifecycle injection point.
- **Scenario Trial**: One candidate execution of one fault scenario with raw observations and terminal evidence.
- **Comparative Report**: A versioned machine-readable and human-readable collection of candidates, methods, raw results, summaries, limitations, and staleness.
- **Evidence Claim**: A bounded statement derived from named report fields with an explicit comparison scope.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every eligible candidate completes the same happy-path journey and produces a stored original matching the common expected byte count and whole-file checksum before comparative metrics are published; incomplete candidates are labeled and excluded only with an explicit reason.
- **SC-002**: 100% of reported application-owned lines, files, configuration decisions, responsibilities, and candidate-specific tests trace to reviewable frozen candidate artifacts under the published counting policy.
- **SC-003**: Every applicable candidate-scenario pair reports all required raw outcome fields, with zero missing outcomes silently treated as passes.
- **SC-004**: All timing-sensitive fault scenarios contain at least ten recorded trials per eligible candidate, and 100% of trial results remain present in the published raw report.
- **SC-005**: Repeating the evaluation at the same frozen revisions produces identical code counts, responsibility counts, and deterministic scenario classifications in 100% of reruns.
- **SC-006**: Every aggregate percentage in the human-readable report can be independently recomputed from published raw numerators, denominators, exclusions, and weighting rules.
- **SC-007**: 100% of quantitative product claims link to a versioned report and state the evaluated candidates, journey boundary, and principal limitation.
- **SC-008**: The report includes all parity, adverse, unsupported, and regressed results, with zero manual result exclusions lacking a published protocol reason.
- **SC-009**: Safe-output inspection finds zero credentials, secret URLs, object keys, filesystem roots, customer metadata values, full recovery records, full manifests, or raw provider receipts.
- **SC-010**: Changing any candidate revision, journey requirement, counting rule, or fault invariant causes the previous comparison to be marked stale until rerun.

## Assumptions

- The first generic reference compositions use a selection UI held outside the measurement boundary, with one tus-style resumable transfer and one S3-style multipart transfer.
- Comparison candidates are selected because they represent plausible integration choices, not because they are intended to represent every uploader, provider, or architecture.
- Application-owned lines and responsibilities are useful maintenance-surface indicators but are not direct measurements of defect probability or engineering quality.
- Controlled fault outcomes measure coverage of the stated scenarios only; production incident rates require separately collected operational data.
- Candidate implementations may use their documented public capabilities, but hidden hosted-service behavior is recorded as dependency-owned and not credited as application code.
- Feature 014 provides the common safety invariants and transport outcomes reused by this evaluation where applicable.
- Feature 015 may provide provenance evidence for the reference journey, but preservation export and domain profiles are not required for the initial comparison unless applied equally to all candidates.
- The evaluation is allowed to conclude that the library has no advantage or requires improvement; methodological integrity takes precedence over marketing value.
