// Part of workflow-types.ts, split out to keep modules under 500 lines; public exports stay on workflow-types.ts.
import type {
  ChecksumOptions,
  CreateIngestSessionOptions,
  DomainProfileReference,
  IngestManifest,
  ResumeOptions
} from "./types.js";
import type {
  DomainExternalEvidenceItem,
  DomainProfileEvaluation,
  DomainStructuralEvidence,
  DomainValidationProfile
} from "./profiles.js";
import type { IngestProvenanceArtifactV1 } from "./provenance.js";
import { INGEST_EVIDENCE_BUNDLE_SCHEMA_VERSION } from "./workflow-types.js";
import type { IngestEvidenceSourceIdentity, PreservationHandoffAdapter, PreservationHandoffResult, StableWorkflowStatus, StoredObjectVerificationAdapter, VerifiedIngestRunResult, VerifiedIngestTerminalState, VerifiedIngestWorkflowState, WorkflowCheckpointStore, WorkflowEvidenceSink, WorkflowIssueCode, WorkflowStage, WorkflowStatus, WorkflowVerificationResult } from "./workflow-types.js";

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
