import type {
  ChecksumOptions,
  CreateIngestSessionOptions,
  DomainProfileReference,
  IngestFileLike,
  IngestManifest,
  ResumeOptions,
  UploadSessionSnapshot
} from "./types.js";
import type {
  DomainExternalEvidenceItem,
  DomainProfileEvaluation,
  DomainStructuralEvidence,
  DomainValidationProfile
} from "./profiles.js";
import type { IngestProvenanceArtifactV1 } from "./provenance.js";

export const WORKFLOW_CHECKPOINT_SCHEMA_VERSION =
  "large-image-ingest.workflow-checkpoint.v1" as const;
export const INGEST_EVIDENCE_BUNDLE_SCHEMA_VERSION =
  "large-image-ingest.evidence-bundle.v1" as const;

export type WorkflowStage =
  | "preparation"
  | "upload"
  | "upload_completion"
  | "verification"
  | "evidence_persistence"
  | "preservation"
  | "evidence_finalization";

export type WorkflowIssueCode =
  | "workflow.transition_invalid"
  | "workflow.profile_failed"
  | "workflow.source_identity_missing"
  | "workflow.verification_failed"
  | "workflow.evidence_persistence_failed"
  | "workflow.evidence_finalization_failed"
  | "workflow.preservation_failed"
  | "workflow.reconciliation_required"
  | "workflow.checkpoint_invalid"
  | "workflow.checkpoint_conflict"
  | "workflow.source_mismatch"
  | "workflow.profile_mismatch"
  | "workflow.evidence_bundle_invalid"
  | "workflow.evidence_bundle_integrity_invalid"
  | "workflow.evidence_bundle_version_unsupported"
  | "workflow.observer_failed"
  | "workflow.internal_failed";

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
  get(input: {
    evidenceId: string;
    revision: number;
  }): Promise<{
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

export type StableWorkflowStatus =
  | "prepared"
  | "paused"
  | "uploaded_unverified"
  | "verified"
  | "evidence_persisted"
  | "preserved";

export type WorkflowStatus =
  | "preparing"
  | "prepared"
  | "uploading"
  | "paused"
  | "uploaded_unverified"
  | "verifying"
  | "verified"
  | "persisting_evidence"
  | "evidence_persisted"
  | "preserving"
  | "finalizing_evidence"
  | "preserved"
  | "preparation_failed"
  | "upload_failed"
  | "verification_failed"
  | "evidence_persistence_failed"
  | "preservation_failed"
  | "evidence_finalization_failed"
  | "reconciliation_required"
  | "canceled"
  | "stopped";

export interface WorkflowStateBase {
  readonly status: WorkflowStatus;
  readonly workflowId: string;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface WorkflowPreparingState extends WorkflowStateBase {
  readonly status: "preparing";
  readonly allowedActions: readonly ["cancel"];
}

export interface WorkflowPreparedState extends WorkflowStateBase {
  readonly status: "prepared";
  readonly manifest: IngestManifest;
  readonly profileEvaluation: DomainProfileEvaluation;
  readonly allowedActions: readonly ["start_upload", "cancel"];
}

export interface WorkflowUploadingState extends WorkflowStateBase {
  readonly status: "uploading";
  readonly manifest: IngestManifest;
  readonly snapshot?: UploadSessionSnapshot;
  readonly allowedActions: readonly ["pause", "cancel"];
}

export interface WorkflowPausedState extends WorkflowStateBase {
  readonly status: "paused";
  readonly lastAuthoritativeState: "prepared";
  readonly allowedActions: readonly ["resume", "cancel"];
}

export interface WorkflowUploadedUnverifiedState extends WorkflowStateBase {
  readonly status: "uploaded_unverified";
  readonly manifest: IngestManifest;
  readonly allowedActions: readonly ["verify", "stop"];
}

export interface WorkflowVerifyingState extends WorkflowStateBase {
  readonly status: "verifying";
  readonly manifest: IngestManifest;
  readonly allowedActions: readonly [];
}

export interface WorkflowVerifiedState extends WorkflowStateBase {
  readonly status: "verified";
  readonly manifest: IngestManifest;
  readonly verification: WorkflowVerificationResult & { status: "verified" };
  readonly allowedActions: readonly ["persist_evidence", "stop"];
}

export interface WorkflowPersistingEvidenceState extends WorkflowStateBase {
  readonly status: "persisting_evidence";
  readonly lastAuthoritativeState: "verified";
  readonly allowedActions: readonly [];
}

export interface WorkflowEvidencePersistedTerminalState extends WorkflowStateBase {
  readonly status: "evidence_persisted";
  readonly terminal: true;
  readonly preservation: { readonly status: "not_requested" };
  readonly bundle: IngestEvidenceBundleV1;
  readonly evidenceReference: string;
  readonly allowedActions: readonly [];
}

export interface WorkflowEvidencePersistedPendingPreservationState extends WorkflowStateBase {
  readonly status: "evidence_persisted";
  readonly terminal: false;
  readonly preservation: { readonly status: "pending" };
  readonly bundle: IngestEvidenceBundleV1;
  readonly evidenceReference: string;
  readonly allowedActions: readonly ["preserve", "stop"];
}

export interface WorkflowPreservingState extends WorkflowStateBase {
  readonly status: "preserving";
  readonly lastAuthoritativeState: "evidence_persisted";
  readonly allowedActions: readonly [];
}

export interface WorkflowFinalizingEvidenceState extends WorkflowStateBase {
  readonly status: "finalizing_evidence";
  readonly lastAuthoritativeState: "evidence_persisted";
  readonly preservationOutcome: PreservationHandoffResult;
  readonly pendingBundleRevision: number;
  readonly allowedActions: readonly [];
}

export interface WorkflowPreservedState extends WorkflowStateBase {
  readonly status: "preserved";
  readonly terminal: true;
  readonly bundle: IngestEvidenceBundleV1;
  readonly evidenceReference: string;
  readonly allowedActions: readonly [];
}

export interface WorkflowFailedState extends WorkflowStateBase {
  readonly status:
    | "preparation_failed"
    | "upload_failed"
    | "verification_failed"
    | "evidence_persistence_failed"
    | "preservation_failed"
    | "evidence_finalization_failed";
  readonly lastAuthoritativeState?: StableWorkflowStatus;
  readonly issueCodes: readonly WorkflowIssueCode[];
  readonly retryability: "retry" | "reconcile" | "restart_upload" | "terminal";
  readonly allowedActions: readonly ("retry" | "stop")[];
}

export interface WorkflowReconciliationRequiredState extends WorkflowStateBase {
  readonly status: "reconciliation_required";
  readonly stage: WorkflowStage;
  readonly lastAuthoritativeState?: StableWorkflowStatus;
  readonly issueCodes: readonly ["workflow.reconciliation_required"];
  readonly allowedActions: readonly ["retry", "stop"];
}

export interface WorkflowCanceledState extends WorkflowStateBase {
  readonly status: "canceled";
  readonly terminal: true;
  readonly allowedActions: readonly [];
}

export interface WorkflowStoppedState extends WorkflowStateBase {
  readonly status: "stopped";
  readonly terminal: true;
  readonly lastAuthoritativeState: StableWorkflowStatus;
  readonly allowedActions: readonly [];
}

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
      readonly retryability: "terminal";
      readonly allowedActions: readonly [];
    });

export interface WorkflowCheckpointV1 {
  readonly schemaVersion: typeof WORKFLOW_CHECKPOINT_SCHEMA_VERSION;
  readonly workflowId: string;
  readonly revision: number;
  readonly updatedAt: string;
  readonly status: WorkflowStatus;
  readonly lastAuthoritativeState?: StableWorkflowStatus;
  readonly manifestId?: string;
  readonly sourceIdentity?: IngestEvidenceSourceIdentity;
  readonly profile?: DomainProfileReference;
  readonly resumeRecordId?: string;
  readonly operationIds: Readonly<Partial<Record<WorkflowStage, string>>>;
  readonly attempts: Readonly<Partial<Record<WorkflowStage, number>>>;
  readonly evidenceId?: string;
  readonly evidenceRevision?: number;
  readonly evidenceReference?: string;
  readonly verification?: WorkflowVerificationResult;
  readonly preservationOutcome?: PreservationHandoffResult;
}

export interface WorkflowCheckpointStore {
  get(workflowId: string): Promise<WorkflowCheckpointV1 | undefined>;
  put(
    checkpoint: WorkflowCheckpointV1,
    options: { expectedRevision: number | "absent" }
  ): Promise<"stored" | "conflict">;
  delete(workflowId: string): Promise<void>;
}

export interface IngestEvidenceSourceIdentity {
  readonly algorithm: "sha256";
  readonly scope: "whole-file";
  readonly sizeBytes: number;
  readonly value: string;
}

export interface IngestEvidenceBundleV1 {
  readonly schemaVersion: typeof INGEST_EVIDENCE_BUNDLE_SCHEMA_VERSION;
  readonly id: string;
  readonly revision: number;
  readonly workflowId: string;
  readonly correlationId: string;
  readonly createdAt: string;
  readonly library: { readonly name: "large-image-ingest"; readonly version: string };
  readonly subject: {
    readonly manifest: { readonly id: string; readonly schemaVersion: string };
    readonly sourceIdentity: IngestEvidenceSourceIdentity;
  };
  readonly policy: {
    readonly profile: DomainProfileReference;
    readonly result: "passed" | "passed_with_warnings";
    readonly failedRuleCodes: readonly string[];
    readonly warningRuleCodes: readonly string[];
  };
  readonly transfer: {
    readonly status: "completed";
    readonly transportCategory: string;
    readonly completionEvidence: "transport_and_session";
    readonly completedAt: string;
  };
  readonly verification: {
    readonly status: "verified";
    readonly verifierCategory: string;
    readonly expectedEvidenceCategories: readonly string[];
    readonly observedEvidenceCategories: readonly string[];
    readonly issueCodes: readonly [];
    readonly verifiedAt: string;
  };
  readonly provenance: {
    readonly id: string;
    readonly schemaVersion: string;
    readonly integrity: { readonly algorithm: "sha256"; readonly value: string };
    readonly persistence: { readonly status: "persisted"; readonly operationId: string };
  };
  readonly preservation:
    | { readonly status: "not_requested" }
    | { readonly status: "pending" }
    | PreservationHandoffResult;
  readonly stages: readonly {
    readonly stage: WorkflowStage;
    readonly operationId: string;
    readonly attempts: number;
    readonly outcome: "pending" | "succeeded" | "failed" | "ambiguous";
    readonly issueCodes: readonly string[];
  }[];
  readonly terminal: {
    readonly classification: "success" | "failure" | "nonterminal";
    readonly state: WorkflowStatus;
    readonly lastAuthoritativeState?: StableWorkflowStatus;
  };
  readonly trust: {
    readonly integrity: "self_hashed";
    readonly actorTrust: "unsigned" | "externally_attested" | "mixed";
    readonly timeTrust: "untrusted" | "externally_attested" | "mixed";
  };
  readonly integrity: {
    readonly algorithm: "sha256";
    readonly canonicalization: "rfc8785-jcs";
    readonly value: string;
  };
}

export interface IngestEvidenceBundleValidationResult {
  readonly ok: boolean;
  readonly issues: readonly WorkflowIssueCode[];
  readonly integrity: "valid" | "invalid";
  readonly actorTrust: IngestEvidenceBundleV1["trust"]["actorTrust"] | "unknown";
  readonly bundle?: IngestEvidenceBundleV1;
}

export interface SafeWorkflowSummary {
  readonly schemaVersion: "large-image-ingest.workflow-summary.v1";
  readonly workflowId: string;
  readonly status: WorkflowStatus;
  readonly terminal: boolean;
  readonly evidenceRevision?: number;
  readonly verificationStatus?: WorkflowVerificationResult["status"];
  readonly preservationStatus?: IngestEvidenceBundleV1["preservation"]["status"];
}

export interface WorkflowObserverFailure {
  readonly observer: "event" | "subscriber";
  readonly error: unknown;
}

export type VerifiedIngestWorkflowEvent =
  | { readonly type: "workflow:state"; readonly summary: SafeWorkflowSummary }
  | { readonly type: "workflow:stage-attempt"; readonly stage: WorkflowStage; readonly attempt: number }
  | { readonly type: "workflow:reconciliation-required"; readonly stage: WorkflowStage; readonly code: WorkflowIssueCode }
  | { readonly type: "workflow:completed"; readonly status: "evidence_persisted" | "preserved" }
  | { readonly type: "workflow:failed"; readonly stage: WorkflowStage; readonly codes: readonly WorkflowIssueCode[] };

export type WorkflowSessionOptions = Omit<
  CreateIngestSessionOptions,
  | "manifest"
  | "manifestIdentity"
  | "domainProfile"
  | "onEvent"
  | "onObserverError"
  | "onSnapshot"
  | "resumeFrom"
  | "resume"
  | "sourceIdentity"
  | "checksum"
> & {
  readonly resume: ResumeOptions;
  readonly checksum?: ChecksumOptions;
};

export interface CreateVerifiedIngestWorkflowOptions {
  readonly profile: {
    readonly definition: DomainValidationProfile;
    readonly structuralEvidence?: DomainStructuralEvidence;
    readonly externalEvidence?: Readonly<Record<string, DomainExternalEvidenceItem>>;
  };
  readonly session: WorkflowSessionOptions;
  readonly verifier: StoredObjectVerificationAdapter;
  readonly checkpointStore: WorkflowCheckpointStore;
  readonly evidenceSink: WorkflowEvidenceSink;
  readonly preservation?: PreservationHandoffAdapter;
  readonly onEvent?: (event: VerifiedIngestWorkflowEvent) => void;
  readonly onObserverError?: (failure: WorkflowObserverFailure) => void;
  readonly now?: () => Date;
  readonly createId?: (kind: "workflow" | "evidence" | "operation") => string;
}

export interface VerifiedIngestWorkflow {
  getState(): VerifiedIngestWorkflowState;
  subscribe(listener: () => void): () => void;
  start(): Promise<VerifiedIngestRunResult>;
  resume(workflowId: string): Promise<VerifiedIngestRunResult>;
  retry(): Promise<VerifiedIngestRunResult>;
  pause(reason?: unknown): void;
  cancel(reason?: unknown): Promise<VerifiedIngestTerminalState>;
}

export interface CreateIngestEvidenceBundleInput {
  readonly id: string;
  readonly revision: number;
  readonly workflowId: string;
  readonly manifest: IngestManifest;
  readonly profileEvaluation: DomainProfileEvaluation;
  readonly verification: WorkflowVerificationResult & { status: "verified" };
  readonly verifierCategory: string;
  readonly provenance: IngestProvenanceArtifactV1;
  readonly evidenceOperationId: string;
  readonly transportCategory: string;
  readonly preservation: IngestEvidenceBundleV1["preservation"];
  readonly terminal: IngestEvidenceBundleV1["terminal"];
  readonly stages: IngestEvidenceBundleV1["stages"];
  readonly createdAt: string;
}

export type EvidenceBundleDisclosureProfile = "audit" | "authorized-full";

export interface ValidateIngestEvidenceBundleOptions {
  readonly manifest?: IngestManifest;
  readonly provenance?: IngestProvenanceArtifactV1;
}

export type { IngestFileLike };
