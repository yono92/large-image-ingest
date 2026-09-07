import { VerifiedIngestWorkflowError } from "./workflow-errors.js";
import type { WorkflowStage } from "./workflow-types.js";

export interface WorkflowOperationAttempt {
  readonly stage: WorkflowStage;
  readonly operationId: string;
  readonly attempt: number;
}

export function nextWorkflowOperationAttempt(input: {
  stage: WorkflowStage;
  operationId: string;
  previousAttempt?: number;
}): WorkflowOperationAttempt {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.operationId) ||
      input.previousAttempt !== undefined &&
      (!Number.isSafeInteger(input.previousAttempt) || input.previousAttempt < 1)) {
    throw new VerifiedIngestWorkflowError("workflow.checkpoint_invalid");
  }
  return Object.freeze({
    stage: input.stage,
    operationId: input.operationId,
    attempt: (input.previousAttempt ?? 0) + 1
  });
}
