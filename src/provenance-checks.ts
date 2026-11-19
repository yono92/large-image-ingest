// Part of provenance.ts, split out to keep modules under 500 lines; public exports stay on provenance.ts.
import type { DerivativeManifest, IngestManifest, TransportCapabilities } from "./types.js";
import { IngestProvenanceError } from "./provenance.js";
import type { IngestProvenanceArtifactV1, PersistIngestProvenanceOptions, ProvenanceActorTrust, ProvenanceDerivativeReference, ProvenanceDisclosureProfile, ProvenanceEntry, ProvenanceEntryMetrics, ProvenanceExternalAttestation, ProvenanceIssue, ProvenanceManifestReference, ProvenancePersistenceResult, ProvenancePolicyEvaluation, ProvenanceRecoverySummary, ProvenanceTerminalStatus, ProvenanceTransportCapabilitySummary, ProvenanceTransportSummary, ProvenanceVerificationEvidence, RecordProvenancePolicyInput, ValidateIngestProvenanceOptions } from "./provenance.js";
import { isIsoDate, isNonNegativeInteger, isSafeAnnotation, issue, relationship, safePath, structure, unique } from "./provenance-utils.js";
import { MAX_ANNOTATIONS, MAX_CODES, METRIC_KEYS, POLICY_RESULTS, SAFE_CODE, SAFE_ID, SHA256 } from "./provenance-shared.js";

export function validateTerminalRelationships(
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

export function validateExpectedRelationships(
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

export async function evaluateActorTrust(
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

export function manifestReference(manifest: IngestManifest): ProvenanceManifestReference {
  const checksum = manifest.original.checksum;
  return {
    id: manifest.id,
    schemaVersion: manifest.schemaVersion,
    sizeBytes: manifest.original.sizeBytes,
    sourceEvidence: checksum ? "whole-file-sha256" : "none",
    ...(checksum ? { checksum: { algorithm: "sha256" as const, value: checksum.value.toLowerCase() } } : {})
  };
}

export function policyFromManifest(
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

export function createPolicyEvaluation(input: RecordProvenancePolicyInput): ProvenancePolicyEvaluation {
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

export function derivativeReference(
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

export function summarizeCapabilities(
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

export function normalizeMetrics(metrics?: ProvenanceEntryMetrics): ProvenanceEntryMetrics | undefined {
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

export function validateAnnotations(
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

export function validateAttestationInput(attestation: ProvenanceExternalAttestation): void {
  assertSafeId(attestation.id, "attestation.id");
  assertSafeId(attestation.type, "attestation.type");
  if (attestation.referenceId !== undefined) assertSafeId(attestation.referenceId, "attestation.referenceId");
  if (attestation.digest.algorithm !== "sha256" || !SHA256.test(attestation.digest.value.toLowerCase())) {
    throw inputError("attestation.digest");
  }
}

export function assertManifestReferenceInput(manifest: IngestManifest): void {
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

export function validateSafeCodes(values: readonly string[], path: string): string[] {
  if (!isSafeCodeArray(values)) throw inputError(path);
  return [...values];
}

export function isSafeCodeArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_CODES &&
    value.every(isSafeCode) && new Set(value).size === value.length;
}

export function exactKeys(
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

export function samePolicyEvaluation(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return ["id", "version", "result", "failedRuleCount", "warningRuleCount"].every(
    (key) => left[key] === right[key]
  ) && JSON.stringify(left.failedRuleCodes) === JSON.stringify(right.failedRuleCodes) &&
    JSON.stringify(left.warningRuleCodes) === JSON.stringify(right.warningRuleCodes);
}

export function withoutIntegrity(
  artifact: IngestProvenanceArtifactV1
): Omit<IngestProvenanceArtifactV1, "integrity"> {
  const clone = cloneArtifact(artifact) as IngestProvenanceArtifactV1;
  const { integrity: _integrity, ...body } = clone;
  return body;
}

export function cloneArtifact(artifact: IngestProvenanceArtifactV1): IngestProvenanceArtifactV1 {
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

export function clonePolicy(policy: ProvenancePolicyEvaluation): ProvenancePolicyEvaluation {
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

export function cloneTransport(transport: ProvenanceTransportSummary): ProvenanceTransportSummary {
  return {
    category: transport.category,
    capabilities: { ...transport.capabilities },
    receiptEvidenceCount: transport.receiptEvidenceCount,
    offsetEvidenceCount: transport.offsetEvidenceCount
  };
}

export function cloneRecovery(recovery: ProvenanceRecoverySummary): ProvenanceRecoverySummary {
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

export function cloneEntry(entry: ProvenanceEntry): ProvenanceEntry {
  return {
    ...entry,
    ...(entry.metrics ? { metrics: { ...entry.metrics } } : {})
  };
}

export function cloneVerification(value: ProvenanceVerificationEvidence): ProvenanceVerificationEvidence {
  return {
    ...value,
    expectedEvidenceCategories: [...value.expectedEvidenceCategories],
    observedEvidenceCategories: [...value.observedEvidenceCategories],
    issueCodes: [...value.issueCodes]
  };
}

export function cloneDerivativeReference(value: ProvenanceDerivativeReference): ProvenanceDerivativeReference {
  return {
    ...value,
    ...(value.checksum ? { checksum: { ...value.checksum } } : {})
  };
}

export function cloneAttestation(value: ProvenanceExternalAttestation): ProvenanceExternalAttestation {
  return { ...value, digest: { ...value.digest } };
}

export function notifyPersistenceOutcome(
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

export function safeErrorCode(error: unknown): string | undefined {
  if (!isRecord(error) || typeof error.code !== "string" || !isSafeCode(error.code)) return undefined;
  return error.code;
}

export function inputError(path: string): IngestProvenanceError {
  return new IngestProvenanceError("provenance.input_invalid", [
    issue("provenance.input_invalid", safePath(path))
  ]);
}

export function assertSafeId(value: unknown, path: string): asserts value is string {
  if (!isSafeId(value)) throw inputError(path);
}

export function assertSafeCode(value: unknown, path: string): asserts value is string {
  if (!isSafeCode(value)) throw inputError(path);
}

export function assertIsoDate(value: unknown, path: string): asserts value is string {
  if (!isIsoDate(value)) throw inputError(path);
}

export function assertNonNegativeInteger(value: unknown, path: string): asserts value is number {
  if (!isNonNegativeInteger(value)) throw inputError(path);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

export function isSafeCode(value: unknown): value is string {
  return typeof value === "string" && SAFE_CODE.test(value);
}
