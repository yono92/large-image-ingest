# Feature Specification: Preservation Standard Interoperability

**Feature Branch**: `[016-preservation-interoperability]`

**Created**: 2026-08-31

**Status**: Implemented

**Input**: User description: "Connect the ingest manifest and provenance model to BagIt and OCFL so verified originals and derivatives can be exported and validated as preservation-friendly artifacts without losing identity or source relationships."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Export A Verified Ingest As A BagIt Package (Priority: P1)

As a preservation or transfer operator, I can export one verified ingest as a BagIt 1.0 package whose payload manifests protect the original and included derivatives and whose tag material retains the ingest identity and provenance relationships.

**Why this priority**: BagIt provides a widely understood checksum-manifest package for transferring digital content between systems without requiring the receiving system to understand the SDK.

**Independent Test**: Export a fixture containing one verified original, two derivatives, and provenance, validate the resulting bag independently, and confirm that every payload file matches its declared digest and that the original remains distinguishable from its derivatives.

**Acceptance Scenarios**:

1. **Given** a verified original with a whole-file SHA-256 and valid manifest, **When** it is exported as BagIt, **Then** the original appears as an unchanged payload file with a matching payload-manifest entry.
2. **Given** included derivatives, **When** the bag is exported, **Then** each derivative has its own payload entry and its relationship to the original is retained in versioned tag metadata.
3. **Given** an original or derivative whose observed bytes do not match its expected digest, **When** export validation runs, **Then** the package is rejected and no successful preservation result is reported.
4. **Given** a receiving party that knows BagIt but not this SDK, **When** it validates the bag, **Then** standard payload and tag integrity can be checked without proprietary runtime dependencies.

---

### User Story 2 - Export A Verified Ingest As An OCFL Object (Priority: P1)

As a repository integrator, I can export one verified ingest as an OCFL 1.1 object version whose inventory, logical state, content digests, and fixity evidence consistently represent the original, selected derivatives, and provenance records.

**Why this priority**: OCFL provides storage-independent inventory, version, and fixity semantics suitable for long-term digital repository workflows.

**Independent Test**: Export the same ingest fixture as one OCFL object version, validate it independently, and confirm that inventory digests, logical paths, content paths, original designation, derivatives, and provenance references remain consistent.

**Acceptance Scenarios**:

1. **Given** a verified ingest selected for OCFL export, **When** the object version is produced, **Then** every included content file is represented by its digest in the inventory manifest and current logical state.
2. **Given** identical bytes referenced by more than one logical role, **When** the export is produced, **Then** content identity remains digest-based and logical relationships are not confused with physical duplication.
3. **Given** an existing OCFL storage root or object that is outside the supported first-export boundary, **When** export is requested, **Then** the operation is rejected or returned as an explicit unsupported case rather than mutating repository history unsafely.
4. **Given** an exported object with changed content, inventory, or inventory digest, **When** validation runs, **Then** the affected integrity or relationship issue is reported.

---

### User Story 3 - Assess Mapping Completeness Before Export (Priority: P2)

As an SDK integrator, I can preview and validate how an ingest manifest maps to BagIt or OCFL before any output is materialized, including warnings for unavailable content, unsupported algorithms, unsafe paths, or metadata that requires a documented extension.

**Why this priority**: Preservation export must not silently drop provenance, mislabel derivatives, invent checksums, or begin large writes when the source evidence is insufficient.

**Independent Test**: Evaluate mapping fixtures with missing checksums, unavailable derivatives, unsafe filenames, path collisions, unsupported provenance fields, and partial verification; confirm that each receives a deterministic exportable, exportable-with-warnings, or blocked classification before output mutation.

**Acceptance Scenarios**:

1. **Given** an ingest whose required content and evidence are available, **When** mapping is evaluated, **Then** the result lists all planned content roles, logical paths, digests, metadata sidecars, and standard-specific validation obligations.
2. **Given** required strong source evidence is missing, **When** mapping is evaluated, **Then** preservation export is blocked unless the selected standard profile explicitly allows evidence to be calculated and verified before materialization.
3. **Given** source names or derivative paths that are unsafe or collide after normalization, **When** mapping is evaluated, **Then** safe deterministic logical paths are proposed without treating untrusted names as filesystem paths.
4. **Given** provenance fields with no native standard representation, **When** mapping is evaluated, **Then** they are retained in a documented versioned sidecar or reported as an explicit mapping limitation; they are never silently discarded.

### Edge Cases

- An empty original, a multi-gigabyte original, and derivatives that are larger than the original.
- Original and derivative filenames that are identical, empty, reserved, absolute, traversal-like, or distinct only by case.
- Two derivatives with identical content but different semantic roles.
- A manifest with checksum evidence but no accessible source bytes.
- Accessible bytes whose checksum differs from the ingest manifest.
- A derivative that is planned or failed rather than created and available.
- An ingest with no provenance artifact or with an unsupported provenance version.
- BagIt tag files or OCFL inventory files that collide with caller-provided names.
- An output interrupted after some content has been copied or written.
- An output location containing a previous incomplete export.
- OCFL logical paths that collide after normalization or conflict as file and directory prefixes.
- Standard validation succeeds while a versioned SDK relationship sidecar is missing or corrupt.
- A future BagIt or OCFL version that changes allowed algorithms or required structures.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The feature MUST support preservation mappings for BagIt 1.0 as defined by RFC 8493 and OCFL 1.1 as explicit compatibility targets.
- **FR-002**: The first release MUST export and validate one ingest as one new BagIt package or one new OCFL object version and MUST NOT claim general repository management, arbitrary import, or multi-version synchronization.
- **FR-003**: Export eligibility MUST be evaluated before output mutation and MUST produce an exportable, exportable-with-warnings, or blocked classification with typed reasons.
- **FR-004**: Every export MUST designate exactly one source-of-truth original and MUST preserve that original byte-for-byte.
- **FR-005**: Created derivatives selected for export MUST remain separate content entries with traceable relationships to the original; planned, failed, stale, or unavailable derivatives MUST NOT be represented as successfully preserved content.
- **FR-006**: Export MUST require trusted whole-file digest evidence for every included content file and MUST never infer, truncate, or fabricate missing digest values.
- **FR-007**: When digest calculation is allowed before export, calculated values MUST be verified against existing trusted evidence when present and discrepancies MUST block successful export.
- **FR-008**: The same included content bytes MUST have consistent digest identity across the ingest manifest, provenance artifact, BagIt payload manifest, OCFL inventory, and any preservation sidecar that references them.
- **FR-009**: BagIt export MUST place every included original or derivative under the payload boundary and MUST generate standard payload-manifest entries using an allowed cryptographic digest.
- **FR-010**: BagIt export MUST produce and validate all required declaration and tag material for the selected BagIt profile, including tag integrity when tag manifests are present.
- **FR-011**: OCFL export MUST represent every included content file in the object inventory manifest and current logical state using an allowed content digest.
- **FR-012**: OCFL export MUST produce and validate the object conformance declaration, version inventory, inventory digest, content paths, logical paths, and version state required by the selected OCFL profile.
- **FR-013**: The original, derivatives, manifest, and provenance MUST use documented logical roles and deterministic collision-resistant paths that do not trust source filenames or caller metadata as filesystem paths.
- **FR-014**: Path planning MUST reject traversal, absolute paths, empty path elements, file-directory prefix conflicts, normalization collisions, and output paths outside the selected export root.
- **FR-015**: Ingest-specific relationships or provenance that lack a native BagIt or OCFL field MUST be preserved in a versioned, documented, integrity-protected sidecar or reported as an explicit unsupported mapping.
- **FR-016**: An export MUST NOT be reported as relationship-complete when a required sidecar is missing, malformed, integrity-invalid, or inconsistent with the standard manifest or inventory.
- **FR-017**: Mapping and validation results MUST identify source roles, content availability, digest status, planned standard paths, extension usage, warnings, blockers, and standard-version compatibility without exposing forbidden sensitive values.
- **FR-018**: Export processing MUST support sources whose size exceeds available application memory and MUST NOT require a source-size-linear application-owned buffer.
- **FR-019**: Interrupted or failed materialization MUST leave a distinguishable incomplete output and MUST NOT replace an already valid destination with a partial export.
- **FR-020**: Re-running export with the same authoritative inputs and profile MUST produce the same logical roles, paths, digest mappings, and relationship mappings, apart from explicitly documented creation-time or actor metadata.
- **FR-021**: Independent validation MUST detect changed or missing payload/content files, manifest or inventory digest mismatches, broken original-derivative relationships, unsupported versions, and unsafe paths.
- **FR-022**: Routine errors and reports MUST NOT expose credentials, secret URLs, storage tokens, sensitive object keys, filesystem roots, customer metadata values, full resume records, or raw provider receipts.
- **FR-023**: The preservation export MUST not require image decoding, pixel transformation, recompression, EXIF stripping, or derivative generation.
- **FR-024**: Existing ingest manifests and provenance artifacts MUST remain valid without preservation export; interoperability MUST be an additive, explicitly invoked capability.
- **FR-025**: Documentation MUST state the supported standard versions, export boundary, mapping rules, extension sidecars, digest rules, path safety, validation procedure, performance limitations, and non-goals.

### Key Entities

- **Preservation Mapping**: A pre-materialization description of content roles, paths, digests, relationships, sidecars, warnings, and blockers for one target standard.
- **Preservation Profile**: A versioned selection of BagIt or OCFL compatibility rules and supported extensions.
- **Preserved Content Entry**: One original, derivative, manifest, or provenance artifact selected for preservation with a role, digest, and planned logical path.
- **Relationship Sidecar**: A versioned integrity-protected record retaining ingest semantics that the base preservation standard does not represent natively.
- **BagIt Export**: One new BagIt 1.0 package containing selected payload content and required tag material.
- **OCFL Export**: One new OCFL 1.1 object version containing selected content, inventory state, and required conformance material.
- **Preservation Validation Result**: Typed structural, digest, path, relationship, compatibility, and completeness findings for a mapping or materialized export.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Independently validating generated BagIt fixtures reports 100% of included payload files with matching cryptographic digests and zero unmanifested payload files.
- **SC-002**: Independently validating generated OCFL fixtures reports 100% agreement among included content, inventory manifest, logical state, version inventory, and inventory digest.
- **SC-003**: Across original-plus-derivative fixtures, 100% of created included derivatives retain a valid relationship to exactly one source manifest identity, and zero planned, failed, stale, or unavailable derivatives are represented as successfully preserved content.
- **SC-004**: Mutation fixtures detect 100% of covered missing-file, changed-byte, changed-manifest, changed-inventory, broken-sidecar, and source-relationship inconsistencies.
- **SC-005**: Unsafe-name and collision fixtures produce zero paths outside the export root and zero ambiguous logical paths.
- **SC-006**: Mapping classifies 100% of fixtures with missing evidence, unavailable content, unsupported versions, or lossy fields before output mutation.
- **SC-007**: Exporting multi-gigabyte synthetic content stays within a documented fixed application-memory bound that does not grow in proportion to total source size.
- **SC-008**: Repeated mapping of identical authoritative inputs produces identical logical roles, paths, digest mappings, and relationship mappings in 100% of deterministic fixtures.
- **SC-009**: Interrupted-export fixtures replace zero valid completed destinations with partial output and always leave incomplete output distinguishable for cleanup or diagnosis.
- **SC-010**: Safe-output fixtures expose zero credentials, secret URLs, storage tokens, sensitive object keys, filesystem roots, customer metadata values, full recovery records, or raw provider receipts.

## Assumptions

- BagIt 1.0 under RFC 8493 and OCFL 1.1 are deliberate initial compatibility targets even if later standard versions exist.
- The first release creates new exports from one authoritative ingest and does not append to arbitrary existing bags, OCFL objects, or OCFL storage roots.
- Importing an arbitrary BagIt package or OCFL object back into an ingest session and guaranteeing lossless round trips are separate future features.
- Preservation sidecars are allowed only to retain SDK-specific semantics; base-standard validation must remain independently possible without them.
- Applications select which created derivatives and authorized metadata are included and provide access to their bytes.
- Storage provisioning, repository transactions, retention schedules, legal holds, replication, and disaster recovery remain repository responsibilities.
- A valid export demonstrates structural and fixity conformance for the supported profile; it does not by itself certify long-term preservation policy or regulatory compliance.
