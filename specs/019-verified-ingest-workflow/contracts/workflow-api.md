# Public Contract Draft: Verified Ingest Workflow

This is the implemented additive 1.7.0 contract. Future changes follow normal semantic-versioning and schema-versioning rules.

## Package Placement

```ts
import {
  createVerifiedIngestWorkflow,
  validateIngestEvidenceBundle,
  createSafeWorkflowSummary
} from "large-image-ingest/workflow";
```

`large-image-ingest/workflow` is browser-safe. It MUST NOT import Node built-ins, `large-image-ingest/preservation`, React, or provider-specific code.

Node convenience adapters are exported from `large-image-ingest/node`. Headless React projection is exported from `large-image-ingest/react`; ready-made UI projection is exported from `large-image-ingest/react-ui` without changing the existing controller or panel contract.

## Factory And Handle

```ts
export function createVerifiedIngestWorkflow(
  file: IngestFileLike,
  options: CreateVerifiedIngestWorkflowOptions
): VerifiedIngestWorkflow;

export interface VerifiedIngestWorkflow {
  getState(): VerifiedIngestWorkflowState;
  subscribe(listener: () => void): () => void;
  start(): Promise<VerifiedIngestRunResult>;
  resume(workflowId: string): Promise<VerifiedIngestRunResult>;
  retry(): Promise<VerifiedIngestRunResult>;
  pause(reason?: unknown): void;
  cancel(reason?: unknown): Promise<VerifiedIngestTerminalState>;
}
```

Only one mutating operation may run on a handle at a time. Repeated calls while the same operation is active return the same promise. Invalid transitions reject with a typed `workflow.transition_invalid` error and perform no external mutation.

## Options

```ts
export interface CreateVerifiedIngestWorkflowOptions {
  profile: {
    definition: DomainValidationProfile;
    structuralEvidence?: DomainStructuralEvidence;
    externalEvidence?: readonly DomainExternalEvidenceItem[];
  };
  session: Omit<
    CreateIngestSessionOptions,
    "manifest" | "manifestIdentity" | "domainProfile" | "checksum" | "onEvent" | "onSnapshot" | "resume"
  > & {
    resume: ResumeOptions;
    checksum?: ChecksumOptions;
  };
  verifier: StoredObjectVerificationAdapter;
  checkpointStore: WorkflowCheckpointStore;
  evidenceSink: WorkflowEvidenceSink;
  preservation?: PreservationHandoffAdapter;
  onEvent?: (event: VerifiedIngestWorkflowEvent) => void;
  onObserverError?: (failure: WorkflowObserverFailure) => void;
  now?: () => Date;
}
```

The facade always produces whole-file SHA-256 and requires a durable `ResumeStore`. It internally retains the core resume record through evidence completion so process restart can recover the authoritative manifest, then applies the application's requested cleanup policy. Passing `checksum: false`, a prebound manifest, or a precomputed domain binding through `session` is intentionally disallowed because the facade owns their order and cross-checking. Lower-level `createIngestSession()` retains its current flexibility.

## Application-Owned Adapters

```ts
export interface StoredObjectVerificationAdapter {
  readonly category: string;
  verify(input: {
    manifest: IngestManifest;
    operationId: string;
    signal: AbortSignal;
  }): Promise<WorkflowVerificationResult>;
  reconcile?(input: {
    manifest: IngestManifest;
    operationId: string;
    signal: AbortSignal;
  }): Promise<"not_found" | WorkflowVerificationResult>;
}

export interface WorkflowEvidenceSink {
  persist(input: {
    operationId: string;
    evidenceId: string;
    revision: number;
    expectedRevision: number | "absent";
    provenance: IngestProvenanceArtifactV1;
    bundle: IngestEvidenceBundleV1;
  }): Promise<{ status: "persisted"; reference: string; revision: number }>;
  reconcile?(input: {
    operationId: string;
    evidenceId: string;
    revision: number;
  }): Promise<
    | { status: "persisted"; reference: string; revision: number }
    | { status: "not_found" }
  >;
  get(input: { evidenceId: string; revision: number }): Promise<{
    provenance: IngestProvenanceArtifactV1;
    bundle: IngestEvidenceBundleV1;
    reference: string;
  } | undefined>;
}

export interface PreservationHandoffAdapter {
  readonly category: string;
  handoff(input: {
    operationId: string;
    manifest: IngestManifest;
    provenance: IngestProvenanceArtifactV1;
    evidence: IngestEvidenceBundleV1;
    signal: AbortSignal;
  }): Promise<PreservationHandoffResult>;
  reconcile?(input: {
    operationId: string;
    workflowId: string;
    signal: AbortSignal;
  }): Promise<{ status: "not_found" } | PreservationHandoffResult>;
}
```

Adapter rules:

- `operationId` is stable across retry/restart for the same intended effect.
- Evidence revisions are immutable and contiguous under one `evidenceId`; the same revision and operation ID must resolve to the same logical content or a typed conflict.
- A successful repeated call with the same operation ID must return the same logical outcome or a typed conflict.
- Adapters must never return credentials, presigned URLs, raw object keys, filesystem roots, raw provider errors, raw receipts, or customer metadata in public result fields.
- If an adapter cannot guarantee idempotency, it must implement `reconcile()` and the workflow must reconcile before repeating.
- Verification is not trusted merely because it is application-supplied; its evidence source and category are recorded.

## Checkpoint Store

```ts
export interface WorkflowCheckpointStore {
  get(workflowId: string): Promise<WorkflowCheckpointV1 | undefined>;
  put(
    checkpoint: WorkflowCheckpointV1,
    options: { expectedRevision: number | "absent" }
  ): Promise<"stored" | "conflict">;
  delete(workflowId: string): Promise<void>;
}
```

The checkpoint store is operational state. A conflict never permits last-writer-wins; the workflow reloads and validates the newer checkpoint. Terminal checkpoint cleanup is an application policy and does not delete the manifest, provenance, bundle, or preservation output.

## State Contract

```ts
export type VerifiedIngestWorkflowState =
  | WorkflowPreparingState
  | WorkflowPreparedState
  | WorkflowUploadingState
  | WorkflowPausedState
  | WorkflowUploadedUnverifiedState
  | WorkflowVerifyingState
  | WorkflowVerifiedState
  | WorkflowPersistingEvidenceState
  | WorkflowEvidencePersistedTerminalState
  | WorkflowEvidencePersistedPendingPreservationState
  | WorkflowPreservingState
  | WorkflowFinalizingEvidenceState
  | WorkflowPreservedState
  | WorkflowFailedState
  | WorkflowReconciliationRequiredState
  | WorkflowCanceledState
  | WorkflowStoppedState;

export type VerifiedIngestRunResult =
  | WorkflowEvidencePersistedTerminalState
  | WorkflowPreservedState
  | WorkflowPausedState
  | WorkflowFailedState
  | WorkflowReconciliationRequiredState
  | WorkflowCanceledState
  | WorkflowStoppedState;

export type VerifiedIngestTerminalState =
  | WorkflowEvidencePersistedTerminalState
  | WorkflowPreservedState
  | WorkflowCanceledState
  | WorkflowStoppedState
  | (WorkflowFailedState & {
      retryability: "terminal";
      allowedActions: readonly [];
    });
```

Every member has `status`, `workflowId`, `revision`, and `updatedAt`. State-specific fields are exact and readonly. Only authorized terminal-success states expose the full validated `bundle`; default state summaries expose safe counts/categories instead.

Key stable states:

```ts
interface WorkflowUploadedUnverifiedState extends WorkflowStateBase {
  status: "uploaded_unverified";
  manifest: IngestManifest;
  allowedActions: readonly ["verify", "stop"];
}

interface WorkflowVerifiedState extends WorkflowStateBase {
  status: "verified";
  manifest: IngestManifest;
  verification: WorkflowVerificationResult & { status: "verified" };
  allowedActions: readonly ["persist_evidence", "stop"];
}

interface WorkflowEvidencePersistedTerminalState extends WorkflowStateBase {
  status: "evidence_persisted";
  terminal: true;
  preservation: { status: "not_requested" };
  bundle: IngestEvidenceBundleV1;
  allowedActions: readonly [];
}

interface WorkflowEvidencePersistedPendingPreservationState extends WorkflowStateBase {
  status: "evidence_persisted";
  terminal: false;
  preservation: { status: "pending" };
  bundle: IngestEvidenceBundleV1;
  allowedActions: readonly ["preserve", "stop"];
}

interface WorkflowFinalizingEvidenceState extends WorkflowStateBase {
  status: "finalizing_evidence";
  lastAuthoritativeState: "evidence_persisted";
  preservationOutcome: PreservationHandoffResult;
  pendingBundleRevision: number;
  allowedActions: readonly [];
}

interface WorkflowPreservedState extends WorkflowStateBase {
  status: "preserved";
  terminal: true;
  bundle: IngestEvidenceBundleV1;
  allowedActions: readonly [];
}

interface WorkflowFailedState extends WorkflowStateBase {
  status:
    | "preparation_failed"
    | "upload_failed"
    | "verification_failed"
    | "evidence_persistence_failed"
    | "evidence_finalization_failed"
    | "preservation_failed";
  lastAuthoritativeState?: StableWorkflowStatus;
  issueCodes: readonly WorkflowIssueCode[];
  retryability: "retry" | "reconcile" | "restart_upload" | "terminal";
  allowedActions: readonly ("retry" | "stop")[];
}
```

The literal `terminal` and `preservation.status` fields distinguish the two `evidence_persisted` variants. Code receiving `VerifiedIngestTerminalState` can therefore never observe the pending-preservation variant, a retryable failure, or a reconciliation-required state. `VerifiedIngestRunResult` is broader because a single `start()`, `resume()`, or `retry()` call may stop at a recoverable boundary without terminating the workflow.

## Events And Observer Isolation

```ts
export type VerifiedIngestWorkflowEvent =
  | { type: "workflow:state"; summary: SafeWorkflowStateSummary }
  | { type: "workflow:stage-attempt"; stage: WorkflowStage; attempt: number }
  | { type: "workflow:reconciliation-required"; stage: WorkflowStage; code: WorkflowIssueCode }
  | { type: "workflow:completed"; status: "evidence_persisted" | "preserved" }
  | { type: "workflow:failed"; stage: WorkflowStage; codes: readonly WorkflowIssueCode[] };
```

Core events remain available through the existing session options only to the workflow internals. The workflow event surface emits safe projections. Application observer failures are isolated and reported to `onObserverError`; they never alter workflow authority or trigger retry.

## Verification And Preservation Result Shapes

```ts
export type WorkflowVerificationResult =
  | {
      status: "verified";
      checkedAt: string;
      expectedEvidenceCategories: readonly string[];
      observedEvidenceCategories: readonly string[];
    }
  | {
      status: "failed" | "unavailable";
      checkedAt: string;
      issueCodes: readonly string[];
      retryable: boolean;
    };

export type PreservationHandoffResult =
  | {
      status: "preserved";
      profile?: "bagit-1.0-sha256" | "ocfl-1.1-sha256";
      reference: string;
    }
  | {
      status: "failed";
      issueCodes: readonly string[];
      retryable: boolean;
    };
```

A preservation `reference` is a safe application identifier, not a path or object key.

## Evidence Bundle API

```ts
export const INGEST_EVIDENCE_BUNDLE_SCHEMA_VERSION =
  "large-image-ingest.evidence-bundle.v1" as const;

export async function validateIngestEvidenceBundle(
  value: unknown,
  options?: {
    manifest?: IngestManifest;
    provenance?: IngestProvenanceArtifactV1;
  }
): Promise<IngestEvidenceBundleValidationResult>;

export async function createSafeWorkflowSummary(
  value: unknown
): Promise<SafeWorkflowSummary>;

export async function exportIngestEvidenceBundle(
  value: unknown,
  options: { disclosureProfile: "audit" | "authorized-full" }
): Promise<IngestEvidenceBundleV1>;
```

Validation checks structure, ordering, identities, stage/state consistency, cross-artifact references, integrity, and disclosure. It reports actor trust separately from integrity and never echoes rejected values.

An `IngestEvidenceBundleV1` carries an immutable `id` and positive `revision`; `WorkflowEvidenceSink.persist().evidenceId` must equal `bundle.id`. A no-preservation workflow commits one terminal revision. A preservation-enabled workflow commits revision 1 with `preservation: pending`, then commits revision 2 with the handoff outcome. Only sink-confirmed revisions are exposed as authoritative bundles; retrying or reconciling revision 2 never repeats the preservation handoff.

Each bundle stage record has the exact fields `stage`, `operationId`, `attempts`, `outcome`, and `issueCodes`. Operation IDs are safe application-visible identities, remain stable for the same intended effect across retries, and do not expose transport upload IDs or provider locators. The provenance persistence operation remains the revision-1 persistence identity in later bundle revisions; evidence finalization has its own stage operation identity.

## Node Convenience Adapters

Additive exports from `large-image-ingest/node`:

```ts
export function createNodeStoredFileVerifier(options: {
  resolvePath(manifest: IngestManifest): Promise<PathLike>;
  checksum?: "required" | "when-present";
}): StoredObjectVerificationAdapter;

export function createFilesystemPreservationHandoff(options: {
  profile: "bagit-1.0-sha256" | "ocfl-1.1-sha256";
  resolveOriginalPath(manifest: IngestManifest): Promise<PathLike>;
  resolveDestination(input: { workflowId: string; operationId: string }): Promise<string>;
}): PreservationHandoffAdapter;
```

These helpers adapt existing Node verification and new-output preservation functions. They do not manage storage roots, append OCFL versions, implement retention, or accept raw filenames as paths.

## React Contracts

- `large-image-ingest/react` adds a headless `createVerifiedIngestController()` and hooks that subscribe directly to `VerifiedIngestWorkflow`.
- `large-image-ingest/react-ui` adds a distinct `VerifiedIngestPanel` that projects workflow states through upload, verification, evidence persistence, and optional preservation.
- Existing `createIngestController`, `InspectionUploadPanel`, verifier prop, phases, and CSS remain unchanged.
- The new UI may keep presentation intent and stale-result generation guards, but the workflow handle remains state authority.

## Compatibility Contract

- No existing export is removed or renamed.
- `createIngestSession().start()` still resolves at transport completion with an `IngestManifest`.
- `UploadSessionStatus.completed` retains its current meaning.
- Manifest v1, resume v0.1/v0.2/v0.3, provenance v1, and preservation mapping/relationship schemas remain unchanged.
- Root import remains compatibility core plus browser-safe transports; the workflow is initially opt-in through its explicit subpath.
- New error codes use the `workflow.*` namespace and do not repurpose current codes.
