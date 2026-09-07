import { canonicalizeProvenanceJson } from "./provenance.js";
import { validateDomainProfileReference } from "./profiles.js";
import type {
  CreateIngestEvidenceBundleInput,
  EvidenceBundleDisclosureProfile,
  IngestEvidenceBundleV1,
  IngestEvidenceBundleValidationResult,
  SafeWorkflowSummary,
  ValidateIngestEvidenceBundleOptions,
  VerifiedIngestWorkflowState,
  WorkflowIssueCode
} from "./workflow-types.js";
import { INGEST_EVIDENCE_BUNDLE_SCHEMA_VERSION } from "./workflow-types.js";

const TOP_LEVEL_KEYS = [
  "schemaVersion", "id", "revision", "workflowId", "correlationId", "createdAt",
  "library", "subject", "policy", "transfer", "verification", "provenance",
  "preservation", "stages", "terminal", "trust", "integrity"
] as const;
const SHA256 = /^[a-f0-9]{64}$/;
const WORKFLOW_STATUSES = new Set([
  "preparing", "prepared", "uploading", "paused", "uploaded_unverified", "verifying",
  "verified", "persisting_evidence", "evidence_persisted", "preserving",
  "finalizing_evidence", "preserved", "preparation_failed", "upload_failed",
  "verification_failed", "evidence_persistence_failed", "preservation_failed",
  "evidence_finalization_failed", "reconciliation_required", "canceled", "stopped"
]);
const STABLE_WORKFLOW_STATUSES = new Set([
  "prepared", "uploaded_unverified", "verified", "evidence_persisted", "preserved"
]);
const STAGE_ORDER = [
  "preparation", "upload", "upload_completion", "verification", "evidence_persistence",
  "preservation", "evidence_finalization"
] as const;

export async function createIngestEvidenceBundle(
  input: CreateIngestEvidenceBundleInput
): Promise<IngestEvidenceBundleV1> {
  const checksum = input.manifest.original.checksum;
  if (!checksum || checksum.algorithm !== "sha256" || checksum.scope !== "whole-file") {
    throw new TypeError("A whole-file SHA-256 manifest checksum is required.");
  }

  const body = {
    schemaVersion: INGEST_EVIDENCE_BUNDLE_SCHEMA_VERSION,
    id: input.id,
    revision: input.revision,
    workflowId: input.workflowId,
    correlationId: input.provenance.correlationId,
    createdAt: input.createdAt,
    library: structuredClone(input.manifest.library),
    subject: {
      manifest: {
        id: input.manifest.id,
        schemaVersion: input.manifest.schemaVersion
      },
      sourceIdentity: {
        algorithm: "sha256" as const,
        scope: "whole-file" as const,
        sizeBytes: input.manifest.original.sizeBytes,
        value: checksum.value
      }
    },
    policy: {
      profile: structuredClone(input.profileEvaluation.profile),
      result: input.profileEvaluation.result as "passed" | "passed_with_warnings",
      failedRuleCodes: [...input.profileEvaluation.failedRuleCodes],
      warningRuleCodes: [...input.profileEvaluation.warningRuleCodes]
    },
    transfer: {
      status: "completed" as const,
      transportCategory: input.transportCategory,
      completionEvidence: "transport_and_session" as const,
      completedAt: completionTime(input.provenance)
    },
    verification: {
      status: "verified" as const,
      verifierCategory: input.verifierCategory,
      expectedEvidenceCategories: [...input.verification.expectedEvidenceCategories],
      observedEvidenceCategories: [...input.verification.observedEvidenceCategories],
      issueCodes: [] as const,
      verifiedAt: input.verification.checkedAt
    },
    provenance: {
      id: input.provenance.id,
      schemaVersion: input.provenance.schemaVersion,
      integrity: {
        algorithm: "sha256" as const,
        value: input.provenance.integrity.value
      },
      persistence: {
        status: "persisted" as const,
        operationId: input.evidenceOperationId
      }
    },
    preservation: structuredClone(input.preservation),
    stages: structuredClone(input.stages),
    terminal: structuredClone(input.terminal),
    trust: {
      integrity: "self_hashed" as const,
      actorTrust: provenanceTrust(input.provenance.attestations.length),
      timeTrust: input.provenance.attestations.length > 0
        ? "externally_attested" as const
        : "untrusted" as const
    }
  };
  const value = await sha256Canonical(body);
  return deepFreeze({
    ...body,
    integrity: {
      algorithm: "sha256",
      canonicalization: "rfc8785-jcs",
      value
    }
  });
}

export async function validateIngestEvidenceBundle(
  value: unknown,
  options: ValidateIngestEvidenceBundleOptions = {}
): Promise<IngestEvidenceBundleValidationResult> {
  const issues: WorkflowIssueCode[] = [];
  if (!isRecord(value) || !hasExactKeys(value, TOP_LEVEL_KEYS)) {
    return invalid(["workflow.evidence_bundle_invalid"]);
  }
  if (value.schemaVersion !== INGEST_EVIDENCE_BUNDLE_SCHEMA_VERSION) {
    return invalid(["workflow.evidence_bundle_version_unsupported"]);
  }
  if (!safeId(value.id) || !safeId(value.workflowId) || !safeId(value.correlationId) ||
      !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 ||
      typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt)) ||
      !isRecord(value.integrity) || value.integrity.algorithm !== "sha256" ||
      value.integrity.canonicalization !== "rfc8785-jcs" ||
      typeof value.integrity.value !== "string" || !SHA256.test(value.integrity.value)) {
    issues.push("workflow.evidence_bundle_invalid");
  }
  const expectedIntegrity = issues.length === 0
    ? await sha256Canonical(withoutIntegrity(value))
    : undefined;
  if (!isRecord(value.integrity) || expectedIntegrity !== value.integrity.value) {
    issues.push("workflow.evidence_bundle_integrity_invalid");
  }
  if (!validLibrary(value.library) || !validPolicy(value.policy) ||
      !validTransfer(value.transfer) || !validVerification(value.verification) ||
      !validProvenance(value.provenance) || !validTrust(value.trust)) {
    issues.push("workflow.evidence_bundle_invalid");
  }
  if (!isRecord(value.subject) || !isRecord(value.subject.manifest) ||
      !hasExactKeys(value.subject, ["manifest", "sourceIdentity"]) ||
      !hasExactKeys(value.subject.manifest, ["id", "schemaVersion"]) ||
      !safeId(value.subject.manifest.id) ||
      value.subject.manifest.schemaVersion !== "large-image-ingest.manifest.v1" ||
      !isRecord(value.subject.sourceIdentity) ||
      !hasExactKeys(value.subject.sourceIdentity, ["algorithm", "scope", "sizeBytes", "value"]) ||
      value.subject.sourceIdentity.algorithm !== "sha256" ||
      value.subject.sourceIdentity.scope !== "whole-file" ||
      !Number.isSafeInteger(value.subject.sourceIdentity.sizeBytes) ||
      Number(value.subject.sourceIdentity.sizeBytes) < 0 ||
      typeof value.subject.sourceIdentity.value !== "string" ||
      !SHA256.test(value.subject.sourceIdentity.value)) {
    issues.push("workflow.source_identity_missing");
  }
  if (!validStages(value.stages) || !validTerminal(value.terminal) ||
      !validPreservation(value.preservation) ||
      !bundleStateRelationships(value)) {
    issues.push("workflow.evidence_bundle_invalid");
  }
  if (options.manifest && (!isRecord(value.subject) || !isRecord(value.subject.manifest) ||
      value.subject.manifest.id !== options.manifest.id ||
      !isRecord(value.subject.sourceIdentity) ||
      value.subject.sourceIdentity.value !== options.manifest.original.checksum?.value ||
      value.subject.sourceIdentity.sizeBytes !== options.manifest.original.sizeBytes)) {
    issues.push("workflow.source_mismatch");
  }
  if (options.provenance && (!isRecord(value.provenance) ||
      value.provenance.id !== options.provenance.id ||
      !isRecord(value.provenance.integrity) ||
      value.provenance.integrity.value !== options.provenance.integrity.value ||
      !isRecord(value.trust) ||
      value.trust.actorTrust !== provenanceTrust(options.provenance.attestations.length) ||
      value.trust.timeTrust !== (options.provenance.attestations.length > 0
        ? "externally_attested"
        : "untrusted"))) {
    issues.push("workflow.evidence_bundle_invalid");
  }
  const deduped = [...new Set(issues)];
  if (deduped.length > 0) return invalid(deduped);
  const bundle = value as unknown as IngestEvidenceBundleV1;
  return {
    ok: true,
    issues: [],
    integrity: "valid",
    actorTrust: bundle.trust.actorTrust,
    bundle: deepFreeze(structuredClone(bundle))
  };
}

export async function exportIngestEvidenceBundle(
  value: unknown,
  options: { disclosureProfile: EvidenceBundleDisclosureProfile }
): Promise<IngestEvidenceBundleV1> {
  if (options.disclosureProfile !== "audit" && options.disclosureProfile !== "authorized-full") {
    throw new TypeError("Unsupported evidence disclosure profile.");
  }
  const validation = await validateIngestEvidenceBundle(value);
  if (!validation.ok || !validation.bundle) {
    throw new TypeError("Evidence bundle validation failed.");
  }
  return structuredClone(validation.bundle);
}

export async function createSafeWorkflowSummary(
  value: unknown
): Promise<SafeWorkflowSummary> {
  if (isWorkflowState(value)) {
    const bundle = "bundle" in value ? value.bundle : undefined;
    return {
      schemaVersion: "large-image-ingest.workflow-summary.v1",
      workflowId: value.workflowId,
      status: value.status,
      terminal: "terminal" in value && value.terminal === true,
      ...(bundle ? { evidenceRevision: bundle.revision } : {}),
      ...(bundle ? { verificationStatus: bundle.verification.status } : {}),
      ...(bundle ? { preservationStatus: bundle.preservation.status } : {})
    };
  }
  const validation = await validateIngestEvidenceBundle(value);
  if (!validation.ok || !validation.bundle) {
    throw new TypeError("Workflow value validation failed.");
  }
  const bundle = validation.bundle;
  return {
    schemaVersion: "large-image-ingest.workflow-summary.v1",
    workflowId: bundle.workflowId,
    status: bundle.terminal.state,
    terminal: bundle.terminal.classification !== "nonterminal",
    evidenceRevision: bundle.revision,
    verificationStatus: bundle.verification.status,
    preservationStatus: bundle.preservation.status
  };
}

function isWorkflowState(value: unknown): value is VerifiedIngestWorkflowState {
  return isRecord(value) && typeof value.status === "string" &&
    WORKFLOW_STATUSES.has(value.status) &&
    typeof value.workflowId === "string" && Number.isSafeInteger(value.revision) &&
    typeof value.updatedAt === "string";
}

function validLibrary(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ["name", "version"]) &&
    value.name === "large-image-ingest" && typeof value.version === "string" &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value.version);
}

function validPolicy(value: unknown): boolean {
  return isRecord(value) &&
    hasExactKeys(value, ["profile", "result", "failedRuleCodes", "warningRuleCodes"]) &&
    validProfileReference(value.profile) &&
    (value.result === "passed" || value.result === "passed_with_warnings") &&
    validCodes(value.failedRuleCodes) && validCodes(value.warningRuleCodes);
}

function validTransfer(value: unknown): boolean {
  return isRecord(value) &&
    hasExactKeys(value, ["status", "transportCategory", "completionEvidence", "completedAt"]) &&
    value.status === "completed" && value.completionEvidence === "transport_and_session" &&
    safeId(value.transportCategory) && typeof value.completedAt === "string" &&
    !Number.isNaN(Date.parse(value.completedAt));
}

function validVerification(value: unknown): boolean {
  return isRecord(value) &&
    hasExactKeys(value, [
      "status", "verifierCategory", "expectedEvidenceCategories",
      "observedEvidenceCategories", "issueCodes", "verifiedAt"
    ]) &&
    value.status === "verified" && safeId(value.verifierCategory) &&
    typeof value.verifiedAt === "string" && !Number.isNaN(Date.parse(value.verifiedAt)) &&
    validCodes(value.expectedEvidenceCategories) && validCodes(value.observedEvidenceCategories) &&
    Array.isArray(value.issueCodes) && value.issueCodes.length === 0 &&
    Array.isArray(value.expectedEvidenceCategories) && value.expectedEvidenceCategories.length > 0 &&
    Array.isArray(value.observedEvidenceCategories) && value.observedEvidenceCategories.length > 0;
}

function validProvenance(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ["id", "schemaVersion", "integrity", "persistence"]) &&
    safeId(value.id) && value.schemaVersion === "large-image-ingest.provenance.v1" &&
    isRecord(value.integrity) && hasExactKeys(value.integrity, ["algorithm", "value"]) &&
    value.integrity.algorithm === "sha256" && typeof value.integrity.value === "string" &&
    SHA256.test(value.integrity.value) && isRecord(value.persistence) &&
    hasExactKeys(value.persistence, ["status", "operationId"]) &&
    value.persistence.status === "persisted" && safeId(value.persistence.operationId);
}

function validPreservation(value: unknown): boolean {
  if (!isRecord(value) || typeof value.status !== "string") return false;
  if (value.status === "not_requested" || value.status === "pending") {
    return hasExactKeys(value, ["status"]);
  }
  if (value.status === "preserved") {
    return Object.keys(value).every((key) => ["status", "profile", "reference"].includes(key)) &&
      safeId(value.reference) &&
      (value.profile === undefined || value.profile === "bagit-1.0-sha256" || value.profile === "ocfl-1.1-sha256");
  }
  return value.status === "failed" &&
    hasExactKeys(value, ["status", "issueCodes", "retryable"]) &&
    validCodes(value.issueCodes) && typeof value.retryable === "boolean";
}

function validStages(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0 || value.length > STAGE_ORDER.length) return false;
  let previous = -1;
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || !hasExactKeys(item, [
      "stage", "operationId", "attempts", "outcome", "issueCodes"
    ]) ||
        typeof item.stage !== "string" || seen.has(item.stage) ||
        !safeId(item.operationId) ||
        !Number.isSafeInteger(item.attempts) || Number(item.attempts) < 1 ||
        !validCodes(item.issueCodes) ||
        !["pending", "succeeded", "failed", "ambiguous"].includes(String(item.outcome))) return false;
    const index = STAGE_ORDER.indexOf(item.stage as typeof STAGE_ORDER[number]);
    if (index < 0 || index <= previous) return false;
    previous = index;
    seen.add(item.stage);
  }
  return seen.has("upload") && seen.has("verification") && seen.has("evidence_persistence");
}

function validTerminal(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).every((key) =>
    ["classification", "state", "lastAuthoritativeState"].includes(key)
  ) && ["success", "failure", "nonterminal"].includes(String(value.classification)) &&
    typeof value.state === "string" && WORKFLOW_STATUSES.has(value.state) &&
    (value.lastAuthoritativeState === undefined ||
      (typeof value.lastAuthoritativeState === "string" &&
        STABLE_WORKFLOW_STATUSES.has(value.lastAuthoritativeState)));
}

function validTrust(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ["integrity", "actorTrust", "timeTrust"]) &&
    value.integrity === "self_hashed" &&
    ["unsigned", "externally_attested", "mixed"].includes(String(value.actorTrust)) &&
    ["untrusted", "externally_attested", "mixed"].includes(String(value.timeTrust));
}

function bundleStateRelationships(value: Record<string, unknown>): boolean {
  if (!isRecord(value.terminal) || !isRecord(value.preservation)) return false;
  const revision = Number(value.revision);
  if (value.preservation.status === "not_requested") {
    return revision === 1 && value.terminal.state === "evidence_persisted" &&
      value.terminal.classification === "success" &&
      value.terminal.lastAuthoritativeState === "evidence_persisted";
  }
  if (value.preservation.status === "pending") {
    return revision === 1 && value.terminal.state === "evidence_persisted" &&
      value.terminal.classification === "nonterminal" &&
      value.terminal.lastAuthoritativeState === "evidence_persisted";
  }
  if (value.preservation.status === "preserved") {
    return revision === 2 && value.terminal.state === "preserved" &&
      value.terminal.classification === "success" &&
      value.terminal.lastAuthoritativeState === "preserved";
  }
  return value.preservation.status === "failed" && revision === 2 &&
    value.terminal.state === "preservation_failed" && value.terminal.classification === "failure" &&
    value.terminal.lastAuthoritativeState === "evidence_persisted";
}

function validProfileReference(value: unknown): boolean {
  return isRecord(value) &&
    hasExactKeys(value, ["schemaVersion", "name", "version", "effectivePolicyDigest"]) &&
    isRecord(value.effectivePolicyDigest) &&
    hasExactKeys(value.effectivePolicyDigest, ["algorithm", "value"]) &&
    validateDomainProfileReference(value);
}

function validCodes(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 128 && value.every((item) =>
    typeof item === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(item)
  );
}

function provenanceTrust(count: number): "unsigned" | "externally_attested" {
  return count > 0 ? "externally_attested" : "unsigned";
}

function completionTime(provenance: CreateIngestEvidenceBundleInput["provenance"]): string {
  const entry = provenance.entries.find((candidate) => candidate.type === "completion");
  if (!entry) throw new TypeError("Authoritative transfer completion evidence is required.");
  return entry.occurredAt;
}

function withoutIntegrity(value: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(value);
  delete copy.integrity;
  return copy;
}

async function sha256Canonical(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeProvenanceJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function invalid(issues: readonly WorkflowIssueCode[]): IngestEvidenceBundleValidationResult {
  return { ok: false, issues: [...new Set(issues)], integrity: "invalid", actorTrust: "unknown" };
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
