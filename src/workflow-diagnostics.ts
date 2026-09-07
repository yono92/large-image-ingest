import type {
  SafeWorkflowSummary,
  VerifiedIngestWorkflowState
} from "./workflow-types.js";

export function createSafeWorkflowStateSummary(
  state: VerifiedIngestWorkflowState
): SafeWorkflowSummary {
  const bundle = "bundle" in state ? state.bundle : undefined;
  return {
    schemaVersion: "large-image-ingest.workflow-summary.v1",
    workflowId: state.workflowId,
    status: state.status,
    terminal: "terminal" in state && state.terminal === true,
    ...(bundle ? { evidenceRevision: bundle.revision } : {}),
    ...(bundle ? { verificationStatus: bundle.verification.status } : {}),
    ...(bundle ? { preservationStatus: bundle.preservation.status } : {})
  };
}
