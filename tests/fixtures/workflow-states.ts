import type { StableWorkflowStatus, WorkflowStage, WorkflowStatus } from "../../src/workflow.js";

export const canonicalWorkflowStatuses = [
  "preparing", "prepared", "uploading", "paused", "uploaded_unverified", "verifying",
  "verified", "persisting_evidence", "evidence_persisted", "preserving",
  "finalizing_evidence", "preserved", "preparation_failed", "upload_failed",
  "verification_failed", "evidence_persistence_failed", "preservation_failed",
  "evidence_finalization_failed", "reconciliation_required", "canceled", "stopped"
] as const satisfies readonly WorkflowStatus[];

export const recoveryAuthorities = [
  { failure: "verification_failed", authority: "uploaded_unverified", retryStage: "verification" },
  { failure: "evidence_persistence_failed", authority: "verified", retryStage: "evidence_persistence" },
  { failure: "preservation_failed", authority: "evidence_persisted", retryStage: "preservation" },
  { failure: "evidence_finalization_failed", authority: "evidence_persisted", retryStage: "evidence_finalization" }
] as const satisfies readonly {
  failure: WorkflowStatus;
  authority: StableWorkflowStatus;
  retryStage: WorkflowStage;
}[];

export const idempotentWorkflowStages = [
  "verification", "evidence_persistence", "preservation", "evidence_finalization"
] as const satisfies readonly WorkflowStage[];
