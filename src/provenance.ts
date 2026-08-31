import { calculateChecksum } from "./checksum.js";
import { PACKAGE_NAME, PACKAGE_VERSION } from "./package-version.js";
import type {
  DerivativeManifest,
  IngestEvent,
  IngestFileLike,
  IngestManifest,
  ResumeCompatibilityStatus,
  TransportCapabilities
} from "./types.js";

export const INGEST_PROVENANCE_SCHEMA_VERSION =
  "large-image-ingest.provenance.v1" as const;
export const INGEST_PROVENANCE_INTEGRITY_ALGORITHM = "sha256" as const;
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

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_CODE = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_ENTRIES = 4096;
const MAX_DERIVATIVES = 1024;
const MAX_ATTESTATIONS = 64;
const MAX_CODES = 128;
const MAX_ANNOTATIONS = 32;
const ENTRY_TYPES = new Set<ProvenanceEntryType>([
  "preparation", "validation", "session_created", "progress_snapshot", "chunk_started",
  "acknowledgement", "retry", "recovery_available", "resume", "recovery_checkpoint",
  "recovery_conflict", "recovery_cleanup_failed", "recovery_expired", "pause",
  "cancellation", "completion", "failure", "verification", "derivative", "attestation",
  "application_assertion"
]);
const EVIDENCE_SOURCES = new Set<ProvenanceEvidenceSource>([
  "library", "application", "transport", "verification", "external"
]);
const TERMINAL_STATUSES = new Set<ProvenanceTerminalStatus>([
  "active", "completed", "completed_unverified", "verification_failed", "upload_failed", "canceled"
]);
const VERIFICATION_STATUSES = new Set<ProvenanceVerificationStatus>([
  "verified", "failed", "unavailable"
]);
const POLICY_RESULTS = new Set<ProvenancePolicyResult>([
  "passed", "passed_with_warnings", "failed"
]);
const RESUME_CLASSIFICATIONS = new Set<ResumeCompatibilityStatus>([
  "resumable", "upgradeable", "restart_only", "expired", "incompatible"
]);
const METRIC_KEYS = [
  "chunkIndex", "uploadedBytes", "totalBytes", "attempt", "completedRangeCount",
  "acknowledgedRangesReused", "retransmittedAcknowledgedBytes"
] as const;

interface MutableProvenanceState {
  entries: ProvenanceEntry[];
  policyHistory: ProvenancePolicyEvaluation[];
  recovery: {
    recordSchemaVersions: string[];
    classifications: ResumeCompatibilityStatus[];
    resumeCount: number;
    acknowledgedRangesReused: number;
    retransmittedAcknowledgedBytes?: number;
    conflictCodes: string[];
  };
  transport: ProvenanceTransportSummary;
  verification?: ProvenanceVerificationEvidence;
  derivatives: ProvenanceDerivativeReference[];
  attestations: ProvenanceExternalAttestation[];
  terminalStatus: ProvenanceTerminalStatus;
}

export function createIngestProvenanceRecorder(
  options: CreateIngestProvenanceRecorderOptions
): IngestProvenanceRecorder {
  return new ProvenanceRecorder(options);
}

class ProvenanceRecorder implements IngestProvenanceRecorder {
  private readonly manifest: IngestManifest;
  private readonly disclosureProfile: ProvenanceDisclosureProfile;
  private readonly annotations: Readonly<Record<string, string>> | undefined;
  private readonly artifactId: string;
  private readonly correlationId: string;
  private readonly createdAt: string;
  private readonly now: () => Date;
  private readonly state: MutableProvenanceState;

  constructor(options: CreateIngestProvenanceRecorderOptions) {
    this.manifest = options.manifest;
    this.disclosureProfile = options.disclosureProfile ?? "audit";
    this.annotations = validateAnnotations(options.annotations, this.disclosureProfile);
    this.artifactId = options.artifactId ?? createId("provenance");
    this.correlationId = options.correlationId ?? options.manifest.id;
    this.now = options.now ?? (() => new Date());
    this.createdAt = this.now().toISOString();
    assertSafeId(this.artifactId, "artifactId");
    assertSafeId(this.correlationId, "correlationId");
    assertManifestReferenceInput(options.manifest);
    assertSafeId(options.policy.id, "policy.id");
    assertSafeId(options.policy.version, "policy.version");
    assertSafeCode(options.transport.category, "transport.category");

    const initialPolicy = policyFromManifest(options.policy, options.manifest);
    this.state = {
      entries: [],
      policyHistory: [initialPolicy],
      recovery: {
        recordSchemaVersions: [],
        classifications: [],
        resumeCount: 0,
        acknowledgedRangesReused: 0,
        conflictCodes: []
      },
      transport: {
        category: options.transport.category,
        capabilities: summarizeCapabilities(options.transport.capabilities),
        receiptEvidenceCount: 0,
        offsetEvidenceCount: 0
      },
      derivatives: [],
      attestations: [],
      terminalStatus: "active"
    };
    this.append("preparation", "library", this.createdAt);
    this.append("validation", "library", options.manifest.createdAt);
  }

  observeIngestEvent(event: IngestEvent): void {
    switch (event.type) {
      case "validated":
        return;
      case "started":
        this.append("session_created", "transport");
        return;
      case "snapshot":
        this.append("progress_snapshot", "library", undefined, undefined, {
          uploadedBytes: event.snapshot.uploadedBytes,
          totalBytes: event.snapshot.totalBytes
        });
        return;
      case "chunk:started":
        this.append("chunk_started", "library", undefined, undefined, {
          chunkIndex: event.chunk.index,
          totalBytes: event.chunk.size
        });
        return;
      case "chunk:completed":
        this.append("acknowledgement", "transport", undefined, undefined, {
          chunkIndex: event.chunk.index,
          uploadedBytes: event.uploadedBytes,
          totalBytes: event.totalBytes
        });
        this.state.transport.receiptEvidenceCount += 1;
        return;
      case "retry":
        this.append("retry", "transport", undefined, safeErrorCode(event.error), {
          chunkIndex: event.chunk.index,
          attempt: event.attempt
        });
        return;
      case "resume:available":
        this.append("recovery_available", "library");
        return;
      case "resume:started":
        this.state.recovery.resumeCount += 1;
        this.append("resume", "library", undefined, undefined, {
          acknowledgedRangesReused: this.state.recovery.acknowledgedRangesReused
        });
        return;
      case "resume:checkpoint":
        this.append("recovery_checkpoint", "library", undefined, undefined, {
          completedRangeCount: event.completedChunkRanges.length
        });
        return;
      case "resume:conflict":
        this.addUnique(this.state.recovery.conflictCodes, event.code);
        this.append("recovery_conflict", "library", undefined, event.code);
        return;
      case "resume:cleanup-failed":
        this.append("recovery_cleanup_failed", "library", undefined, event.code);
        return;
      case "resume:expired":
        this.append("recovery_expired", "library");
        return;
      case "upload:paused":
      case "paused":
        this.append("pause", "library");
        return;
      case "upload:canceled":
      case "canceled":
        this.setTerminal("canceled");
        this.append("cancellation", "library");
        return;
      case "completed":
        this.setTerminal("completed_unverified");
        this.append("completion", "transport");
        return;
      case "failed":
        this.setTerminal("upload_failed");
        this.append("failure", "library", undefined, safeErrorCode(event.error));
        return;
    }
  }

  recordEntry(input: RecordProvenanceEntryInput = {}): void {
    this.append(
      input.type ?? "application_assertion",
      input.evidenceSource ?? "application",
      input.occurredAt,
      input.code,
      input.metrics
    );
  }

  recordRecovery(input: RecordProvenanceRecoveryInput): void {
    if (input.recordSchemaVersion !== undefined) {
      assertSafeCode(input.recordSchemaVersion, "recovery.recordSchemaVersion");
      this.addUnique(this.state.recovery.recordSchemaVersions, input.recordSchemaVersion);
    }
    if (input.classification !== undefined) {
      if (!RESUME_CLASSIFICATIONS.has(input.classification)) throw inputError("recovery.classification");
      this.addUnique(this.state.recovery.classifications, input.classification);
    }
    if (input.acknowledgedRangesReused !== undefined) {
      assertNonNegativeInteger(input.acknowledgedRangesReused, "recovery.acknowledgedRangesReused");
      this.state.recovery.acknowledgedRangesReused += input.acknowledgedRangesReused;
    }
    if (input.retransmittedAcknowledgedBytes !== undefined) {
      assertNonNegativeInteger(
        input.retransmittedAcknowledgedBytes,
        "recovery.retransmittedAcknowledgedBytes"
      );
      this.state.recovery.retransmittedAcknowledgedBytes = input.retransmittedAcknowledgedBytes;
    }
    if (input.conflictCode !== undefined) {
      assertSafeCode(input.conflictCode, "recovery.conflictCode");
      this.addUnique(this.state.recovery.conflictCodes, input.conflictCode);
    }
    this.append("application_assertion", "application", input.occurredAt, "recovery.summary", {
      ...(input.acknowledgedRangesReused !== undefined
        ? { acknowledgedRangesReused: input.acknowledgedRangesReused }
        : {}),
      ...(input.retransmittedAcknowledgedBytes !== undefined
        ? { retransmittedAcknowledgedBytes: input.retransmittedAcknowledgedBytes }
        : {})
    });
  }

  recordTransportEvidence(input: RecordProvenanceTransportEvidenceInput): void {
    if (input.receiptEvidenceCount !== undefined) {
      assertNonNegativeInteger(input.receiptEvidenceCount, "transport.receiptEvidenceCount");
      this.state.transport.receiptEvidenceCount += input.receiptEvidenceCount;
    }
    if (input.offsetEvidenceCount !== undefined) {
      assertNonNegativeInteger(input.offsetEvidenceCount, "transport.offsetEvidenceCount");
      this.state.transport.offsetEvidenceCount += input.offsetEvidenceCount;
    }
    this.append("application_assertion", "transport", input.occurredAt, "transport.evidence");
  }

  recordVerification(input: RecordProvenanceVerificationInput): void {
    if (this.state.terminalStatus !== "completed_unverified" &&
      this.state.terminalStatus !== "completed" &&
      this.state.terminalStatus !== "verification_failed") {
      throw inputError("verification.order");
    }
    if (!VERIFICATION_STATUSES.has(input.status)) throw inputError("verification.status");
    assertSafeCode(input.verifierCategory, "verification.verifierCategory");
    const expected = validateSafeCodes(input.expectedEvidenceCategories ?? [], "verification.expectedEvidenceCategories");
    const observed = validateSafeCodes(input.observedEvidenceCategories ?? [], "verification.observedEvidenceCategories");
    const issueCodes = validateSafeCodes(input.issueCodes ?? [], "verification.issueCodes");
    const verifiedAt = input.verifiedAt ?? this.now().toISOString();
    assertIsoDate(verifiedAt, "verification.verifiedAt");
    this.state.verification = {
      status: input.status,
      verifierCategory: input.verifierCategory,
      expectedEvidenceCategories: expected,
      observedEvidenceCategories: observed,
      verifiedAt,
      issueCodes
    };
    this.state.terminalStatus = input.status === "verified"
      ? "completed"
      : input.status === "failed"
        ? "verification_failed"
        : "completed_unverified";
    this.append("verification", "verification", verifiedAt, `verification.${input.status}`);
  }

  recordDerivative(input: RecordProvenanceDerivativeInput): void {
    const next = derivativeReference(input.derivative, this.manifest.id, input.policyId);
    const index = this.state.derivatives.findIndex(({ id }) => id === next.id);
    if (index >= 0) this.state.derivatives[index] = next;
    else this.state.derivatives.push(next);
    this.append("derivative", "application", input.occurredAt);
  }

  recordExternalAttestation(input: RecordProvenanceAttestationInput): void {
    validateAttestationInput(input.attestation);
    if (this.state.attestations.some(({ id }) => id === input.attestation.id)) {
      throw inputError("attestations.id");
    }
    if (this.state.attestations.length >= MAX_ATTESTATIONS) throw inputError("attestations");
    this.state.attestations.push(cloneAttestation(input.attestation));
    this.append("attestation", "external", input.occurredAt);
  }

  recordPolicyEvaluation(input: RecordProvenancePolicyInput): void {
    const evaluation = createPolicyEvaluation(input);
    if (this.state.policyHistory.length >= MAX_CODES) throw inputError("policy.history");
    this.state.policyHistory.push(evaluation);
    this.append("validation", "application", input.occurredAt, "policy.evaluated");
  }

  async seal(): Promise<IngestProvenanceArtifactV1> {
    const latestPolicy = this.state.policyHistory.at(-1);
    if (!latestPolicy) throw inputError("policy");
    const body: Omit<IngestProvenanceArtifactV1, "integrity"> = {
      schemaVersion: INGEST_PROVENANCE_SCHEMA_VERSION,
      id: this.artifactId,
      correlationId: this.correlationId,
      createdAt: this.createdAt,
      library: { name: PACKAGE_NAME, version: PACKAGE_VERSION },
      disclosureProfile: this.disclosureProfile,
      manifest: manifestReference(this.manifest),
      policy: { ...latestPolicy, history: this.state.policyHistory.map(clonePolicy) },
      transport: cloneTransport(this.state.transport),
      recovery: cloneRecovery(this.state.recovery),
      entries: this.state.entries.map(cloneEntry),
      derivatives: this.state.derivatives.map(cloneDerivativeReference),
      attestations: this.state.attestations.map(cloneAttestation),
      terminalStatus: this.state.terminalStatus,
      ...(this.state.verification ? { verification: cloneVerification(this.state.verification) } : {}),
      ...(this.annotations ? { annotations: { ...this.annotations } } : {})
    };
    const integrity = await createIntegrity(body);
    const artifact: IngestProvenanceArtifactV1 = { ...body, integrity };
    const shapeIssues = validateArtifactShape(artifact);
    if (shapeIssues.length > 0) {
      throw new IngestProvenanceError("provenance.artifact_invalid", shapeIssues);
    }
    return deepFreeze(cloneArtifact(artifact));
  }

  private append(
    type: ProvenanceEntryType,
    evidenceSource: ProvenanceEvidenceSource,
    occurredAt = this.now().toISOString(),
    code?: string,
    metrics?: ProvenanceEntryMetrics
  ): void {
    if (this.state.entries.length >= MAX_ENTRIES) throw inputError("entries");
    assertIsoDate(occurredAt, "entry.occurredAt");
    if (code !== undefined) assertSafeCode(code, "entry.code");
    const safeMetrics = normalizeMetrics(metrics);
    const sequence = this.state.entries.length;
    this.state.entries.push({
      entryId: `entry-${sequence}`,
      sequence,
      occurredAt,
      type,
      evidenceSource,
      ...(code ? { code } : {}),
      ...(safeMetrics ? { metrics: safeMetrics } : {})
    });
  }

  private setTerminal(next: ProvenanceTerminalStatus): void {
    if (this.state.terminalStatus === "active") {
      this.state.terminalStatus = next;
      return;
    }
    if (this.state.terminalStatus !== next) throw inputError("terminalStatus");
  }

  private addUnique<T>(values: T[], value: T): void {
    if (!values.includes(value)) values.push(value);
  }
}

export async function validateIngestProvenance(
  value: unknown,
  options: ValidateIngestProvenanceOptions = {}
): Promise<IngestProvenanceValidationResult> {
  const issues = validateArtifactShape(value);
  if (issues.length > 0 || !isRecord(value)) {
    return {
      ok: false,
      issues: dedupeIssues(issues.length > 0 ? issues : [issue("provenance.structure_invalid")]),
      integrity: "invalid",
      actorTrust: "not_evaluated"
    };
  }

  const artifact = value as unknown as IngestProvenanceArtifactV1;
  validateEntryRelationships(artifact, issues);
  validateTerminalRelationships(artifact, issues);
  validateExpectedRelationships(artifact, options, issues);

  let integrity: "valid" | "invalid" = "invalid";
  try {
    const expected = await createIntegrity(withoutIntegrity(artifact));
    if (constantTimeEqual(expected.value, artifact.integrity.value)) {
      integrity = "valid";
    } else {
      issues.push(issue("provenance.integrity_invalid", "integrity"));
    }
  } catch {
    issues.push(issue("provenance.integrity_invalid", "integrity"));
  }

  const actorTrust = await evaluateActorTrust(artifact, options, issues);
  const finalIssues = dedupeIssues(issues);
  return {
    ok: finalIssues.length === 0 && integrity === "valid" && actorTrust !== "attestation_invalid",
    issues: finalIssues,
    integrity,
    actorTrust,
    ...(finalIssues.length === 0 && integrity === "valid" ? { artifact } : {})
  };
}

export async function createSafeProvenanceSummary(
  value: unknown
): Promise<SafeProvenanceSummary> {
  const validation = await validateIngestProvenance(value);
  if (!validation.ok || !validation.artifact) {
    throw new IngestProvenanceError("provenance.artifact_invalid", validation.issues);
  }
  const artifact = validation.artifact;
  const summary: SafeProvenanceSummary = {
    schemaVersion: "large-image-ingest.provenance-summary.v1",
    id: artifact.id,
    correlationId: artifact.correlationId,
    createdAt: artifact.createdAt,
    disclosureProfile: "safe-summary",
    terminalStatus: artifact.terminalStatus,
    manifestId: artifact.manifest.id,
    sourceEvidence: artifact.manifest.sourceEvidence,
    policy: {
      id: artifact.policy.id,
      version: artifact.policy.version,
      result: artifact.policy.result,
      failedRuleCount: artifact.policy.failedRuleCount,
      warningRuleCount: artifact.policy.warningRuleCount,
      evaluationCount: artifact.policy.history.length
    },
    transportCategory: artifact.transport.category,
    recovery: {
      resumeCount: artifact.recovery.resumeCount,
      acknowledgedRangesReused: artifact.recovery.acknowledgedRangesReused,
      conflictCount: artifact.recovery.conflictCodes.length
    },
    ...(artifact.verification ? { verificationStatus: artifact.verification.status } : {}),
    entryCount: artifact.entries.length,
    derivativeCount: artifact.derivatives.length,
    attestationCount: artifact.attestations.length,
    integrity: "valid",
    actorTrust: validation.actorTrust
  };
  return deepFreeze(summary);
}

export async function exportIngestProvenance(
  value: unknown,
  options: { disclosureProfile: ProvenanceDisclosureProfile }
): Promise<IngestProvenanceArtifactV1> {
  if (!options || !["audit", "authorized-full"].includes(options.disclosureProfile)) {
    throw inputError("disclosureProfile");
  }
  const validation = await validateIngestProvenance(value);
  if (!validation.ok || !validation.artifact) {
    throw new IngestProvenanceError("provenance.artifact_invalid", validation.issues);
  }
  const artifact = validation.artifact;
  const body = withoutIntegrity(artifact);
  const projected: Omit<IngestProvenanceArtifactV1, "integrity"> = {
    ...body,
    disclosureProfile: options.disclosureProfile,
    ...(options.disclosureProfile === "authorized-full" && body.annotations
      ? { annotations: { ...body.annotations } }
      : {})
  };
  if (options.disclosureProfile === "audit") delete projected.annotations;
  const exported = { ...projected, integrity: await createIntegrity(projected) };
  return deepFreeze(cloneArtifact(exported));
}

export async function persistIngestProvenance(
  value: unknown,
  sink: ProvenanceSink,
  options: PersistIngestProvenanceOptions = {}
): Promise<ProvenancePersistenceResult> {
  const validation = await validateIngestProvenance(value);
  if (!validation.ok || !validation.artifact) {
    const result: ProvenancePersistenceResult = {
      ok: false,
      status: "failed",
      issue: issue("provenance.artifact_invalid")
    };
    notifyPersistenceOutcome(options.onOutcome, result);
    return result;
  }

  try {
    await sink.write(cloneArtifact(validation.artifact));
    const result: ProvenancePersistenceResult = { ok: true, status: "persisted" };
    notifyPersistenceOutcome(options.onOutcome, result);
    return result;
  } catch {
    const result: ProvenancePersistenceResult = {
      ok: false,
      status: "failed",
      issue: issue("provenance.persistence_failed")
    };
    notifyPersistenceOutcome(options.onOutcome, result);
    return result;
  }
}

export function canonicalizeProvenanceJson(value: unknown): string {
  const seen = new WeakSet<object>();
  return canonicalizeValue(value, seen);
}

function canonicalizeValue(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw inputError("canonicalization.number");
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    if (hasLoneSurrogate(value)) throw inputError("canonicalization.string");
    return JSON.stringify(value);
  }
  if (typeof value !== "object" || value === undefined) {
    throw inputError("canonicalization.value");
  }
  if (seen.has(value)) throw inputError("canonicalization.cycle");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalizeValue(item, seen)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw inputError("canonicalization.object");
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareUtf16);
    return `{${keys.map((key) => {
      if (hasLoneSurrogate(key)) throw inputError("canonicalization.key");
      return `${JSON.stringify(key)}:${canonicalizeValue(record[key], seen)}`;
    }).join(",")}}`;
  } finally {
    seen.delete(value);
  }
}

async function createIntegrity(
  body: Omit<IngestProvenanceArtifactV1, "integrity">
): Promise<IngestProvenanceIntegrity> {
  const canonical = canonicalizeProvenanceJson(body);
  const blob = new Blob([canonical], { type: "application/json" });
  Object.defineProperties(blob, {
    name: { value: "provenance.json" },
    lastModified: { value: 0 }
  });
  const checksum = await calculateChecksum(blob as IngestFileLike);
  return {
    algorithm: INGEST_PROVENANCE_INTEGRITY_ALGORITHM,
    canonicalization: INGEST_PROVENANCE_CANONICALIZATION,
    value: checksum.value
  };
}

function validateArtifactShape(value: unknown): ProvenanceIssue[] {
  const issues: ProvenanceIssue[] = [];
  if (!isRecord(value)) return [issue("provenance.structure_invalid")];
  if (value.schemaVersion !== INGEST_PROVENANCE_SCHEMA_VERSION) {
    return [issue("provenance.schema_unsupported", "schemaVersion")];
  }
  exactKeys(value, [
    "schemaVersion", "id", "correlationId", "createdAt", "library", "disclosureProfile",
    "manifest", "policy", "transport", "recovery", "entries", "verification", "derivatives",
    "attestations", "terminalStatus", "annotations", "integrity"
  ], [
    "schemaVersion", "id", "correlationId", "createdAt", "library", "disclosureProfile",
    "manifest", "policy", "transport", "recovery", "entries", "derivatives", "attestations",
    "terminalStatus", "integrity"
  ], issues, "artifact");
  if (!isSafeId(value.id)) issues.push(structure("id"));
  if (!isSafeId(value.correlationId)) issues.push(structure("correlationId"));
  if (!isIsoDate(value.createdAt)) issues.push(structure("createdAt"));
  validateLibrary(value.library, issues);
  const profile = value.disclosureProfile;
  if (profile !== "audit" && profile !== "authorized-full") issues.push(disclosure("disclosureProfile"));
  validateManifestReference(value.manifest, issues);
  validatePolicy(value.policy, issues);
  validateTransport(value.transport, issues);
  validateRecovery(value.recovery, issues);
  validateEntries(value.entries, issues);
  if (value.verification !== undefined) validateVerification(value.verification, issues);
  validateDerivatives(value.derivatives, issues);
  validateAttestations(value.attestations, issues);
  if (!TERMINAL_STATUSES.has(value.terminalStatus as ProvenanceTerminalStatus)) {
    issues.push(structure("terminalStatus"));
  }
  validateArtifactAnnotations(value.annotations, profile, issues);
  validateIntegrity(value.integrity, issues);
  return dedupeIssues(issues);
}

function validateLibrary(value: unknown, issues: ProvenanceIssue[]): void {
  if (!isRecord(value)) return void issues.push(structure("library"));
  exactKeys(value, ["name", "version"], ["name", "version"], issues, "library");
  if (value.name !== PACKAGE_NAME || typeof value.version !== "string" || !SEMVER.test(value.version)) {
    issues.push(structure("library"));
  }
}

function validateManifestReference(value: unknown, issues: ProvenanceIssue[]): void {
  if (!isRecord(value)) return void issues.push(structure("manifest"));
  exactKeys(value, ["id", "schemaVersion", "sizeBytes", "sourceEvidence", "checksum"], [
    "id", "schemaVersion", "sizeBytes", "sourceEvidence"
  ], issues, "manifest");
  if (!isSafeId(value.id) || value.schemaVersion !== "large-image-ingest.manifest.v1") {
    issues.push(structure("manifest.identity"));
  }
  if (!isNonNegativeInteger(value.sizeBytes)) issues.push(structure("manifest.sizeBytes"));
  if (value.sourceEvidence !== "whole-file-sha256" && value.sourceEvidence !== "none") {
    issues.push(structure("manifest.sourceEvidence"));
  }
  if (value.checksum !== undefined) validateChecksum(value.checksum, issues, "manifest.checksum");
  if (value.sourceEvidence === "whole-file-sha256" && value.checksum === undefined) {
    issues.push(structure("manifest.checksum"));
  }
  if (value.sourceEvidence === "none" && value.checksum !== undefined) {
    issues.push(structure("manifest.sourceEvidence"));
  }
}

function validatePolicy(value: unknown, issues: ProvenanceIssue[]): void {
  if (!isRecord(value)) return void issues.push(structure("policy"));
  exactKeys(value, [
    "id", "version", "result", "failedRuleCodes", "warningRuleCodes", "failedRuleCount",
    "warningRuleCount", "history"
  ], [
    "id", "version", "result", "failedRuleCodes", "warningRuleCodes", "failedRuleCount",
    "warningRuleCount", "history"
  ], issues, "policy");
  validatePolicyEvaluation(value, issues, "policy", true);
  if (!Array.isArray(value.history) || value.history.length < 1 || value.history.length > MAX_CODES) {
    issues.push(structure("policy.history"));
  } else {
    value.history.forEach((evaluation, index) => validatePolicyEvaluation(
      evaluation,
      issues,
      `policy.history.${index}`,
      false
    ));
    const latest = value.history.at(-1);
    if (isRecord(latest) && !samePolicyEvaluation(value, latest)) {
      issues.push(relationship("policy.history"));
    }
  }
}

function validatePolicyEvaluation(
  value: unknown,
  issues: ProvenanceIssue[],
  path: string,
  allowHistory: boolean
): void {
  if (!isRecord(value)) return void issues.push(structure(path));
  exactKeys(value, [
    "id", "version", "result", "failedRuleCodes", "warningRuleCodes", "failedRuleCount",
    "warningRuleCount", ...(allowHistory ? ["history"] : [])
  ], [
    "id", "version", "result", "failedRuleCodes", "warningRuleCodes", "failedRuleCount",
    "warningRuleCount", ...(allowHistory ? ["history"] : [])
  ], issues, path);
  if (!isSafeId(value.id) || !isSafeId(value.version) ||
    !POLICY_RESULTS.has(value.result as ProvenancePolicyResult)) issues.push(structure(path));
  if (!isSafeCodeArray(value.failedRuleCodes) || !isSafeCodeArray(value.warningRuleCodes)) {
    issues.push(structure(path));
    return;
  }
  if (value.failedRuleCount !== value.failedRuleCodes.length ||
    value.warningRuleCount !== value.warningRuleCodes.length) issues.push(relationship(path));
}

function validateTransport(value: unknown, issues: ProvenanceIssue[]): void {
  if (!isRecord(value)) return void issues.push(structure("transport"));
  exactKeys(value, ["category", "capabilities", "receiptEvidenceCount", "offsetEvidenceCount"], [
    "category", "capabilities", "receiptEvidenceCount", "offsetEvidenceCount"
  ], issues, "transport");
  if (!isSafeCode(value.category)) issues.push(structure("transport.category"));
  validateCapabilities(value.capabilities, issues);
  if (!isNonNegativeInteger(value.receiptEvidenceCount) || !isNonNegativeInteger(value.offsetEvidenceCount)) {
    issues.push(structure("transport.evidenceCount"));
  }
}

function validateCapabilities(value: unknown, issues: ProvenanceIssue[]): void {
  const keys = [
    "resumable", "snapshotResume", "persistentResume", "abortable", "expirationAware",
    "parallelChunks", "chunkIntegrity"
  ];
  if (!isRecord(value)) return void issues.push(structure("transport.capabilities"));
  exactKeys(value, keys, keys, issues, "transport.capabilities");
  if (keys.some((key) => typeof value[key] !== "boolean")) {
    issues.push(structure("transport.capabilities"));
  }
  if ((value.snapshotResume === true || value.persistentResume === true) && value.resumable !== true) {
    issues.push(relationship("transport.capabilities"));
  }
}

function validateRecovery(value: unknown, issues: ProvenanceIssue[]): void {
  if (!isRecord(value)) return void issues.push(structure("recovery"));
  exactKeys(value, [
    "recordSchemaVersions", "classifications", "resumeCount", "acknowledgedRangesReused",
    "retransmittedAcknowledgedBytes", "conflictCodes"
  ], [
    "recordSchemaVersions", "classifications", "resumeCount", "acknowledgedRangesReused",
    "conflictCodes"
  ], issues, "recovery");
  if (!isSafeCodeArray(value.recordSchemaVersions) || !isSafeCodeArray(value.conflictCodes)) {
    issues.push(structure("recovery"));
  }
  if (!Array.isArray(value.classifications) || value.classifications.length > MAX_CODES ||
    value.classifications.some((item) => !RESUME_CLASSIFICATIONS.has(item))) {
    issues.push(structure("recovery.classifications"));
  }
  for (const key of ["resumeCount", "acknowledgedRangesReused"] as const) {
    if (!isNonNegativeInteger(value[key])) issues.push(structure(`recovery.${key}`));
  }
  if (value.retransmittedAcknowledgedBytes !== undefined &&
    !isNonNegativeInteger(value.retransmittedAcknowledgedBytes)) {
    issues.push(structure("recovery.retransmittedAcknowledgedBytes"));
  }
}

function validateEntries(value: unknown, issues: ProvenanceIssue[]): void {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ENTRIES) {
    issues.push(structure("entries"));
    return;
  }
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    const path = `entries.${index}`;
    if (!isRecord(entry)) return void issues.push(structure(path));
    exactKeys(entry, ["entryId", "sequence", "occurredAt", "type", "evidenceSource", "code", "metrics"], [
      "entryId", "sequence", "occurredAt", "type", "evidenceSource"
    ], issues, path);
    if (!isSafeId(entry.entryId)) issues.push(structure(`${path}.entryId`));
    if (entry.entryId !== `entry-${index}` || entry.sequence !== index || ids.has(String(entry.entryId))) {
      issues.push(issue("provenance.ordering_invalid", path));
    }
    ids.add(String(entry.entryId));
    if (!isIsoDate(entry.occurredAt)) issues.push(structure(`${path}.occurredAt`));
    if (!ENTRY_TYPES.has(entry.type as ProvenanceEntryType)) issues.push(structure(`${path}.type`));
    if (!EVIDENCE_SOURCES.has(entry.evidenceSource as ProvenanceEvidenceSource)) {
      issues.push(structure(`${path}.evidenceSource`));
    }
    if (entry.code !== undefined && !isSafeCode(entry.code)) issues.push(disclosure(`${path}.code`));
    if (entry.metrics !== undefined) validateMetrics(entry.metrics, issues, `${path}.metrics`);
  });
}

function validateMetrics(value: unknown, issues: ProvenanceIssue[], path: string): void {
  if (!isRecord(value)) return void issues.push(structure(path));
  exactKeys(value, METRIC_KEYS, [], issues, path);
  for (const key of METRIC_KEYS) {
    if (value[key] !== undefined && !isNonNegativeInteger(value[key])) issues.push(structure(`${path}.${key}`));
  }
}

function validateVerification(value: unknown, issues: ProvenanceIssue[]): void {
  if (!isRecord(value)) return void issues.push(structure("verification"));
  exactKeys(value, [
    "status", "verifierCategory", "expectedEvidenceCategories", "observedEvidenceCategories",
    "verifiedAt", "issueCodes"
  ], [
    "status", "verifierCategory", "expectedEvidenceCategories", "observedEvidenceCategories",
    "verifiedAt", "issueCodes"
  ], issues, "verification");
  if (!VERIFICATION_STATUSES.has(value.status as ProvenanceVerificationStatus) ||
    !isSafeCode(value.verifierCategory) || !isIsoDate(value.verifiedAt) ||
    !isSafeCodeArray(value.expectedEvidenceCategories) ||
    !isSafeCodeArray(value.observedEvidenceCategories) || !isSafeCodeArray(value.issueCodes)) {
    issues.push(structure("verification"));
  }
}

function validateDerivatives(value: unknown, issues: ProvenanceIssue[]): void {
  if (!Array.isArray(value) || value.length > MAX_DERIVATIVES) {
    issues.push(structure("derivatives"));
    return;
  }
  const ids = new Set<string>();
  value.forEach((derivative, index) => {
    const path = `derivatives.${index}`;
    if (!isRecord(derivative)) return void issues.push(structure(path));
    exactKeys(derivative, [
      "id", "kind", "status", "sourceManifestId", "generator", "generatorVersion", "policyId",
      "checksum", "storageCategory"
    ], ["id", "kind", "status", "sourceManifestId"], issues, path);
    if (!isSafeId(derivative.id) || ids.has(String(derivative.id))) issues.push(relationship(`${path}.id`));
    ids.add(String(derivative.id));
    for (const key of ["kind", "status", "generator", "generatorVersion", "policyId", "storageCategory"] as const) {
      if (derivative[key] !== undefined && !isSafeId(derivative[key])) issues.push(disclosure(`${path}.${key}`));
    }
    if (!isSafeId(derivative.sourceManifestId)) issues.push(structure(`${path}.sourceManifestId`));
    if (derivative.checksum !== undefined) validateChecksum(derivative.checksum, issues, `${path}.checksum`);
  });
}

function validateAttestations(value: unknown, issues: ProvenanceIssue[]): void {
  if (!Array.isArray(value) || value.length > MAX_ATTESTATIONS) {
    issues.push(structure("attestations"));
    return;
  }
  const ids = new Set<string>();
  value.forEach((attestation, index) => {
    const path = `attestations.${index}`;
    if (!isRecord(attestation)) return void issues.push(structure(path));
    exactKeys(attestation, ["id", "type", "digest", "referenceId"], ["id", "type", "digest"], issues, path);
    if (!isSafeId(attestation.id) || ids.has(String(attestation.id)) || !isSafeId(attestation.type)) {
      issues.push(structure(path));
    }
    ids.add(String(attestation.id));
    if (attestation.referenceId !== undefined && !isSafeId(attestation.referenceId)) {
      issues.push(disclosure(`${path}.referenceId`));
    }
    validateChecksum(attestation.digest, issues, `${path}.digest`);
  });
}

function validateArtifactAnnotations(
  value: unknown,
  profile: unknown,
  issues: ProvenanceIssue[]
): void {
  if (value === undefined) return;
  if (profile !== "authorized-full" || !isRecord(value) || Object.keys(value).length > MAX_ANNOTATIONS) {
    issues.push(disclosure("annotations"));
    return;
  }
  for (const [key, annotation] of Object.entries(value)) {
    if (!isSafeId(key) || !isSafeAnnotation(annotation)) issues.push(disclosure("annotations"));
  }
}

function validateIntegrity(value: unknown, issues: ProvenanceIssue[]): void {
  if (!isRecord(value)) return void issues.push(structure("integrity"));
  exactKeys(value, ["algorithm", "canonicalization", "value"], ["algorithm", "canonicalization", "value"], issues, "integrity");
  if (value.algorithm !== INGEST_PROVENANCE_INTEGRITY_ALGORITHM ||
    value.canonicalization !== INGEST_PROVENANCE_CANONICALIZATION ||
    typeof value.value !== "string" || !SHA256.test(value.value)) {
    issues.push(structure("integrity"));
  }
}

function validateChecksum(value: unknown, issues: ProvenanceIssue[], path: string): void {
  if (!isRecord(value)) return void issues.push(structure(path));
  exactKeys(value, ["algorithm", "value"], ["algorithm", "value"], issues, path);
  if (value.algorithm !== "sha256" || typeof value.value !== "string" || !SHA256.test(value.value)) {
    issues.push(structure(path));
  }
}

function validateEntryRelationships(
  artifact: IngestProvenanceArtifactV1,
  issues: ProvenanceIssue[]
): void {
  if (artifact.entries[0]?.type !== "preparation" || artifact.entries[1]?.type !== "validation") {
    issues.push(issue("provenance.ordering_invalid", "entries"));
  }
  for (const derivative of artifact.derivatives) {
    if (derivative.sourceManifestId !== artifact.manifest.id) {
      issues.push(relationship("derivatives.sourceManifestId"));
    }
  }
  if (artifact.verification) {
    const completionIndex = artifact.entries.findIndex(({ type }) => type === "completion");
    const verificationIndex = artifact.entries.findIndex(({ type }) => type === "verification");
    if (completionIndex < 0 || verificationIndex <= completionIndex) {
      issues.push(issue("provenance.ordering_invalid", "verification"));
    }
  }
}

function validateTerminalRelationships(
  artifact: IngestProvenanceArtifactV1,
  issues: ProvenanceIssue[]
): void {
  const types = artifact.entries.map(({ type }) => type);
  const completed = types.includes("completion");
  const canceled = types.includes("cancellation");
  const failed = types.includes("failure");
  if ([completed, canceled, failed].filter(Boolean).length > 1) {
    issues.push(relationship("terminalStatus"));
    return;
  }
  let expected: ProvenanceTerminalStatus = "active";
  if (failed) expected = "upload_failed";
  else if (canceled) expected = "canceled";
  else if (completed) {
    expected = artifact.verification?.status === "verified"
      ? "completed"
      : artifact.verification?.status === "failed"
        ? "verification_failed"
        : "completed_unverified";
  }
  if (expected !== artifact.terminalStatus) issues.push(relationship("terminalStatus"));
}

function validateExpectedRelationships(
  artifact: IngestProvenanceArtifactV1,
  options: ValidateIngestProvenanceOptions,
  issues: ProvenanceIssue[]
): void {
  if (options.policy && (options.policy.id !== artifact.policy.id || options.policy.version !== artifact.policy.version)) {
    issues.push(issue("provenance.identity_mismatch", "policy"));
  }
  const manifest = options.manifest;
  if (!manifest) return;
  if (manifest.id !== artifact.manifest.id || manifest.schemaVersion !== artifact.manifest.schemaVersion) {
    issues.push(issue("provenance.identity_mismatch", "manifest.id"));
  }
  if (manifest.original.sizeBytes !== artifact.manifest.sizeBytes) {
    issues.push(issue("provenance.identity_mismatch", "manifest.sizeBytes"));
  }
  const checksum = manifest.original.checksum;
  if (checksum) {
    if (!artifact.manifest.checksum || checksum.algorithm !== artifact.manifest.checksum.algorithm ||
      checksum.value.toLowerCase() !== artifact.manifest.checksum.value) {
      issues.push(issue("provenance.identity_mismatch", "manifest.checksum"));
    }
  } else if (artifact.manifest.checksum) {
    issues.push(issue("provenance.identity_mismatch", "manifest.checksum"));
  }
  for (const reference of artifact.derivatives) {
    const derivative = manifest.derivatives.find(({ id }) => id === reference.id);
    if (!derivative || derivative.status !== reference.status || derivative.kind !== reference.kind ||
      derivative.sourceIdentity?.manifestId !== reference.sourceManifestId) {
      issues.push(relationship("derivatives"));
      break;
    }
  }
}

async function evaluateActorTrust(
  artifact: IngestProvenanceArtifactV1,
  options: ValidateIngestProvenanceOptions,
  issues: ProvenanceIssue[]
): Promise<ProvenanceActorTrust> {
  if (artifact.attestations.length === 0) return "unsigned";
  if (!options.verifyAttestation) return "not_evaluated";
  for (const attestation of artifact.attestations) {
    try {
      const result = await options.verifyAttestation(cloneAttestation(attestation));
      if (!result || result.valid !== true) {
        issues.push(issue("provenance.attestation_invalid", "attestations"));
        return "attestation_invalid";
      }
    } catch {
      issues.push(issue("provenance.attestation_invalid", "attestations"));
      return "attestation_invalid";
    }
  }
  return "externally_attested";
}

function manifestReference(manifest: IngestManifest): ProvenanceManifestReference {
  const checksum = manifest.original.checksum;
  return {
    id: manifest.id,
    schemaVersion: manifest.schemaVersion,
    sizeBytes: manifest.original.sizeBytes,
    sourceEvidence: checksum ? "whole-file-sha256" : "none",
    ...(checksum ? { checksum: { algorithm: "sha256" as const, value: checksum.value.toLowerCase() } } : {})
  };
}

function policyFromManifest(
  policy: { id: string; version: string },
  manifest: IngestManifest
): ProvenancePolicyEvaluation {
  const failedRuleCodes = unique(manifest.validation.issues
    .filter(({ severity }) => severity === "error")
    .map(({ code }) => code));
  const warningRuleCodes = unique(manifest.validation.issues
    .filter(({ severity }) => severity === "warning")
    .map(({ code }) => code));
  return {
    id: policy.id,
    version: policy.version,
    result: !manifest.validation.ok
      ? "failed"
      : warningRuleCodes.length > 0 ? "passed_with_warnings" : "passed",
    failedRuleCodes,
    warningRuleCodes,
    failedRuleCount: failedRuleCodes.length,
    warningRuleCount: warningRuleCodes.length
  };
}

function createPolicyEvaluation(input: RecordProvenancePolicyInput): ProvenancePolicyEvaluation {
  assertSafeId(input.id, "policy.id");
  assertSafeId(input.version, "policy.version");
  if (!POLICY_RESULTS.has(input.result)) throw inputError("policy.result");
  const failedRuleCodes = validateSafeCodes(input.failedRuleCodes ?? [], "policy.failedRuleCodes");
  const warningRuleCodes = validateSafeCodes(input.warningRuleCodes ?? [], "policy.warningRuleCodes");
  return {
    id: input.id,
    version: input.version,
    result: input.result,
    failedRuleCodes,
    warningRuleCodes,
    failedRuleCount: failedRuleCodes.length,
    warningRuleCount: warningRuleCodes.length
  };
}

function derivativeReference(
  derivative: DerivativeManifest,
  manifestId: string,
  policyId?: string
): ProvenanceDerivativeReference {
  assertSafeId(derivative.id, "derivative.id");
  assertSafeId(derivative.kind, "derivative.kind");
  assertSafeId(derivative.status, "derivative.status");
  if (derivative.sourceIdentity?.manifestId !== manifestId) throw inputError("derivative.sourceManifestId");
  if (policyId !== undefined) assertSafeId(policyId, "derivative.policyId");
  const generator = derivative.provenance?.generator;
  const generatorVersion = derivative.provenance?.generatorVersion;
  const storageCategory = derivative.storage?.kind;
  if (generator !== undefined) assertSafeId(generator, "derivative.generator");
  if (generatorVersion !== undefined) assertSafeId(generatorVersion, "derivative.generatorVersion");
  if (storageCategory !== undefined) assertSafeId(storageCategory, "derivative.storageCategory");
  const checksum = derivative.checksum;
  if (checksum && (checksum.algorithm !== "sha256" || !SHA256.test(checksum.value.toLowerCase()))) {
    throw inputError("derivative.checksum");
  }
  return {
    id: derivative.id,
    kind: derivative.kind,
    status: derivative.status,
    sourceManifestId: manifestId,
    ...(generator ? { generator } : {}),
    ...(generatorVersion ? { generatorVersion } : {}),
    ...(policyId ? { policyId } : {}),
    ...(checksum ? { checksum: { algorithm: "sha256", value: checksum.value.toLowerCase() } } : {}),
    ...(storageCategory ? { storageCategory } : {})
  };
}

function summarizeCapabilities(
  capabilities?: TransportCapabilities
): ProvenanceTransportCapabilitySummary {
  return {
    resumable: capabilities?.resumable === true,
    snapshotResume: capabilities?.supportsSnapshotResume === true,
    persistentResume: capabilities?.supportsPersistentResume === true,
    abortable: capabilities?.abortable === true,
    expirationAware: capabilities?.expires === true,
    parallelChunks: capabilities?.supportsParallelChunks === true,
    chunkIntegrity: capabilities?.supportsChunkChecksum === true
  };
}

function normalizeMetrics(metrics?: ProvenanceEntryMetrics): ProvenanceEntryMetrics | undefined {
  if (!metrics) return undefined;
  const normalized: ProvenanceEntryMetrics = {};
  for (const key of METRIC_KEYS) {
    const value = metrics[key];
    if (value !== undefined) {
      assertNonNegativeInteger(value, `entry.metrics.${key}`);
      normalized[key] = value;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function validateAnnotations(
  annotations: Readonly<Record<string, string>> | undefined,
  profile: ProvenanceDisclosureProfile
): Readonly<Record<string, string>> | undefined {
  if (annotations === undefined) return undefined;
  if (profile !== "authorized-full" || Object.keys(annotations).length > MAX_ANNOTATIONS) {
    throw inputError("annotations");
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(annotations)) {
    if (!isSafeId(key) || !isSafeAnnotation(value)) throw inputError("annotations");
    result[key] = value;
  }
  return result;
}

function validateAttestationInput(attestation: ProvenanceExternalAttestation): void {
  assertSafeId(attestation.id, "attestation.id");
  assertSafeId(attestation.type, "attestation.type");
  if (attestation.referenceId !== undefined) assertSafeId(attestation.referenceId, "attestation.referenceId");
  if (attestation.digest.algorithm !== "sha256" || !SHA256.test(attestation.digest.value.toLowerCase())) {
    throw inputError("attestation.digest");
  }
}

function assertManifestReferenceInput(manifest: IngestManifest): void {
  if (!manifest || manifest.schemaVersion !== "large-image-ingest.manifest.v1" ||
    !isSafeId(manifest.id) || !isIsoDate(manifest.createdAt) ||
    !isNonNegativeInteger(manifest.original?.sizeBytes)) {
    throw inputError("manifest");
  }
  const checksum = manifest.original.checksum;
  if (checksum && (checksum.algorithm !== "sha256" || !SHA256.test(checksum.value.toLowerCase()))) {
    throw inputError("manifest.checksum");
  }
}

function validateSafeCodes(values: readonly string[], path: string): string[] {
  if (!isSafeCodeArray(values)) throw inputError(path);
  return [...values];
}

function isSafeCodeArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_CODES &&
    value.every(isSafeCode) && new Set(value).size === value.length;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  issues: ProvenanceIssue[],
  path: string
): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) {
    issues.push(issue("provenance.disclosure_invalid", path));
  }
  if (required.some((key) => !(key in value))) issues.push(structure(path));
}

function samePolicyEvaluation(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return ["id", "version", "result", "failedRuleCount", "warningRuleCount"].every(
    (key) => left[key] === right[key]
  ) && JSON.stringify(left.failedRuleCodes) === JSON.stringify(right.failedRuleCodes) &&
    JSON.stringify(left.warningRuleCodes) === JSON.stringify(right.warningRuleCodes);
}

function withoutIntegrity(
  artifact: IngestProvenanceArtifactV1
): Omit<IngestProvenanceArtifactV1, "integrity"> {
  const clone = cloneArtifact(artifact) as IngestProvenanceArtifactV1;
  const { integrity: _integrity, ...body } = clone;
  return body;
}

function cloneArtifact(artifact: IngestProvenanceArtifactV1): IngestProvenanceArtifactV1 {
  return {
    schemaVersion: artifact.schemaVersion,
    id: artifact.id,
    correlationId: artifact.correlationId,
    createdAt: artifact.createdAt,
    library: { ...artifact.library },
    disclosureProfile: artifact.disclosureProfile,
    manifest: {
      ...artifact.manifest,
      ...(artifact.manifest.checksum ? { checksum: { ...artifact.manifest.checksum } } : {})
    },
    policy: {
      ...clonePolicy(artifact.policy),
      history: artifact.policy.history.map(clonePolicy)
    },
    transport: cloneTransport(artifact.transport),
    recovery: cloneRecovery(artifact.recovery),
    entries: artifact.entries.map(cloneEntry),
    ...(artifact.verification ? { verification: cloneVerification(artifact.verification) } : {}),
    derivatives: artifact.derivatives.map(cloneDerivativeReference),
    attestations: artifact.attestations.map(cloneAttestation),
    terminalStatus: artifact.terminalStatus,
    ...(artifact.annotations ? { annotations: { ...artifact.annotations } } : {}),
    integrity: { ...artifact.integrity }
  };
}

function clonePolicy(policy: ProvenancePolicyEvaluation): ProvenancePolicyEvaluation {
  return {
    id: policy.id,
    version: policy.version,
    result: policy.result,
    failedRuleCodes: [...policy.failedRuleCodes],
    warningRuleCodes: [...policy.warningRuleCodes],
    failedRuleCount: policy.failedRuleCount,
    warningRuleCount: policy.warningRuleCount
  };
}

function cloneTransport(transport: ProvenanceTransportSummary): ProvenanceTransportSummary {
  return {
    category: transport.category,
    capabilities: { ...transport.capabilities },
    receiptEvidenceCount: transport.receiptEvidenceCount,
    offsetEvidenceCount: transport.offsetEvidenceCount
  };
}

function cloneRecovery(recovery: ProvenanceRecoverySummary): ProvenanceRecoverySummary {
  return {
    recordSchemaVersions: [...recovery.recordSchemaVersions],
    classifications: [...recovery.classifications],
    resumeCount: recovery.resumeCount,
    acknowledgedRangesReused: recovery.acknowledgedRangesReused,
    ...(recovery.retransmittedAcknowledgedBytes !== undefined
      ? { retransmittedAcknowledgedBytes: recovery.retransmittedAcknowledgedBytes }
      : {}),
    conflictCodes: [...recovery.conflictCodes]
  };
}

function cloneEntry(entry: ProvenanceEntry): ProvenanceEntry {
  return {
    ...entry,
    ...(entry.metrics ? { metrics: { ...entry.metrics } } : {})
  };
}

function cloneVerification(value: ProvenanceVerificationEvidence): ProvenanceVerificationEvidence {
  return {
    ...value,
    expectedEvidenceCategories: [...value.expectedEvidenceCategories],
    observedEvidenceCategories: [...value.observedEvidenceCategories],
    issueCodes: [...value.issueCodes]
  };
}

function cloneDerivativeReference(value: ProvenanceDerivativeReference): ProvenanceDerivativeReference {
  return {
    ...value,
    ...(value.checksum ? { checksum: { ...value.checksum } } : {})
  };
}

function cloneAttestation(value: ProvenanceExternalAttestation): ProvenanceExternalAttestation {
  return { ...value, digest: { ...value.digest } };
}

function notifyPersistenceOutcome(
  callback: PersistIngestProvenanceOptions["onOutcome"],
  result: ProvenancePersistenceResult
): void {
  if (!callback) return;
  try {
    callback(result);
  } catch {
    // Persistence reporting remains isolated from artifact and upload authority.
  }
}

function safeErrorCode(error: unknown): string | undefined {
  if (!isRecord(error) || typeof error.code !== "string" || !isSafeCode(error.code)) return undefined;
  return error.code;
}

function inputError(path: string): IngestProvenanceError {
  return new IngestProvenanceError("provenance.input_invalid", [
    issue("provenance.input_invalid", safePath(path))
  ]);
}

function assertSafeId(value: unknown, path: string): asserts value is string {
  if (!isSafeId(value)) throw inputError(path);
}

function assertSafeCode(value: unknown, path: string): asserts value is string {
  if (!isSafeCode(value)) throw inputError(path);
}

function assertIsoDate(value: unknown, path: string): asserts value is string {
  if (!isIsoDate(value)) throw inputError(path);
}

function assertNonNegativeInteger(value: unknown, path: string): asserts value is number {
  if (!isNonNegativeInteger(value)) throw inputError(path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function isSafeCode(value: unknown): value is string {
  return typeof value === "string" && SAFE_CODE.test(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isSafeAnnotation(value: unknown): value is string {
  return typeof value === "string" && value.length <= 256 &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !/https?:\/\/|authorization|credential\s*=|token\s*=|password\s*=|^\/|^[a-z]:\\|\.\.[\\/]/i.test(value);
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function issue(code: ProvenanceIssueCode, path?: string): ProvenanceIssue {
  return { code, ...(path ? { path: safePath(path) } : {}) };
}

function structure(path: string): ProvenanceIssue {
  return issue("provenance.structure_invalid", path);
}

function disclosure(path: string): ProvenanceIssue {
  return issue("provenance.disclosure_invalid", path);
}

function relationship(path: string): ProvenanceIssue {
  return issue("provenance.relationship_mismatch", path);
}

function safePath(path: string): string {
  const normalized = path.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 128);
  return /^[a-z0-9]/.test(normalized) ? normalized : "artifact";
}

function dedupeIssues(issues: readonly ProvenanceIssue[]): ProvenanceIssue[] {
  const seen = new Set<string>();
  return issues.filter((current) => {
    const key = JSON.stringify(current);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function createId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ? `${prefix}-${random}` : `${prefix}-${Date.now().toString(36)}`;
}

function safeProvenanceMessage(code: ProvenanceIssueCode): string {
  switch (code) {
    case "provenance.persistence_failed": return "Ingest provenance persistence failed.";
    case "provenance.artifact_invalid": return "Ingest provenance artifact is invalid.";
    default: return "Ingest provenance input is invalid.";
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
