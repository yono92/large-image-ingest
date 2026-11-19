import { PACKAGE_NAME } from "./package-version.js";
import type {
  DerivativeManifest,
  IngestEvent,
  IngestManifest,
  ResumeCompatibilityStatus,
  TransportCapabilities
} from "./types.js";
import { safeProvenanceMessage } from "./provenance-utils.js";
export { createIngestProvenanceRecorder, validateIngestProvenance, createSafeProvenanceSummary, exportIngestProvenance } from "./provenance-recorder.js";
export { persistIngestProvenance, canonicalizeProvenanceJson } from "./provenance-persistence.js";

/** @experimental */
export const INGEST_PROVENANCE_SCHEMA_VERSION =
  "large-image-ingest.provenance.v1" as const;
/** @experimental */
export const INGEST_PROVENANCE_INTEGRITY_ALGORITHM = "sha256" as const;
/** @experimental */
export const INGEST_PROVENANCE_CANONICALIZATION = "rfc8785-jcs" as const;

export type IngestProvenanceSchemaVersion = typeof INGEST_PROVENANCE_SCHEMA_VERSION;
export type ProvenanceDisclosureProfile = "audit" | "authorized-full";
export type ProvenanceTerminalStatus =
  | "active"
  | "completed"
  | "completed_unverified"
  | "verification_failed"
  | "upload_failed"
  | "canceled";
export type ProvenanceEvidenceSource =
  | "library"
  | "application"
  | "transport"
  | "verification"
  | "external";
export type ProvenanceEntryType =
  | "preparation"
  | "validation"
  | "session_created"
  | "progress_snapshot"
  | "chunk_started"
  | "acknowledgement"
  | "retry"
  | "recovery_available"
  | "resume"
  | "recovery_checkpoint"
  | "recovery_conflict"
  | "recovery_cleanup_failed"
  | "recovery_expired"
  | "pause"
  | "cancellation"
  | "completion"
  | "failure"
  | "verification"
  | "derivative"
  | "attestation"
  | "application_assertion";
export type ProvenanceVerificationStatus = "verified" | "failed" | "unavailable";
export type ProvenanceActorTrust =
  | "unsigned"
  | "not_evaluated"
  | "externally_attested"
  | "attestation_invalid";

export type ProvenanceIssueCode =
  | "provenance.schema_unsupported"
  | "provenance.structure_invalid"
  | "provenance.ordering_invalid"
  | "provenance.identity_mismatch"
  | "provenance.relationship_mismatch"
  | "provenance.integrity_invalid"
  | "provenance.disclosure_invalid"
  | "provenance.attestation_invalid"
  | "provenance.input_invalid"
  | "provenance.artifact_invalid"
  | "provenance.persistence_failed";

export interface ProvenanceIssue {
  code: ProvenanceIssueCode;
  path?: string;
}

export interface ProvenanceEntryMetrics {
  chunkIndex?: number;
  uploadedBytes?: number;
  totalBytes?: number;
  attempt?: number;
  completedRangeCount?: number;
  acknowledgedRangesReused?: number;
  retransmittedAcknowledgedBytes?: number;
}

export interface ProvenanceEntry {
  entryId: string;
  sequence: number;
  occurredAt: string;
  type: ProvenanceEntryType;
  evidenceSource: ProvenanceEvidenceSource;
  code?: string;
  metrics?: ProvenanceEntryMetrics;
}

export interface ProvenanceManifestReference {
  id: string;
  schemaVersion: string;
  sizeBytes: number;
  sourceEvidence: "whole-file-sha256" | "none";
  checksum?: {
    algorithm: "sha256";
    value: string;
  };
}

export type ProvenancePolicyResult = "passed" | "passed_with_warnings" | "failed";

export interface ProvenancePolicyEvaluation {
  id: string;
  version: string;
  result: ProvenancePolicyResult;
  failedRuleCodes: readonly string[];
  warningRuleCodes: readonly string[];
  failedRuleCount: number;
  warningRuleCount: number;
}

export interface ProvenancePolicyReference extends ProvenancePolicyEvaluation {
  history: readonly ProvenancePolicyEvaluation[];
}

export interface ProvenanceTransportCapabilitySummary {
  resumable: boolean;
  snapshotResume: boolean;
  persistentResume: boolean;
  abortable: boolean;
  expirationAware: boolean;
  parallelChunks: boolean;
  chunkIntegrity: boolean;
}

export interface ProvenanceTransportSummary {
  category: string;
  capabilities: ProvenanceTransportCapabilitySummary;
  receiptEvidenceCount: number;
  offsetEvidenceCount: number;
}

export interface ProvenanceRecoverySummary {
  recordSchemaVersions: readonly string[];
  classifications: readonly ResumeCompatibilityStatus[];
  resumeCount: number;
  acknowledgedRangesReused: number;
  retransmittedAcknowledgedBytes?: number;
  conflictCodes: readonly string[];
}

export interface ProvenanceVerificationEvidence {
  status: ProvenanceVerificationStatus;
  verifierCategory: string;
  expectedEvidenceCategories: readonly string[];
  observedEvidenceCategories: readonly string[];
  verifiedAt: string;
  issueCodes: readonly string[];
}

export interface ProvenanceDerivativeReference {
  id: string;
  kind: string;
  status: string;
  sourceManifestId: string;
  generator?: string;
  generatorVersion?: string;
  policyId?: string;
  checksum?: { algorithm: "sha256"; value: string };
  storageCategory?: string;
}

export interface ProvenanceExternalAttestation {
  id: string;
  type: string;
  digest: { algorithm: "sha256"; value: string };
  referenceId?: string;
}

export interface IngestProvenanceIntegrity {
  algorithm: typeof INGEST_PROVENANCE_INTEGRITY_ALGORITHM;
  canonicalization: typeof INGEST_PROVENANCE_CANONICALIZATION;
  value: string;
}

export interface IngestProvenanceArtifactV1 {
  schemaVersion: IngestProvenanceSchemaVersion;
  id: string;
  correlationId: string;
  createdAt: string;
  library: { name: typeof PACKAGE_NAME; version: string };
  disclosureProfile: ProvenanceDisclosureProfile;
  manifest: ProvenanceManifestReference;
  policy: ProvenancePolicyReference;
  transport: ProvenanceTransportSummary;
  recovery: ProvenanceRecoverySummary;
  entries: readonly ProvenanceEntry[];
  verification?: ProvenanceVerificationEvidence;
  derivatives: readonly ProvenanceDerivativeReference[];
  attestations: readonly ProvenanceExternalAttestation[];
  terminalStatus: ProvenanceTerminalStatus;
  annotations?: Readonly<Record<string, string>>;
  integrity: IngestProvenanceIntegrity;
}

export interface CreateIngestProvenanceRecorderOptions {
  manifest: IngestManifest;
  policy: { id: string; version: string };
  transport: { category: string; capabilities?: TransportCapabilities };
  disclosureProfile?: ProvenanceDisclosureProfile;
  annotations?: Readonly<Record<string, string>>;
  artifactId?: string;
  correlationId?: string;
  now?: () => Date;
}

export interface RecordProvenanceEntryInput {
  type?: "application_assertion";
  evidenceSource?: "application";
  occurredAt?: string;
  code?: string;
  metrics?: ProvenanceEntryMetrics;
}

export interface RecordProvenanceRecoveryInput {
  recordSchemaVersion?: string;
  classification?: ResumeCompatibilityStatus;
  acknowledgedRangesReused?: number;
  retransmittedAcknowledgedBytes?: number;
  conflictCode?: string;
  occurredAt?: string;
}

export interface RecordProvenanceTransportEvidenceInput {
  receiptEvidenceCount?: number;
  offsetEvidenceCount?: number;
  occurredAt?: string;
}

export interface RecordProvenanceVerificationInput {
  status: ProvenanceVerificationStatus;
  verifierCategory: string;
  expectedEvidenceCategories?: readonly string[];
  observedEvidenceCategories?: readonly string[];
  verifiedAt?: string;
  issueCodes?: readonly string[];
}

export interface RecordProvenanceDerivativeInput {
  derivative: DerivativeManifest;
  policyId?: string;
  occurredAt?: string;
}

export interface RecordProvenanceAttestationInput {
  attestation: ProvenanceExternalAttestation;
  occurredAt?: string;
}

export interface RecordProvenancePolicyInput {
  id: string;
  version: string;
  result: ProvenancePolicyResult;
  failedRuleCodes?: readonly string[];
  warningRuleCodes?: readonly string[];
  occurredAt?: string;
}

export interface IngestProvenanceRecorder {
  observeIngestEvent(event: IngestEvent): void;
  recordEntry(input?: RecordProvenanceEntryInput): void;
  recordRecovery(input: RecordProvenanceRecoveryInput): void;
  recordTransportEvidence(input: RecordProvenanceTransportEvidenceInput): void;
  recordVerification(input: RecordProvenanceVerificationInput): void;
  recordDerivative(input: RecordProvenanceDerivativeInput): void;
  recordExternalAttestation(input: RecordProvenanceAttestationInput): void;
  recordPolicyEvaluation(input: RecordProvenancePolicyInput): void;
  seal(): Promise<IngestProvenanceArtifactV1>;
}

export interface ValidateIngestProvenanceOptions {
  manifest?: IngestManifest;
  policy?: { id: string; version: string };
  verifyAttestation?: (
    attestation: ProvenanceExternalAttestation
  ) => Promise<{ valid: boolean }>;
}

export interface IngestProvenanceValidationResult {
  ok: boolean;
  issues: readonly ProvenanceIssue[];
  integrity: "valid" | "invalid";
  actorTrust: ProvenanceActorTrust;
  artifact?: IngestProvenanceArtifactV1;
}

export interface SafeProvenanceSummary {
  schemaVersion: "large-image-ingest.provenance-summary.v1";
  id: string;
  correlationId: string;
  createdAt: string;
  disclosureProfile: "safe-summary";
  terminalStatus: ProvenanceTerminalStatus;
  manifestId: string;
  sourceEvidence: ProvenanceManifestReference["sourceEvidence"];
  policy: {
    id: string;
    version: string;
    result: ProvenancePolicyResult;
    failedRuleCount: number;
    warningRuleCount: number;
    evaluationCount: number;
  };
  transportCategory: string;
  recovery: {
    resumeCount: number;
    acknowledgedRangesReused: number;
    conflictCount: number;
  };
  verificationStatus?: ProvenanceVerificationStatus;
  entryCount: number;
  derivativeCount: number;
  attestationCount: number;
  integrity: "valid";
  actorTrust: ProvenanceActorTrust;
}

export interface ProvenanceSink {
  write(artifact: IngestProvenanceArtifactV1): Promise<void>;
}

export type ProvenancePersistenceResult =
  | { ok: true; status: "persisted" }
  | { ok: false; status: "failed"; issue: ProvenanceIssue };

export interface PersistIngestProvenanceOptions {
  onOutcome?: (result: ProvenancePersistenceResult) => void;
}

/** @experimental */
export class IngestProvenanceError extends Error {
  readonly code: ProvenanceIssueCode;
  readonly issues: readonly ProvenanceIssue[];

  constructor(code: ProvenanceIssueCode, issues: readonly ProvenanceIssue[] = []) {
    super(safeProvenanceMessage(code));
    this.name = "IngestProvenanceError";
    this.code = code;
    this.issues = issues;
  }
}
