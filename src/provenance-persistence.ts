// Part of provenance.ts, split out to keep modules under 500 lines; public exports stay on provenance.ts.
import { calculateChecksum } from "./checksum.js";
import { PACKAGE_NAME } from "./package-version.js";
import type { IngestFileLike } from "./types.js";
import { INGEST_PROVENANCE_CANONICALIZATION, INGEST_PROVENANCE_INTEGRITY_ALGORITHM, INGEST_PROVENANCE_SCHEMA_VERSION } from "./provenance.js";
import type { IngestProvenanceArtifactV1, IngestProvenanceIntegrity, PersistIngestProvenanceOptions, ProvenanceEntryType, ProvenanceEvidenceSource, ProvenanceIssue, ProvenancePersistenceResult, ProvenancePolicyResult, ProvenanceSink, ProvenanceTerminalStatus, ProvenanceVerificationStatus } from "./provenance.js";
import { validateIngestProvenance } from "./provenance-recorder.js";
import { cloneArtifact, exactKeys, inputError, isRecord, isSafeCode, isSafeCodeArray, isSafeId, notifyPersistenceOutcome, samePolicyEvaluation } from "./provenance-checks.js";
import { compareUtf16, dedupeIssues, disclosure, hasLoneSurrogate, isIsoDate, isNonNegativeInteger, isSafeAnnotation, issue, relationship, structure } from "./provenance-utils.js";
import { ENTRY_TYPES, EVIDENCE_SOURCES, MAX_ANNOTATIONS, MAX_ATTESTATIONS, MAX_CODES, MAX_DERIVATIVES, MAX_ENTRIES, METRIC_KEYS, POLICY_RESULTS, RESUME_CLASSIFICATIONS, SEMVER, SHA256, TERMINAL_STATUSES, VERIFICATION_STATUSES } from "./provenance-shared.js";

/** @experimental */
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

/** @experimental */
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

export async function createIntegrity(
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

export function validateArtifactShape(value: unknown): ProvenanceIssue[] {
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

export function validateEntryRelationships(
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
