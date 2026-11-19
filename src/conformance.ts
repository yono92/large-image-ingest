import { safeErrorMessage } from "./conformance-workflow-catalog.js";
import { SCENARIOS } from "./conformance-shared.js";
export { runTransportConformance, evaluateTransportCapabilityEvidence, validateTransportConformanceReport } from "./conformance-transport.js";
export { WORKFLOW_CONFORMANCE_CATALOG_VERSION, WORKFLOW_CONFORMANCE_REPORT_VERSION, WORKFLOW_CONFORMANCE_CATALOG } from "./conformance-workflow-catalog.js";
export type { WorkflowConformanceScenarioId, WorkflowConformanceScenario, WorkflowConformanceObservation, WorkflowConformanceTarget, WorkflowConformanceScenarioResult, WorkflowConformanceReportV1 } from "./conformance-workflow-catalog.js";
export { runWorkflowConformance } from "./conformance-workflow.js";

/** @experimental */
export const TRANSPORT_CONFORMANCE_CATALOG_VERSION =
  "large-image-ingest.transport-conformance-catalog.v1" as const;
/** @experimental */
export const TRANSPORT_CONFORMANCE_REPORT_VERSION =
  "large-image-ingest.transport-conformance-report.v1" as const;

export type TransportConformanceCatalogVersion =
  typeof TRANSPORT_CONFORMANCE_CATALOG_VERSION;
export type TransportConformanceReportVersion =
  typeof TRANSPORT_CONFORMANCE_REPORT_VERSION;

export type TransportConformanceScenarioId =
  | "source.validation-before-mutation"
  | "source.mismatch-before-mutation"
  | "recovery.interrupted-no-retransmit"
  | "recovery.invalid-evidence-rejected"
  | "recovery.session-reconciliation"
  | "completion.stored-original-verified"
  | "completion.ambiguous-result-reconciled"
  | "cancellation.abandoned-session-reported"
  | "cleanup.failure-after-completion-isolated"
  | "integrity.chunk-evidence-enforced";

export type TransportConformanceCategory = "s3-multipart" | "tus" | "nas";
export type TransportConformanceTargetClass =
  | "credential-free-representative"
  | "real-deployment";
export type TransportConformanceScenarioStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "unsupported";
export type TransportConformanceOverallStatus =
  | "conformant"
  | "non_conformant"
  | "incomplete";
export type TransportConformanceCleanupStatus =
  | "not_required"
  | "completed"
  | "failed"
  | "abandoned_identifiable";
export type TransportConformanceReconciliationOutcome =
  | "matched"
  | "missing"
  | "expired"
  | "local_ahead"
  | "remote_ahead"
  | "unverifiable";
export type TransportConformanceCapability = keyof TransportConformanceCapabilities;
export type TransportConformanceIssueCode =
  | "conformance.target_invalid"
  | "conformance.observation_invalid"
  | "conformance.invariant_failed"
  | "conformance.scenario_skipped"
  | "conformance.execution_failed"
  | "conformance.capability_unproven"
  | "conformance.report_invalid";

export interface TransportConformanceCapabilities {
  resumable: boolean;
  snapshotResume: boolean;
  persistentResume: boolean;
  abortable: boolean;
  expirationAware: boolean;
  parallelChunks: boolean;
  chunkIntegrity: boolean;
}

export interface TransportConformanceEnvironment {
  runtime: string;
  os: string;
  architecture: string;
}

export interface TransportConformanceTargetProfile {
  profileId: string;
  transportCategory: TransportConformanceCategory;
  targetClass: TransportConformanceTargetClass;
  environment: TransportConformanceEnvironment;
  configurationCategories: readonly string[];
}

export interface TransportConformanceObservation {
  sourceValidationRejected?: boolean;
  sourceIdentityEstablished?: boolean;
  sourceMismatchDetected?: boolean;
  sourceBytesUnchanged?: boolean;
  remoteMutationCountBeforeAuthority?: number;
  remoteMutationCount?: number;
  acknowledgedBytes?: number;
  retransmittedAcknowledgedBytes?: number;
  snapshotRecoveryProven?: boolean;
  persistentRecoveryProven?: boolean;
  reconciliationOutcomes?: readonly TransportConformanceReconciliationOutcome[];
  expirationReconciliationProven?: boolean;
  invalidEvidenceRejected?: boolean;
  chunkIntegrityEvidenceValidated?: boolean;
  parallelConcurrencyBounded?: boolean;
  canonicalReceiptOrder?: boolean;
  uniqueAcknowledgedProgress?: boolean;
  transferFinalized?: boolean;
  authoritativeCompletionCount?: number;
  ambiguousCompletionReconciled?: boolean;
  authoritativeCompletionPreserved?: boolean;
  storedByteCountMatched?: boolean;
  storedChecksumMatched?: boolean;
  injectedCleanupFailureObserved?: boolean;
  abandonedResourceCount?: number;
  cleanupReferenceId?: string;
  cleanupStatus?: TransportConformanceCleanupStatus;
  diagnosticCategory?: string;
  limitationCodes?: readonly string[];
  durationMs?: number;
}

export interface TransportConformanceSkip {
  status: "skipped";
  diagnosticCategory: string;
  limitationCodes?: readonly string[];
  cleanupStatus?: TransportConformanceCleanupStatus;
  abandonedResourceCount?: number;
  cleanupReferenceId?: string;
}

export interface TransportConformanceScenario {
  readonly id: TransportConformanceScenarioId;
  readonly kind: "common" | "capability";
  readonly requiredCapability?: TransportConformanceCapability;
  readonly requiredObservationFields: readonly (keyof TransportConformanceObservation)[];
}

export interface TransportConformanceCatalogV1 {
  readonly schemaVersion: TransportConformanceCatalogVersion;
  readonly scenarios: readonly TransportConformanceScenario[];
}

export type TransportConformanceEvidence = Omit<
  TransportConformanceObservation,
  "cleanupStatus" | "diagnosticCategory" | "limitationCodes" | "durationMs"
>;

export interface TransportConformanceScenarioResult {
  scenarioId: TransportConformanceScenarioId;
  status: TransportConformanceScenarioStatus;
  diagnosticCategory?: string;
  durationMs: number;
  cleanupStatus: TransportConformanceCleanupStatus;
  limitationCodes: readonly string[];
  evidence: TransportConformanceEvidence;
}

export interface TransportConformanceIssue {
  code: TransportConformanceIssueCode;
  path?: string;
  scenarioId?: TransportConformanceScenarioId;
  capability?: TransportConformanceCapability;
}

export interface TransportConformanceCleanupSummary {
  status: TransportConformanceCleanupStatus;
  abandonedResourceCount: number;
}

export interface TransportConformanceReportV1 {
  schemaVersion: TransportConformanceReportVersion;
  catalogVersion: TransportConformanceCatalogVersion;
  libraryVersion: string;
  reportId: string;
  startedAt: string;
  completedAt: string;
  target: TransportConformanceTargetProfile;
  capabilities: TransportConformanceCapabilities;
  results: readonly TransportConformanceScenarioResult[];
  issues: readonly TransportConformanceIssue[];
  overallStatus: TransportConformanceOverallStatus;
  cleanup: TransportConformanceCleanupSummary;
  limitations: readonly string[];
}

export interface TransportConformanceTarget {
  readonly profile: TransportConformanceTargetProfile;
  readonly capabilities: TransportConformanceCapabilities;
  runScenario(context: {
    scenario: TransportConformanceScenario;
    signal: AbortSignal;
  }): Promise<TransportConformanceObservation | TransportConformanceSkip>;
}

export interface RunTransportConformanceOptions {
  signal?: AbortSignal;
  reportId?: string;
  now?: () => Date;
}

export type TransportConformanceReportValidationResult =
  | { ok: true; issues: readonly []; report: TransportConformanceReportV1 }
  | { ok: false; issues: readonly TransportConformanceIssue[] };

/** @experimental */
export class TransportConformanceError extends Error {
  readonly code: TransportConformanceIssueCode;
  readonly issues: readonly TransportConformanceIssue[];

  constructor(
    code: TransportConformanceIssueCode,
    issues: readonly TransportConformanceIssue[] = []
  ) {
    super(safeErrorMessage(code));
    this.name = "TransportConformanceError";
    this.code = code;
    this.issues = issues;
  }
}

/** @experimental */
export const TRANSPORT_CONFORMANCE_CATALOG: TransportConformanceCatalogV1 = Object.freeze({
  schemaVersion: TRANSPORT_CONFORMANCE_CATALOG_VERSION,
  scenarios: Object.freeze(SCENARIOS)
});
