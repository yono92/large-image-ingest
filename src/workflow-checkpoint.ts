import { validateDomainProfileReference } from "./profiles.js";
import { VerifiedIngestWorkflowError } from "./workflow-errors.js";
import {
  WORKFLOW_CHECKPOINT_SCHEMA_VERSION,
  type WorkflowCheckpointV1,
  type WorkflowStage,
  type WorkflowStatus
} from "./workflow-types.js";

const REQUIRED_KEYS = [
  "schemaVersion", "workflowId", "revision", "updatedAt", "status", "operationIds", "attempts"
] as const;
const OPTIONAL_KEYS = [
  "lastAuthoritativeState", "manifestId", "sourceIdentity", "profile", "resumeRecordId",
  "evidenceId", "evidenceRevision", "evidenceReference", "verification", "preservationOutcome"
] as const;
const ALL_KEYS = new Set<string>([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STATUSES = new Set<WorkflowStatus>([
  "preparing", "prepared", "uploading", "paused", "uploaded_unverified", "verifying",
  "verified", "persisting_evidence", "evidence_persisted", "preserving",
  "finalizing_evidence", "preserved", "preparation_failed", "upload_failed",
  "verification_failed", "evidence_persistence_failed", "preservation_failed",
  "evidence_finalization_failed", "reconciliation_required", "canceled", "stopped"
]);
const STAGES = new Set<WorkflowStage>([
  "preparation", "upload", "upload_completion", "verification", "evidence_persistence",
  "preservation", "evidence_finalization"
]);

export function parseWorkflowCheckpoint(value: unknown): WorkflowCheckpointV1 {
  if (!isRecord(value) || Object.keys(value).some((key) => !ALL_KEYS.has(key)) ||
      REQUIRED_KEYS.some((key) => !(key in value)) ||
      value.schemaVersion !== WORKFLOW_CHECKPOINT_SCHEMA_VERSION ||
      !safeId(value.workflowId) || !positiveInteger(value.revision) ||
      typeof value.updatedAt !== "string" || Number.isNaN(Date.parse(value.updatedAt)) ||
      typeof value.status !== "string" || !STATUSES.has(value.status as WorkflowStatus) ||
      !validOperationIds(value.operationIds) || !validAttempts(value.attempts)) {
    throw new VerifiedIngestWorkflowError("workflow.checkpoint_invalid");
  }
  if (value.manifestId !== undefined && !safeId(value.manifestId)) invalid();
  if (value.resumeRecordId !== undefined && !safeId(value.resumeRecordId)) invalid();
  if (value.evidenceId !== undefined && !safeId(value.evidenceId)) invalid();
  if (value.evidenceRevision !== undefined && !positiveInteger(value.evidenceRevision)) invalid();
  if (value.evidenceReference !== undefined && !safeId(value.evidenceReference)) invalid();
  if (value.profile !== undefined && !validateDomainProfileReference(value.profile)) invalid();
  if (value.sourceIdentity !== undefined && !validSourceIdentity(value.sourceIdentity)) invalid();
  if (value.verification !== undefined && !validVerification(value.verification)) invalid();
  if (value.preservationOutcome !== undefined && !validPreservation(value.preservationOutcome)) invalid();
  return deepFreeze(structuredClone(value as unknown as WorkflowCheckpointV1));
}

export function workflowCheckpointMatchesSource(
  checkpoint: WorkflowCheckpointV1,
  input: { sizeBytes: number; checksum: string }
): boolean {
  return checkpoint.sourceIdentity?.sizeBytes === input.sizeBytes &&
    checkpoint.sourceIdentity.value === input.checksum;
}

export function restoreWorkflowOperationIds(
  checkpoint: WorkflowCheckpointV1
): ReadonlyMap<WorkflowStage, string> {
  return new Map(Object.entries(checkpoint.operationIds) as [WorkflowStage, string][]);
}

function validOperationIds(value: unknown): boolean {
  return isRecord(value) && Object.entries(value).every(([stage, operationId]) =>
    STAGES.has(stage as WorkflowStage) && safeId(operationId)
  );
}

function validAttempts(value: unknown): boolean {
  return isRecord(value) && Object.entries(value).every(([stage, attempt]) =>
    STAGES.has(stage as WorkflowStage) && positiveInteger(attempt)
  );
}

function validSourceIdentity(value: unknown): boolean {
  return isRecord(value) && value.algorithm === "sha256" && value.scope === "whole-file" &&
    Number.isSafeInteger(value.sizeBytes) && Number(value.sizeBytes) >= 0 &&
    typeof value.value === "string" && SHA256.test(value.value);
}

function validVerification(value: unknown): boolean {
  if (!isRecord(value) || typeof value.checkedAt !== "string") return false;
  if (value.status === "verified") {
    return stringArray(value.expectedEvidenceCategories) && stringArray(value.observedEvidenceCategories);
  }
  return (value.status === "failed" || value.status === "unavailable") &&
    stringArray(value.issueCodes) && typeof value.retryable === "boolean";
}

function validPreservation(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return value.status === "preserved"
    ? safeId(value.reference)
    : value.status === "failed" && stringArray(value.issueCodes) && typeof value.retryable === "boolean";
}

function stringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length <= 128);
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function positiveInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function invalid(): never {
  throw new VerifiedIngestWorkflowError("workflow.checkpoint_invalid");
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
