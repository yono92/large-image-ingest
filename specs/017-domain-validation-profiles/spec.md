# Feature Specification: Domain Validation Profiles

**Feature Branch**: `[017-domain-validation-profiles]`

**Created**: 2026-08-31

**Status**: Implemented

**Input**: User description: "Provide explicit, versioned validation profiles for semiconductor inspection, microscopy, and satellite imagery so domain teams can start with defensible rules while preserving application control and original-file integrity."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Apply A Versioned Domain Policy Explicitly (Priority: P1)

As an ingestion integrator, I can explicitly select a versioned domain validation profile and receive a deterministic validation result that explains which effective rules passed, warned, failed, or could not be evaluated.

**Why this priority**: Domain defaults add value only when they are observable, reproducible, and never silently inferred or changed underneath an ingest.

**Independent Test**: Evaluate the same source and metadata under each supported profile version, verify deterministic rule outcomes, and confirm that the effective profile identity and result can be referenced by the manifest and provenance record.

**Acceptance Scenarios**:

1. **Given** no explicitly selected domain profile, **When** ingest begins, **Then** existing caller-provided validation behavior remains authoritative and no domain is inferred from filename, MIME type, metadata, or image contents.
2. **Given** one selected profile, **When** validation runs, **Then** every applicable rule has a stable identity, severity, outcome, and safe explanation.
3. **Given** a profile rule requires information that is unavailable, **When** validation runs, **Then** the outcome follows that rule's documented unavailable-data policy rather than assuming a pass.
4. **Given** a profile definition changes, **When** it is published, **Then** its version changes and previously recorded profile identities continue to describe the rules originally applied.

---

### User Story 2 - Validate Semiconductor Inspection Sources (Priority: P1)

As a semiconductor inspection team, I can use a baseline profile that requires strong source identity and production-context metadata while accepting common lossless or inspection-image formats and allowing an organization to derive a stricter documented policy.

**Why this priority**: Semiconductor inspection is the library's primary product domain and requires traceability from a source image to its lot and wafer context.

**Independent Test**: Run valid and invalid semiconductor fixtures covering file type, extension, size, dimensions, bit depth when available, checksum, lot identity, wafer identity, inspection time, and untrusted metadata; confirm the baseline outcomes and derived-policy behavior.

**Acceptance Scenarios**:

1. **Given** a supported inspection image with valid strong checksum evidence, positive dimensions, `lotId`, `waferId`, and `inspectionTimestamp`, **When** the semiconductor baseline profile runs, **Then** the required baseline rules pass.
2. **Given** missing or malformed lot, wafer, or inspection-time metadata, **When** validation runs, **Then** ingest is blocked with typed rule failures before an upload session is created.
3. **Given** a proprietary inspection format not included in the baseline, **When** an organization derives and explicitly identifies a compatible profile that allows it, **Then** the effective derived profile and additional validation obligations are recorded.
4. **Given** metadata containing path syntax, control characters, oversized values, or secret-looking fields, **When** validation runs, **Then** it is treated as untrusted and is not emitted in routine errors or logs.

---

### User Story 3 - Validate Microscopy And Satellite Sources (Priority: P2)

As a microscopy or satellite-imagery team, I can select a reference profile that captures the minimum acquisition context and strong identity requirements for my domain without claiming format interpretation that the SDK did not perform.

**Why this priority**: These adjacent domains share large-image integrity needs but have different acquisition metadata and format expectations.

**Independent Test**: Evaluate microscopy fixtures with specimen and acquisition metadata and satellite fixtures with scene and sensor metadata, including unavailable structural fields, derived organizational profiles, and unsupported formats.

**Acceptance Scenarios**:

1. **Given** a microscopy source with supported image format, strong checksum evidence, `specimenId`, `acquisitionId`, `instrumentId`, and `acquisitionTimestamp`, **When** the microscopy baseline profile runs, **Then** all minimum traceability rules pass.
2. **Given** a satellite source with supported geospatial-image format, strong checksum evidence, `sceneId`, `sensorId`, and `acquisitionTimestamp`, **When** the satellite baseline profile runs, **Then** all minimum traceability rules pass and coordinate-system metadata is reported as required only when the selected profile declares it so.
3. **Given** metadata claims that cannot be established from bounded structural inspection, **When** validation runs, **Then** they remain caller-supplied assertions and are not reported as independently observed image facts.
4. **Given** a domain-specific container or proprietary source the SDK cannot inspect, **When** an explicit derived profile supplies external evidence requirements, **Then** validation distinguishes supplied evidence from SDK-observed evidence.

---

### User Story 4 - Derive An Organization Policy Safely (Priority: P2)

As a quality or platform owner, I can derive an organization-specific profile from a published baseline, add stricter requirements or explicit exceptions, and retain a complete effective-policy identity for reproducibility.

**Why this priority**: Real inspection programs differ in formats, metadata vocabularies, size limits, and quality rules; customization must remain possible without making the applied policy ambiguous.

**Independent Test**: Derive profiles that add rules, tighten limits, rename external metadata through an explicit mapping, and relax baseline constraints through documented exceptions; verify conflict detection and effective-policy recording.

**Acceptance Scenarios**:

1. **Given** a derived policy that tightens a limit or adds required metadata, **When** it is evaluated, **Then** the effective result includes both inherited and added rules under a new profile identity.
2. **Given** a derived policy that relaxes a baseline blocking rule, **When** it is defined, **Then** the exception must be explicit, versioned, and accompanied by a safe rationale category; silent weakening is rejected.
3. **Given** conflicting inherited and local rules, **When** the profile is validated, **Then** the profile is rejected before it can validate an ingest.
4. **Given** a valid organizational profile, **When** its results are summarized, **Then** customer metadata values and private rationale text remain excluded from default diagnostics.

### Edge Cases

- A file whose extension, declared MIME type, and detected structural format disagree.
- A TIFF or BigTIFF whose dimensions or bit depth cannot be read within configured structural bounds.
- A proprietary format allowed by policy but opaque to SDK structural inspection.
- A required timestamp without timezone, outside an allowed range, or in the future because of clock skew.
- Metadata identifiers that are empty, repeated, excessively long, differently normalized, or contain path traversal syntax.
- A profile upgrade while an upload is paused and later resumed.
- A saved manifest or provenance record referencing a profile version no longer bundled by the application.
- Two profiles with the same name and version but different rule content.
- A derived profile that changes a warning into a pass or a blocking failure into a warning.
- A source satisfying metadata rules but failing checksum, size, dimension, or preservation requirements.
- Required information supplied by the caller that conflicts with bounded structural observations.
- Multiple domain profiles selected for one ingest.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A domain validation profile MUST have a stable name, semantic version, domain category, description, rule inventory, effective-policy digest, and compatibility declaration.
- **FR-002**: Domain profile selection MUST be explicit; the SDK MUST NOT infer or automatically activate a domain profile from filenames, extensions, MIME types, metadata, paths, or image content.
- **FR-003**: Exactly one effective domain profile MAY be authoritative for one ingest, although that profile may derive from one documented baseline.
- **FR-004**: Every rule MUST have a stable rule identity, category, severity, evidence requirement, unavailable-data behavior, and safe outcome description.
- **FR-005**: Rule outcomes MUST distinguish pass, warning, blocking failure, not applicable, unavailable evidence, and invalid rule configuration.
- **FR-006**: The effective profile identity, version, digest, evaluation time, result category, and safe rule outcomes MUST be available for manifest and provenance references.
- **FR-007**: Profile rules MAY cover file size, declared media type, extension, bounded structural format, dimensions, bit depth, whole-file checksum, required metadata, allowed metadata shapes, and caller-supplied evidence.
- **FR-008**: Whole-file cryptographic evidence MUST be required by all three initial baseline profiles before an ingest can be treated as a verified source-of-truth artifact.
- **FR-009**: Profile evaluation MUST reuse trusted source checksum and bounded structural evidence already established during ingest and MUST NOT require duplicate equivalent full-file reads.
- **FR-010**: Structural validation MUST remain bounded and MUST NOT require decoding all pixels, rewriting metadata, recompressing, or otherwise mutating the original.
- **FR-011**: The semiconductor baseline profile MUST require `lotId`, `waferId`, and `inspectionTimestamp`; identifiers MUST contain 1 to 256 non-control characters after normalization and the timestamp MUST include an explicit timezone.
- **FR-012**: The semiconductor baseline MUST accept TIFF, BigTIFF, PNG, and JPEG family originals whose declared type, extension, and bounded structural evidence do not conflict, and MUST require an explicitly versioned derived profile for additional proprietary formats.
- **FR-013**: The microscopy baseline profile MUST require `specimenId`, `acquisitionId`, `instrumentId`, and `acquisitionTimestamp`; identifiers MUST contain 1 to 256 non-control characters after normalization and the timestamp MUST include an explicit timezone.
- **FR-014**: The microscopy baseline MUST distinguish caller-supplied specimen and instrument assertions from structurally observed image metadata.
- **FR-015**: The satellite baseline profile MUST require `sceneId`, `sensorId`, and `acquisitionTimestamp`; identifiers MUST contain 1 to 256 non-control characters after normalization and the timestamp MUST include an explicit timezone.
- **FR-016**: The satellite baseline MUST support an explicit rule for coordinate-system or georeferencing evidence and MUST distinguish unavailable evidence from a valid non-georeferenced profile.
- **FR-017**: The microscopy baseline MUST accept TIFF, BigTIFF, and OME-TIFF family originals, while the satellite baseline MUST accept TIFF, BigTIFF, and GeoTIFF family originals; additional containers and proprietary formats require explicitly versioned derived profiles.
- **FR-018**: Initial baseline format lists, positive-dimension and bit-depth rules, timestamp rules, identifier limits, and warning thresholds MUST be documented as versioned policy data rather than hidden behavior; deployment-specific maximum file sizes MUST remain explicit effective-profile settings rather than universal domain claims.
- **FR-019**: Applications MUST be able to derive a new profile that adds rules, tightens rules, maps organization metadata fields, or declares explicit exceptions without mutating the published baseline.
- **FR-020**: Any relaxation of a blocking baseline rule MUST require a new profile identity, explicit exception, safe rationale category, and effective-policy digest; silent relaxation MUST be rejected.
- **FR-021**: Conflicting, duplicate, cyclic, malformed, or digest-inconsistent profile definitions MUST be rejected before source validation or remote upload mutation.
- **FR-022**: Profile version or effective-policy mismatch during persistent resume MUST produce a typed actionable outcome and MUST NOT silently apply new rules to already acknowledged bytes.
- **FR-023**: Unknown or unavailable historical profile versions MUST remain identifiable from recorded manifest or provenance references even when they can no longer be re-evaluated locally.
- **FR-024**: Filenames, metadata, rule labels, external evidence, exception rationales, and organization mappings MUST be treated as untrusted input and bounded before use.
- **FR-025**: Default errors, events, UI summaries, and diagnostics MUST NOT expose customer metadata values, source checksums, full profile definitions, private exception text, storage locations, credentials, or provider receipts.
- **FR-026**: Existing callers that use only caller-defined validation rules MUST remain compatible and MUST not receive new domain failures unless they explicitly select a profile.
- **FR-027**: Baseline profiles MUST be described as reference starting points and MUST NOT claim regulatory compliance, scientific validity, calibration validity, diagnosis suitability, or fitness for a particular production process.
- **FR-028**: Documentation MUST explain profile selection, baseline rules, evidence sources, derived profiles, exception handling, versioning, resume mismatch behavior, safe diagnostics, and domain limitations.

### Key Entities

- **Domain Validation Profile**: A versioned collection of rules for one inspection-imagery domain.
- **Validation Rule**: A stable requirement with severity, evidence needs, unavailable-data behavior, and a typed outcome.
- **Effective Profile**: The fully resolved baseline plus organization additions, tightened limits, mappings, and explicit exceptions for one ingest.
- **Profile Digest**: Content identity for the complete effective rule set, independent of its human-readable name.
- **Evidence Item**: An SDK-observed, caller-supplied, or externally attested fact evaluated by a rule.
- **Profile Evaluation**: A versioned result containing profile identity, rule outcomes, warnings, failures, and evidence categories.
- **Profile Exception**: An explicit versioned relaxation of a baseline rule with a safe rationale category.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Identical source, metadata, evidence, and effective-profile fixtures produce identical rule outcomes and effective-policy digests in 100% of repeated evaluations.
- **SC-002**: Without explicit profile selection, 100% of existing caller-defined validation fixtures preserve their prior outcomes and receive zero inferred domain rules.
- **SC-003**: For each of the three initial baseline profiles, 100% of documented required-metadata, format, size, dimension, checksum, and unavailable-evidence boundary fixtures produce their specified outcomes.
- **SC-004**: All fixtures missing required strong source evidence are blocked from verified source-of-truth status, with zero fabricated or metadata-only checksum passes.
- **SC-005**: Derived-profile fixtures detect 100% of covered conflicts, cycles, duplicate rule identities, digest mismatches, and silent baseline relaxations before ingest mutation.
- **SC-006**: Profile mismatch during resume produces a typed non-resuming outcome before remote mutation in 100% of mismatch fixtures.
- **SC-007**: When checksum and structural evidence already exist, profile evaluation performs zero duplicate equivalent whole-file traversals in all instrumented fixtures.
- **SC-008**: Safe-output fixtures expose zero customer metadata values, source checksums, full private profiles, private exception text, credentials, storage locations, or raw provider evidence.
- **SC-009**: Every evaluated rule has exactly one stable identity, evidence-source category, severity, and outcome in 100% of generated evaluation records.
- **SC-010**: Every bundled baseline profile publishes complete versioned documentation for all rules, bounds, supported formats, unavailable-data behavior, and limitations before release.

## Assumptions

- The first release includes three conservative reference baselines: semiconductor inspection, microscopy acquisition, and satellite imagery.
- Baseline metadata names provide a common starting vocabulary; organizations may map their own field names through a versioned derived profile.
- Accepted baseline format families and identifier constraints are defined here; detailed media-type aliases, structural signatures, warning thresholds, and deployment size limits are versioned policy data refined during clarification and planning rather than treated as permanent universal truths.
- Proprietary formats can be allowed only through explicit derived profiles and may require caller-supplied or external evidence when structural inspection is unavailable.
- Domain profiles validate ingest evidence and metadata; they do not interpret scientific meaning, calibrate instruments, diagnose defects, or judge image quality from pixels.
- Applications remain responsible for determining whether a baseline or derived profile meets organizational, contractual, regulatory, and scientific requirements.
- Profile evaluation applies to originals; derivative-specific quality profiles require a separate feature or explicit future extension.
