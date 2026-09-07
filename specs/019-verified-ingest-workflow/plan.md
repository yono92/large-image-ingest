# Implementation Plan: Verified Ingest Workflow

**Branch**: `[019-verified-ingest-workflow]` | **Date**: 2026-09-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/019-verified-ingest-workflow/spec.md`

## Summary

Add an opt-in browser-safe `large-image-ingest/workflow` facade that composes the existing domain profile evaluator, manifest creation, authoritative resumable session, independent stored-object verification, provenance recorder, durable evidence sink, and optional preservation handoff. The facade owns cross-stage ordering and a versioned checkpoint/evidence bundle, but never duplicates upload chunk, retry, acknowledgement, resume, or completion authority. Add thin Node and React adapters, preserve every existing subpath and schema, and target an additive minor release.

## Technical Context

**Language/Version**: TypeScript 5.x targeting ES2022; Node.js 20+; modern browsers with `Blob`, streams, `AbortSignal`, and optional Worker checksum executor

**Primary Dependencies**: existing `session`, `manifest`, `profiles`, `provenance`, `verification`, `diagnostics`, React adapter, Node verification, and preservation modules; native Web APIs and Node built-ins only in Node subpath; no new runtime dependency

**Storage**: application-owned `ResumeStore`, new `WorkflowCheckpointStore`, new idempotent/reconcilable `WorkflowEvidenceSink`, optional application preservation destination

**Testing**: Vitest unit/contract/state/restart/security tests; existing credential-free HTTP reference harness; package-consumption checks; browser checksum and UI suites; transport/adoption conformance reruns

**Target Platform**: browser-safe framework-agnostic SDK facade; Node convenience adapters; optional headless React and first-party React UI projections

**Project Type**: TypeScript SDK/library with additive package subpaths

**Performance Goals**: no second whole-file read in the default no-preservation path; no source-size-linear application buffer; state/checkpoint work proportional to stage/attempt count rather than source bytes; no regression beyond the documented variance of existing 1 GiB/3 GiB reference checks

**Constraints**: exact original preservation; mandatory whole-file SHA-256 for the facade; one source in v1; existing core session is sole upload authority; sensitive operational/evidence separation; browser/Node import separation; no provider credentials, external trust, repository operation, or retention implementation

**Scale/Scope**: one workflow and one evidence bundle per source; bounded state/attempt history; future multi-file grouping possible through independent workflow IDs; optional one new BagIt or OCFL output via adapter

**Tooling Note**: The project uses local Spec Kit 1.0.2 with executable Bash helpers; `.specify/scripts/bash/check-prerequisites.sh --json --paths-only` resolves Feature 019 successfully. Implementation followed the generated task order.

## Clarification Result

No critical ambiguity required an interactive question. The plan resolves the remaining design choices explicitly: the high-assurance facade requires a selected domain profile, uses one idempotent/reconcilable evidence sink, runs optional preservation only after evidence persistence, treats post-upload cancellation as stopping downstream work without rewriting transfer authority, and includes the additive React projection at P2. One source, the existing core session authority, independent verification, separate operational/evidence artifacts, application-owned adapters, and no external trust or repository lifecycle claims remain fixed boundaries.

## Constitution Check

- **Original preservation — PASS**: the facade passes the exact original into manifest/session APIs; no decode, rewrite, EXIF removal, preview, or derivative generation enters scope.
- **Recoverability — PASS**: core resume v0.3 remains chunk authority; a separate checkpoint records cross-stage coordination, legal retries, and reconciliation without embedding resume records.
- **Adapter boundaries — PASS**: transport, broker, verifier, evidence storage, preservation, React, and Node behavior remain adapters; browser workflow code has no Node import.
- **TypeScript/versioning — PASS**: workflow state, checkpoint v1, evidence bundle v1, events, errors, and adapter contracts are exported and additive. Existing schemas and status meanings remain unchanged.
- **Validation/security — PASS**: exact source SHA-256 and profile binding precede remote mutation; exact-key validators and safe projections exclude credentials, URLs, keys, raw errors/receipts, full manifests/resume state, and customer metadata from defaults.
- **Documentation/tests — PASS**: README golden path, migration guide, state/idempotency matrices, package checks, restart/failure/security suites, large-source benchmark, and conformance/adoption evidence rerun are required.

Post-design constitution re-check: **PASS**. No waiver or complexity exception is required.

## Architecture

### 1. Preparation pipeline

`createVerifiedIngestWorkflow(file, options)` stores the exact source handle. `start()` creates a checksum-bearing manifest through the existing manifest path, evaluates the explicitly supplied domain profile against that manifest and labelled evidence, and produces the existing session binding. Only a passing or warning-passing binding permits the existing session to start. Failed policy evaluation performs no transport mutation.

The apparent product shorthand “profile → manifest” means profile selection precedes work; evaluation follows manifest creation because the current evaluator intentionally accepts no Blob and reuses manifest SHA-256.

### 2. Upload delegation

The workflow creates exactly one `LargeImageIngestSession` for an active upload attempt and forwards its events to the existing provenance recorder. It projects snapshots into cross-stage state but does not maintain its own chunk list, receipt list, retry counter, remote handle, or upload completion algorithm. Pause, cancel, retry, and durable resume delegate to the current session methods and `ResumeStore`.

### 3. Post-upload stages

After the core `completed` event, state is `uploaded_unverified`. The workflow invokes the application verifier and records the typed result in provenance. A verified result advances to `verified`; failure preserves `uploaded_unverified` as last authority.

The workflow then seals provenance and constructs evidence bundle v1. One evidence-sink boundary persists the provenance plus an immutable bundle revision under a stable operation ID and returns a safe reference. Without preservation this is the only, terminal revision. Failed or ambiguous initial persistence leaves `verified` authoritative, and an unpersisted draft is never returned as an authoritative bundle.

If no preservation adapter is configured, `evidence_persisted` is terminal success. If configured, revision 1 records `preservation: pending` and the workflow invokes the handoff only after that audit anchor is durable. It then commits revision 2 with the exact preservation outcome under the same evidence ID and a distinct stable operation ID. Only a durable successful revision 2 advances to `preserved`; handoff failure retains `evidence_persisted` authority, and finalization failure retries or reconciles only revision 2 without repeating preservation.

### 4. Restart, idempotency, and concurrency

The checkpoint store persists a versioned cross-stage record with compare-and-set revision. On resume, the workflow validates schema, source SHA-256, manifest/profile identity, and stage consistency. Upload continuation delegates to the resume record. Post-upload continuation begins from the last stable authority.

Each verifier, evidence revision, and preservation effect receives a stable operation ID. A lost acknowledgement first calls `reconcile()` where available. Without idempotency or reconciliation evidence, the workflow returns `reconciliation_required` instead of repeating the effect. One handle coalesces identical concurrent calls; competing process handles are serialized through checkpoint revision conflicts.

### 5. Evidence bundle

The bundle is a cross-artifact dossier, not a replacement artifact. It references manifest/source identity, profile evaluation, transfer completion, independent verification, provenance integrity/persistence, optional preservation result, stage attempts, terminal classification, and trust limits. RFC 8785 canonical JSON plus SHA-256 protects authoritative fields. Full export is explicit; safe summary omits digest values and restricted references.

Detailed entities and transitions are in [data-model.md](data-model.md). Exact proposed TypeScript contracts are in [contracts/workflow-api.md](contracts/workflow-api.md).

## Public API Direction

Recommended surface:

- `large-image-ingest/workflow`: `createVerifiedIngestWorkflow`, state/result/types, evidence bundle validation/export/safe summary, checkpoint/evidence/preservation adapter interfaces.
- `large-image-ingest/node`: thin adapters for existing stored-file verification and new-output BagIt/OCFL handoff.
- `large-image-ingest/react`: headless controller/hooks that subscribe to the workflow state.
- `large-image-ingest/react-ui`: a distinct verified-workflow panel or provider that projects all stages without changing the legacy upload panel.

The dedicated subpath is preferred over expanding `createIngestSession()`. Alternatives and trade-offs are recorded in [research.md](research.md).

## Subpath Change Scope

### `core`

- No change to `LargeImageIngestSession`, `UploadSessionStatus`, completion meaning, manifest v1, or resume schema.
- Reuse existing public contracts directly. Add no facade-specific fields to `CreateIngestSessionOptions`.
- Only a narrowly proven additive safe helper may be added if the workflow otherwise must duplicate existing projection logic; default is no core code change.

### `workflow` (new)

- Add workflow factory/handle, discriminated states, terminal results, typed `workflow.*` errors/events, checkpoint parsing/validation, operation identity, adapter orchestration, evidence bundle v1, validation, export, and safe summary.
- Keep all source reads bounded through existing checksum/manifest/session APIs.
- Keep raw application errors out of state, checkpoint, bundle, and events.

### `profiles`

- No evaluator or schema change expected.
- Reuse `DomainValidationProfile`, evaluation, reference, and session binding.
- Add no automatic profile inference or registry.

### `provenance`

- Reuse recorder, event observation, policy/verification recording, seal, validation, JCS canonicalization, and trust separation.
- Do not change provenance v1 or legacy `ProvenanceSink` semantics.
- If a small conversion helper is needed, keep it additive and evidence-only; the default plan performs mapping inside the workflow module.

### `preservation`

- No base API/schema change expected.
- Continue supporting only preflight/new BagIt/new OCFL v1 export/independent validation.
- The workflow depends only on the abstract handoff adapter; browser code never imports this subpath.

### `node`

- Add a stored-file verifier adapter around `verifyNodeFileManifest()` with a trusted application path resolver.
- Add a preservation-handoff adapter around current mapping/export functions with a trusted destination resolver and stable operation identity.
- Reject raw filename-derived paths and existing destination mutation exactly as current preservation does.

### `react`

- Add a headless workflow controller/store adapter and hooks that expose the workflow's state and actions.
- Do not alter current `IngestController` or hooks.

### `react-ui`

- Add a distinct workflow-aware provider/panel/primitives covering policy, upload, verification, evidence persistence, preservation, reconciliation, and safe failures.
- Reuse current accessibility, stale-generation, safe-error, CSS token, and callback-isolation patterns.
- Do not duplicate workflow transitions or accept credentials/paths.

## Backward Compatibility And Migration

### Compatibility guarantees

- Existing root and subpath imports, runtime behavior, type declarations, and schemas remain intact.
- `createIngestSession().start()` still returns `IngestManifest` at transfer completion.
- Existing UI verifier behavior still stops at verified/failed presentation and is not silently upgraded.
- Existing application-managed provenance and preservation compositions remain valid.
- New workflow errors use a new namespace and do not reinterpret old codes.

### Opt-in migration path

1. Keep existing transport, `ResumeStore`, profile definition/evidence, verifier, and preservation implementation.
2. Wrap verifier and storage behavior in the new adapter contracts; use Node convenience adapters where applicable.
3. Replace application lifecycle glue with `createVerifiedIngestWorkflow()` while retaining the exact transport/session options.
4. Store workflow checkpoints separately from resume records and store the final bundle under the application's evidence policy.
5. Migrate UI only if desired; existing React surfaces remain supported.
6. Compare old and new paths through the credential-free reference harness before production adoption.

No data migration of manifest, resume, provenance, or preservation schemas is required. Existing in-flight core sessions cannot be retroactively adopted unless the application has enough source, manifest, profile, resume, and completion evidence to construct a valid initial workflow checkpoint; the default migration recommendation is to let them finish on the old path.

## Test, Benchmark, Conformance, And Documentation Acceptance

### Contract and unit acceptance

- Exhaustive compile-time and runtime tests for every legal transition, invalid transition, terminal classification, allowed action, and last-authority value.
- Checkpoint exact-key/schema/source/profile/state validation; revision conflict and stale-writer tests.
- Evidence bundle exact-key/schema/integrity/cross-artifact/state-order mutation matrix.
- Stable operation IDs across retry/restart and distinct attempt counts.
- Observer/callback exceptions leave authority and external call counts unchanged.
- Safe outputs contain zero forbidden values from seeded credentials, URLs, object keys, paths, metadata, receipts, records, and raw errors.

### Failure/recovery acceptance

- Inject failure before and after each stage effect and lost acknowledgement for upload completion, verification, evidence persistence, and preservation.
- Prove no post-upload failure triggers a second upload or recreates the manifest/source identity.
- Prove metadata-equal/different-byte and profile/manifest/chunking/transport mismatch reject before remote mutation.
- Prove pause/cancel races preserve existing session semantics and downstream stages do not begin early.
- Prove restart from each stable state continues at the correct stage and never skips unresolved reconciliation.

### Browser/Node and performance acceptance

- Static package graph test proves workflow/browser imports contain no `node:` built-ins, preservation exporter, React, or provider SDK.
- Synthetic large-Blob test proves bounded slices/streams and no source-size-linear application buffer.
- Default workflow performs one whole-file source hash before upload; profile evaluation adds zero Blob reads.
- Rerun 1 GiB and 3 GiB reference/Worker benchmarks and record environment, throughput, peak memory, retransmission, completion-call count, stored SHA-256, and variance. No universal guarantee is claimed.
- Optional preservation benchmark reports its additional verification/materialization reads separately.

### Conformance and adoption acceptance

- Add a versioned workflow conformance catalog for fake/representative adapters covering the state/idempotency matrix.
- Keep real-provider qualification opt-in and separately labelled; default tests remain credential-free.
- Update the adoption-evidence protocol/candidate revision and rerun because the authoritative integration changed. Retain adverse/parity results and staleness identity.
- Meet the spec target of at most five application-owned lifecycle coordination responsibilities; report code lines honestly even if they increase.

### Documentation acceptance

- Replace the README first-screen quick start with the 20–30-line workflow golden path while retaining a link to the lower-level session example.
- Add `docs/verified-ingest-workflow.md` with authority/state/recovery/idempotency/trust and browser/Node boundaries.
- Add a migration section and explicit application adapter responsibilities.
- Update `docs/roadmap.md`, `docs/quickstart.md`, `docs/react-ui.md`, `docs/provenance.md`, `docs/preservation.md`, `docs/domain-profiles.md`, `docs/server-operational-guide.md`, `CHANGELOG.md`, and examples only when implementation actually ships.
- State explicitly that self-hash is not signature/time trust, preservation handoff is not repository operation, and representative conformance is not provider qualification.

### Release gates

- `npm run typecheck`
- `npm run typecheck:examples`
- `npm run typecheck:inspection-ui-example`
- `npm test`
- `npm run test:ui`
- `npm run build`
- `npm run test:conformance`
- `npm run test:browser-checksum`
- `npm run test:reference`
- `npm run test:adoption-evidence`
- `npm audit --audit-level=moderate`

Network/provider tests remain explicit opt-in and are not required for default correctness.

## Project Structure

### Documentation (this feature)

```text
specs/019-verified-ingest-workflow/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── workflow-api.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Planned source and test changes

```text
src/
├── workflow.ts
├── workflow-types.ts
├── workflow-checkpoint.ts
├── evidence-bundle.ts
├── node-workflow.ts
├── node.ts
├── react-workflow-controller.ts
├── react.ts
├── react-ui.ts
└── react-ui/
    └── verified-workflow/*

tests/
├── workflow-state.test.ts
├── workflow-recovery.test.ts
├── workflow-idempotency.test.ts
├── workflow-security.test.ts
├── evidence-bundle.test.ts
├── evidence-bundle-security.test.ts
├── node-workflow.test.ts
├── react-workflow-controller.test.ts
├── react-ui-workflow.test.tsx
└── package-exports.test.ts

examples/
└── verified-ingest-workflow.ts
```

**Structure Decision**: Preserve the repository's current single-package, flat TypeScript module layout and additive subpaths. Do not introduce scoped packages or a new monorepo layer for one facade.

## Implementation Phases

1. Freeze public contract, state matrix, operation identity, checkpoint, and bundle fixtures.
2. Implement browser-safe evidence/checkpoint validators and workflow orchestration over existing APIs.
3. Add restart/idempotency/failure/security conformance and credential-free reference integration.
4. Add Node convenience adapters.
5. Add headless React and React UI projections without changing legacy surfaces.
6. Rerun performance/adoption/conformance evidence, update documentation, and complete release gates.

## Complexity Tracking

No constitution violation is planned. The new cross-stage checkpoint and evidence sink are justified durable boundaries: the existing resume record cannot safely carry post-upload coordination, and the existing provenance sink cannot atomically represent both sealed provenance and the final cross-stage bundle. No generic workflow engine, provider registry, repository abstraction, multi-file transaction, or policy DSL is introduced.
