import type {
  CreateVerifiedIngestWorkflowOptions,
  IngestEvidenceBundleV1,
  VerifiedIngestRunResult,
  VerifiedIngestTerminalState,
  VerifiedIngestWorkflow
} from "../../src/workflow.js";

export type FrozenWorkflowContract = {
  createOptions: CreateVerifiedIngestWorkflowOptions;
  handle: VerifiedIngestWorkflow;
  runResult: VerifiedIngestRunResult;
  terminalState: VerifiedIngestTerminalState;
  bundle: IngestEvidenceBundleV1;
};
