import type { WorkflowIssueCode } from "./workflow-types.js";

const SAFE_MESSAGES: Record<WorkflowIssueCode, string> = {
  "workflow.transition_invalid": "The workflow action is not valid in the current state.",
  "workflow.profile_failed": "The selected domain profile did not authorize ingest.",
  "workflow.source_identity_missing": "A whole-file SHA-256 source identity is required.",
  "workflow.verification_failed": "Stored-object verification did not succeed.",
  "workflow.evidence_persistence_failed": "Durable evidence persistence did not succeed.",
  "workflow.evidence_finalization_failed": "Final evidence persistence did not succeed.",
  "workflow.preservation_failed": "Preservation handoff did not succeed.",
  "workflow.reconciliation_required": "An external outcome must be reconciled before retry.",
  "workflow.checkpoint_invalid": "The workflow checkpoint is invalid.",
  "workflow.checkpoint_conflict": "The workflow checkpoint changed concurrently.",
  "workflow.source_mismatch": "The selected source does not match the workflow identity.",
  "workflow.profile_mismatch": "The selected profile does not match the workflow checkpoint.",
  "workflow.evidence_bundle_invalid": "The evidence bundle is invalid.",
  "workflow.evidence_bundle_integrity_invalid": "The evidence bundle integrity check failed.",
  "workflow.evidence_bundle_version_unsupported": "The evidence bundle schema version is unsupported.",
  "workflow.observer_failed": "A workflow observer failed.",
  "workflow.internal_failed": "The workflow could not complete the requested stage."
};

export class VerifiedIngestWorkflowError extends Error {
  readonly code: WorkflowIssueCode;
  readonly retryable: boolean;

  constructor(code: WorkflowIssueCode, retryable = false) {
    super(SAFE_MESSAGES[code]);
    this.name = "VerifiedIngestWorkflowError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function isVerifiedIngestWorkflowError(
  value: unknown
): value is VerifiedIngestWorkflowError {
  return value instanceof VerifiedIngestWorkflowError;
}

export function toWorkflowIssueCode(value: unknown): WorkflowIssueCode {
  return isVerifiedIngestWorkflowError(value) ? value.code : "workflow.internal_failed";
}
