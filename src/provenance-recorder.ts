// Part of provenance.ts, split out to keep modules under 500 lines; public exports stay on provenance.ts.
import { PACKAGE_NAME, PACKAGE_VERSION } from "./package-version.js";
import type { IngestEvent, IngestManifest, ResumeCompatibilityStatus } from "./types.js";
import { INGEST_PROVENANCE_SCHEMA_VERSION, IngestProvenanceError } from "./provenance.js";
import type { CreateIngestProvenanceRecorderOptions, IngestProvenanceArtifactV1, IngestProvenanceRecorder, IngestProvenanceValidationResult, ProvenanceDerivativeReference, ProvenanceDisclosureProfile, ProvenanceEntry, ProvenanceEntryMetrics, ProvenanceEntryType, ProvenanceEvidenceSource, ProvenanceExternalAttestation, ProvenancePolicyEvaluation, ProvenanceTerminalStatus, ProvenanceTransportSummary, ProvenanceVerificationEvidence, RecordProvenanceAttestationInput, RecordProvenanceDerivativeInput, RecordProvenanceEntryInput, RecordProvenancePolicyInput, RecordProvenanceRecoveryInput, RecordProvenanceTransportEvidenceInput, RecordProvenanceVerificationInput, SafeProvenanceSummary, ValidateIngestProvenanceOptions } from "./provenance.js";
import { createIntegrity, validateArtifactShape, validateEntryRelationships } from "./provenance-persistence.js";
import { assertIsoDate, assertManifestReferenceInput, assertNonNegativeInteger, assertSafeCode, assertSafeId, cloneArtifact, cloneAttestation, cloneDerivativeReference, cloneEntry, clonePolicy, cloneRecovery, cloneTransport, cloneVerification, createPolicyEvaluation, derivativeReference, evaluateActorTrust, inputError, isRecord, manifestReference, normalizeMetrics, policyFromManifest, safeErrorCode, summarizeCapabilities, validateAnnotations, validateAttestationInput, validateExpectedRelationships, validateSafeCodes, validateTerminalRelationships, withoutIntegrity } from "./provenance-checks.js";
import { constantTimeEqual, createId, dedupeIssues, deepFreeze, issue } from "./provenance-utils.js";
import { MAX_ATTESTATIONS, MAX_CODES, MAX_ENTRIES, RESUME_CLASSIFICATIONS, VERIFICATION_STATUSES } from "./provenance-shared.js";

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

/** @experimental */
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

/** @experimental */
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

/** @experimental */
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

/** @experimental */
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
