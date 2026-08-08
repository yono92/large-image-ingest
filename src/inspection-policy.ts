import { validateCompletionEvidence } from "./completion-evidence.js";
import {
  SEMICONDUCTOR_WAFER_PROFILE_V1,
  compileInspectionMetadataProfile,
  validateInspectionMetadata
} from "./inspection-profile.js";
import type {
  EvaluateInspectionPolicyInput,
  IngestCompletionStatus,
  InspectionPolicyIssue,
  InspectionPolicyPack,
  InspectionPolicyReport,
  PolicyIssueCode
} from "./types.js";
import { LARGE_IMAGE_INGEST_VERSION } from "./version.js";

const POLICY_SCHEMA_VERSION = "large-image-ingest.inspection-policy.v1" as const;
const REPORT_SCHEMA_VERSION = "large-image-ingest.inspection-policy-report.v1" as const;

export class InspectionPolicyError extends Error {
  readonly code: PolicyIssueCode = "policy.invalid";
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "InspectionPolicyError";
  }
}

export const EVIDENCE_GRADE_INSPECTION_POLICY_V1 = parseInspectionPolicyPack({
  schemaVersion: POLICY_SCHEMA_VERSION,
  id: "evidence-grade-semiconductor-inspection",
  version: "1.0.0",
  description: "Requires semiconductor identity and verified, checksum-linked original storage.",
  metadataProfile: SEMICONDUCTOR_WAFER_PROFILE_V1,
  requireOriginalPreserved: true,
  requireWholeFileChecksum: true,
  requiredChecksumAlgorithm: "sha256",
  allowedCompletionStatuses: ["verified"],
  requireStoredChecksum: true
});

export function parseInspectionPolicyPack(value: unknown): InspectionPolicyPack {
  if (!isRecord(value) || value.schemaVersion !== POLICY_SCHEMA_VERSION) throw invalidPolicy();
  if (
    !hasOnlyKeys(value, [
      "schemaVersion", "id", "version", "description", "metadataProfile",
      "requireOriginalPreserved", "requireWholeFileChecksum", "requiredChecksumAlgorithm",
      "allowedCompletionStatuses", "requireStoredChecksum", "maxSourceBytes", "allowedMediaTypes"
    ]) ||
    !isNonEmptyString(value.id) || !isNonEmptyString(value.version) ||
    (value.description !== undefined && typeof value.description !== "string") ||
    !isOptionalBoolean(value.requireOriginalPreserved) ||
    !isOptionalBoolean(value.requireWholeFileChecksum) ||
    !isOptionalBoolean(value.requireStoredChecksum) ||
    (value.requiredChecksumAlgorithm !== undefined && value.requiredChecksumAlgorithm !== "sha256") ||
    (value.maxSourceBytes !== undefined && !isNonNegativeSafeInteger(value.maxSourceBytes))
  ) throw invalidPolicy();

  let completionStatuses: readonly IngestCompletionStatus[] | undefined;
  if (value.allowedCompletionStatuses !== undefined) {
    if (!Array.isArray(value.allowedCompletionStatuses) || value.allowedCompletionStatuses.length === 0) {
      throw invalidPolicy();
    }
    const statuses = value.allowedCompletionStatuses;
    if (statuses.some((status) => status !== "verified" && status !== "completed-unverified")) {
      throw invalidPolicy();
    }
    completionStatuses = [...new Set(statuses)] as IngestCompletionStatus[];
  }

  let mediaTypes: readonly string[] | undefined;
  if (value.allowedMediaTypes !== undefined) {
    if (
      !Array.isArray(value.allowedMediaTypes) || value.allowedMediaTypes.length === 0 ||
      value.allowedMediaTypes.some((mediaType) => !isNonEmptyString(mediaType))
    ) throw invalidPolicy();
    mediaTypes = [...new Set(value.allowedMediaTypes as string[])];
  }

  const policy: InspectionPolicyPack = {
    schemaVersion: POLICY_SCHEMA_VERSION,
    id: value.id,
    version: value.version,
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(value.metadataProfile !== undefined
      ? { metadataProfile: compileInspectionMetadataProfile(value.metadataProfile) }
      : {}),
    ...(typeof value.requireOriginalPreserved === "boolean"
      ? { requireOriginalPreserved: value.requireOriginalPreserved }
      : {}),
    ...(typeof value.requireWholeFileChecksum === "boolean"
      ? { requireWholeFileChecksum: value.requireWholeFileChecksum }
      : {}),
    ...(value.requiredChecksumAlgorithm === "sha256"
      ? { requiredChecksumAlgorithm: value.requiredChecksumAlgorithm }
      : {}),
    ...(completionStatuses ? { allowedCompletionStatuses: completionStatuses } : {}),
    ...(typeof value.requireStoredChecksum === "boolean"
      ? { requireStoredChecksum: value.requireStoredChecksum }
      : {}),
    ...(typeof value.maxSourceBytes === "number" ? { maxSourceBytes: value.maxSourceBytes } : {}),
    ...(mediaTypes ? { allowedMediaTypes: mediaTypes } : {})
  };
  return deepFreeze(policy);
}

export function evaluateInspectionPolicy(
  input: EvaluateInspectionPolicyInput
): InspectionPolicyReport {
  const policy = parseInspectionPolicyPack(input.policy);
  const issues: InspectionPolicyIssue[] = [];
  const manifest = input.manifest;

  if (policy.metadataProfile) {
    const metadataResult = validateInspectionMetadata(manifest.metadata, policy.metadataProfile);
    for (const metadataIssue of metadataResult.issues) {
      issues.push({ ...metadataIssue });
    }
    if (!metadataResult.ok) issues.push(issue("policy.metadata_invalid", "manifest.metadata"));
  }
  if (
    policy.requireOriginalPreserved === true &&
    !(manifest.original?.preservation?.required === true &&
      Array.isArray(manifest.original.preservation.allowedMutations) &&
      manifest.original.preservation.allowedMutations.length === 0)
  ) issues.push(issue("policy.original_not_preserved", "manifest.original.preservation"));

  if (policy.requireWholeFileChecksum === true && !manifest.original?.checksum) {
    issues.push(issue("policy.checksum_missing", "manifest.original.checksum"));
  }
  if (
    policy.requiredChecksumAlgorithm && manifest.original?.checksum &&
    manifest.original.checksum.algorithm !== policy.requiredChecksumAlgorithm
  ) issues.push(issue("policy.checksum_algorithm", "manifest.original.checksum.algorithm"));
  if (policy.maxSourceBytes !== undefined && manifest.original.sizeBytes > policy.maxSourceBytes) {
    issues.push(issue("policy.source_too_large", "manifest.original.sizeBytes"));
  }
  if (policy.allowedMediaTypes && !policy.allowedMediaTypes.includes(manifest.original.mediaType)) {
    issues.push(issue("policy.media_type_disallowed", "manifest.original.mediaType"));
  }

  let completionId: string | undefined;
  if (requiresCompletion(policy) && !input.completion) {
    issues.push(issue("policy.completion_missing", "completion"));
  } else if (input.completion) {
    const result = validateCompletionEvidence(input.completion);
    if (!result.ok || input.completion.manifest.id !== manifest.id) {
      issues.push(issue("policy.completion_invalid", "completion"));
    } else {
      completionId = result.evidence.id;
      if (
        policy.allowedCompletionStatuses &&
        !policy.allowedCompletionStatuses.includes(result.evidence.status)
      ) issues.push(issue("policy.completion_unverified", "completion.status"));
      if (policy.requireStoredChecksum === true && !result.evidence.verification?.storedChecksum) {
        issues.push(issue("policy.stored_checksum_missing", "completion.verification.storedChecksum"));
      }
    }
  }

  issues.sort(compareIssues);
  const report: InspectionPolicyReport = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    producer: { name: "large-image-ingest", version: LARGE_IMAGE_INGEST_VERSION },
    policy: { id: policy.id, version: policy.version },
    manifestId: manifest.id,
    ...(completionId ? { completionId } : {}),
    ok: issues.length === 0,
    issues,
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString()
  };
  return deepFreeze(report);
}

function requiresCompletion(policy: InspectionPolicyPack): boolean {
  return Boolean(policy.allowedCompletionStatuses || policy.requireStoredChecksum);
}

function issue(code: PolicyIssueCode, path: string): InspectionPolicyIssue {
  return { code, path, severity: "error" };
}

function compareIssues(left: InspectionPolicyIssue, right: InspectionPolicyIssue): number {
  return left.path.localeCompare(right.path) || left.code.localeCompare(right.code);
}

function invalidPolicy(): InspectionPolicyError {
  return new InspectionPolicyError("The inspection policy pack is invalid.");
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
