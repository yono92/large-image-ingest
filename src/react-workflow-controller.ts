import type {
  VerifiedIngestRunResult,
  VerifiedIngestTerminalState,
  VerifiedIngestWorkflow,
  VerifiedIngestWorkflowState
} from "./workflow-types.js";

export interface VerifiedIngestController {
  subscribe(listener: () => void): () => void;
  getState(): VerifiedIngestWorkflowState;
  start(): Promise<VerifiedIngestRunResult>;
  resume(workflowId: string): Promise<VerifiedIngestRunResult>;
  retry(): Promise<VerifiedIngestRunResult>;
  pause(reason?: unknown): void;
  cancel(reason?: unknown): Promise<VerifiedIngestTerminalState>;
  dispose(): void;
}

class DefaultVerifiedIngestController implements VerifiedIngestController {
  private state: VerifiedIngestWorkflowState;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeWorkflow: () => void;

  constructor(private readonly workflow: VerifiedIngestWorkflow) {
    this.state = workflow.getState();
    this.unsubscribeWorkflow = workflow.subscribe(() => {
      this.state = workflow.getState();
      for (const listener of this.listeners) {
        try {
          listener();
        } catch {
          // React subscribers cannot alter workflow authority.
        }
      }
    });
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getState = (): VerifiedIngestWorkflowState => this.state;
  readonly start = (): Promise<VerifiedIngestRunResult> => this.workflow.start();
  readonly resume = (workflowId: string): Promise<VerifiedIngestRunResult> =>
    this.workflow.resume(workflowId);
  readonly retry = (): Promise<VerifiedIngestRunResult> => this.workflow.retry();
  readonly pause = (reason?: unknown): void => this.workflow.pause(reason);
  readonly cancel = (reason?: unknown): Promise<VerifiedIngestTerminalState> =>
    this.workflow.cancel(reason);

  readonly dispose = (): void => {
    this.unsubscribeWorkflow();
    this.listeners.clear();
  };
}

export function createVerifiedIngestController(
  workflow: VerifiedIngestWorkflow
): VerifiedIngestController {
  return new DefaultVerifiedIngestController(workflow);
}
