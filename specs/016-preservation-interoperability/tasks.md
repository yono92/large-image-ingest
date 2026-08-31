# Tasks: Preservation Standard Interoperability

## Phase 1: Contracts And Mapping

- [x] T001 Add Node-only `large-image-ingest/preservation` ESM/CJS export, example mapping, and package checks
- [x] T002 [P] Add profile, entry, mapping, sidecar, issue, validation, export, and source types in `src/preservation.ts`
- [x] T003 [P] Add original/two-derivative/provenance fixtures and temporary-root helpers
- [x] T004 Implement preflight source availability, relationship, digest-policy, and provenance validation
- [x] T005 Implement deterministic source-independent logical paths, collision/prefix checks, and mapping classification
- [x] T006 Implement versioned JCS/SHA-256 relationship sidecar and generated manifest/provenance metadata entries
- [x] T007 [P] Add missing evidence/content, checksum mismatch, planned/failed derivative, unsupported provenance, unsafe name, collision, and determinism tests

## Phase 2: BagIt 1.0

- [x] T008 [P] Add complete bag, payload digest, tag digest, relationship, and independent-consumer tests
- [x] T009 [P] Add changed/missing/unmanifested payload, changed tag, unsafe manifest path, and corrupt sidecar tests
- [x] T010 Implement streaming BagIt staging with `bagit.txt`, payload tree, SHA-256 payload manifest, SDK tag files, and tag manifest
- [x] T011 Implement BagIt 1.0 validator with complete payload/tag coverage and relationship checks
- [x] T012 Implement no-replace promotion and distinguishable incomplete-output behavior

## Phase 3: OCFL 1.1

- [x] T013 [P] Add declaration, root/version inventory, inventory digest, manifest/state/content, and relationship tests
- [x] T014 [P] Add changed/missing content, inventory mismatch, sidecar mismatch, unsafe logical path, and unsupported existing-object tests
- [x] T015 [P] Add identical-byte multi-role digest deduplication assertions
- [x] T016 Implement one-new-object v1 layout with SHA-256 content addressing and deterministic inventory
- [x] T017 Implement root/version inventory sidecars and final inventory parity
- [x] T018 Implement OCFL object validator with declaration, content, inventory, state, path, and relationship checks

## Phase 4: Streaming, Security, And Compatibility

- [x] T019 [P] Add bounded-slice large synthetic Blob and fixed-memory assertions
- [x] T020 [P] Add raw path/URL/key/metadata/receipt/error no-leak tests
- [x] T021 [P] Add existing destination, interrupted write, and unchanged ingest/provenance compatibility tests
- [x] T022 Implement Blob streaming and one-copy-per-OCFL-digest materialization
- [x] T023 Implement typed safe failure/result projections with no raw path or source values

## Phase 5: Documentation And Verification

- [x] T024 Document standards, mapping, paths, sidecar, digest, validation, streaming, limitations, and non-goals in `docs/preservation.md`
- [x] T025 [P] Update README, quickstart, roadmap, changelog, package examples, and export map
- [x] T026 Run focused mapping/BagIt/OCFL/security/package tests
- [x] T027 Run full release matrix and package dry run
- [x] T028 Reconcile FR-001–FR-025 and SC-001–SC-010 and mark implemented only with no remaining work

## Dependencies

Mapping and the relationship sidecar block both exporters. BagIt and OCFL implementations are independent after mapping. Streaming/no-replace helpers are shared. Documentation and full gates follow both validators.

## Convergence Audit

- Completed 2026-08-31 with no remaining implementation task or unresolved requirement.
- FR-001–FR-025 map to the Node-only export, preflight, path, sidecar, staging, validation, documentation, and compatibility contracts in `src/preservation.ts` and `docs/preservation.md`.
- SC-001–SC-006 and SC-008–SC-010 are covered by deterministic fixtures, independent layout checks, mutations, unsafe input, interruption, and safe-output tests. SC-007 is covered by bounded-slice instrumentation, streaming write verification, and the existing retained multi-gigabyte checksum evidence; the application-owned buffer bound is independent of total source size.
- Focused preservation/package tests passed: 5 files, 22 tests. Full unit tests passed: 48 files, 264 tests. TypeScript ESM/CJS and all examples passed. Build/package-consumption, UI unit/browser, transport conformance, browser checksum, reference recovery/integrity, integration safe-skip, package dry-run, and `git diff --check` passed.
