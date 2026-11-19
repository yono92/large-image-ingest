import { createSafeWorkflowStateSummary } from "./workflow-diagnostics.js";
import { type LargeImageIngestSession } from "./session.js";
import { VerifiedIngestWorkflowError } from "./workflow-errors.js";
import { WORKFLOW_CHECKPOINT_SCHEMA_VERSION } from "./workflow-types.js";
import type {
  CreateVerifiedIngestWorkflowOptions,
  IngestEvidenceBundleV1,
  PreservationHandoffResult,
  StableWorkflowStatus,
  VerifiedIngestRunResult,
  VerifiedIngestTerminalState,
  VerifiedIngestWorkflow,
  VerifiedIngestWorkflowEvent,
  VerifiedIngestWorkflowState,
  WorkflowCheckpointV1,
  WorkflowFailedState,
  WorkflowIssueCode,
  WorkflowStage,
  WorkflowStateBase,
  WorkflowVerificationResult
} from "./workflow-types.js";
import type { DomainProfileEvaluation } from "./profiles.js";
import type { IngestProvenanceArtifactV1, IngestProvenanceRecorder } from "./provenance.js";
import type { IngestFileLike, IngestManifest, UploadSessionSnapshot } from "./types.js";
import { runStart, runResume } from "./workflow-start.js";
import { runUpload, runVerification } from "./workflow-upload.js";
import { runInitialEvidencePersistence, runPreservation, finalizePreservation } from "./workflow-evidence.js";

/** Internal state machine behind `createVerifiedIngestWorkflow`. */
export class DefaultVerifiedIngestWorkflow implements VerifiedIngestWorkflow {
  workflowId: string;
  stateRevision = 0;
  checkpointRevision: number | "absent" = "absent";
  state: VerifiedIngestWorkflowState;
  activePromise: Promise<VerifiedIngestRunResult> | undefined;
  session: LargeImageIngestSession | undefined;
  manifest: IngestManifest | undefined;
  evaluation: DomainProfileEvaluation | undefined;
  recorder: IngestProvenanceRecorder | undefined;
  provenance: IngestProvenanceArtifactV1 | undefined;
  verification: (WorkflowVerificationResult & { status: "verified" }) | undefined;
  bundle: IngestEvidenceBundleV1 | undefined;
  pendingFinalBundle: IngestEvidenceBundleV1 | undefined;
  evidenceId: string | undefined;
  evidenceReference: string | undefined;
  preservationOutcome: PreservationHandoffResult | undefined;
  resumeRecordId: string | undefined;
  readonly operationIds = new Map<WorkflowStage, string>();
  readonly attempts = new Map<WorkflowStage, number>();
  readonly subscribers = new Set<() => void>();
  readonly abortController = new AbortController();
  provenanceObserverFailed = false;

  constructor(
    readonly file: IngestFileLike,
    readonly options: CreateVerifiedIngestWorkflowOptions
  ) {
    this.workflowId = this.id("workflow");
    this.state = {
      status: "preparing",
      workflowId: this.workflowId,
      revision: this.stateRevision,
      updatedAt: this.now(),
      allowedActions: ["cancel"]
    };
  }

  getState(): VerifiedIngestWorkflowState {
    return structuredClone(this.state);
  }

  subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  start(): Promise<VerifiedIngestRunResult> {
    if (this.activePromise) return this.activePromise;
    if (this.state.status !== "preparing") {
      return Promise.reject(new VerifiedIngestWorkflowError("workflow.transition_invalid"));
    }
    this.activePromise = runStart(this).finally(() => {
      this.activePromise = undefined;
    });
    return this.activePromise;
  }

  resume(workflowId: string): Promise<VerifiedIngestRunResult> {
    if (this.activePromise) return this.activePromise;
    if (this.state.status !== "preparing") {
      return Promise.reject(new VerifiedIngestWorkflowError("workflow.transition_invalid"));
    }
    this.activePromise = runResume(this, workflowId).finally(() => {
      this.activePromise = undefined;
    });
    return this.activePromise;
  }

  retry(): Promise<VerifiedIngestRunResult> {
    if (this.activePromise) return this.activePromise;
    let operation: (() => Promise<VerifiedIngestRunResult>) | undefined;
    switch (this.state.status) {
      case "paused":
      case "upload_failed":
        operation = this.resumeRecordId ? () => runUpload(this, this.resumeRecordId) : undefined;
        break;
      case "verification_failed": operation = () => runVerification(this); break;
      case "evidence_persistence_failed": operation = () => runInitialEvidencePersistence(this); break;
      case "preservation_failed": operation = () => runPreservation(this); break;
      case "evidence_finalization_failed":
        operation = this.preservationOutcome
          ? () => finalizePreservation(this, this.preservationOutcome as PreservationHandoffResult)
          : undefined;
        break;
    }
    if (!operation) return Promise.reject(new VerifiedIngestWorkflowError("workflow.transition_invalid"));
    this.activePromise = operation().finally(() => {
      this.activePromise = undefined;
    });
    return this.activePromise;
  }

  pause(reason?: unknown): void {
    if (this.state.status !== "uploading" || !this.session) {
      throw new VerifiedIngestWorkflowError("workflow.transition_invalid");
    }
    this.session.pause(reason);
  }

  async cancel(reason?: unknown): Promise<VerifiedIngestTerminalState> {
    if (isTerminal(this.state)) return this.state;
    if (this.state.status === "uploading" && this.session) {
      this.abortController.abort(reason);
      await this.session.cancel(reason);
      return this.transition({ status: "canceled", terminal: true, allowedActions: [] });
    }
    const authority = lastAuthority(this.state.status);
    if (authority) {
      this.abortController.abort(reason);
      return this.transition({
        status: "stopped",
        terminal: true,
        lastAuthoritativeState: authority,
        allowedActions: []
      });
    }
    this.abortController.abort(reason);
    return this.transition({ status: "canceled", terminal: true, allowedActions: [] });
  }

  observeUploadSnapshot(snapshot: UploadSessionSnapshot): void {
    if (this.state.status !== "uploading" || !this.manifest) return;
    this.transition({
      status: "uploading",
      manifest: this.manifest,
      snapshot,
      allowedActions: ["pause", "cancel"]
    });
  }

  transition<T extends WorkflowStateInput>(next: T): TransitionedState<T> {
    this.stateRevision += 1;
    const state = {
      ...next,
      workflowId: this.workflowId,
      revision: this.stateRevision,
      updatedAt: this.now()
    } as TransitionedState<T>;
    this.state = state as VerifiedIngestWorkflowState;
    this.emitState();
    return state;
  }

  async fail(
    status: WorkflowFailedState["status"],
    issueCodes: readonly WorkflowIssueCode[],
    retryability: WorkflowFailedState["retryability"],
    authority?: StableWorkflowStatus
  ): Promise<VerifiedIngestRunResult> {
    const state = this.transition({
      status,
      ...(authority ? { lastAuthoritativeState: authority } : {}),
      issueCodes,
      retryability,
      allowedActions: retryability === "terminal" ? [] : ["retry", "stop"]
    });
    this.emit({ type: "workflow:failed", stage: stageFromFailure(status), codes: issueCodes });
    if (authority) {
      try {
        await this.persistCheckpoint(authority);
      } catch {
        return this.transition({
          status: "reconciliation_required",
          stage: stageFromFailure(status),
          lastAuthoritativeState: authority,
          issueCodes: ["workflow.reconciliation_required"],
          allowedActions: ["retry", "stop"]
        });
      }
    }
    return state;
  }

  async persistCheckpoint(authority: StableWorkflowStatus): Promise<void> {
    const checkpoint: WorkflowCheckpointV1 = {
      schemaVersion: WORKFLOW_CHECKPOINT_SCHEMA_VERSION,
      workflowId: this.workflowId,
      revision: this.state.revision,
      updatedAt: this.state.updatedAt,
      status: this.state.status,
      lastAuthoritativeState: authority,
      ...(this.manifest ? { manifestId: this.manifest.id } : {}),
      ...(this.manifest?.original.checksum
        ? {
            sourceIdentity: {
              algorithm: "sha256",
              scope: "whole-file",
              sizeBytes: this.manifest.original.sizeBytes,
              value: this.manifest.original.checksum.value
            }
          }
        : {}),
      ...(this.evaluation ? { profile: this.evaluation.profile } : {}),
      ...(this.resumeRecordId ? { resumeRecordId: this.resumeRecordId } : {}),
      operationIds: Object.fromEntries(this.operationIds),
      attempts: Object.fromEntries(this.attempts),
      ...(this.evidenceId ? { evidenceId: this.evidenceId } : {}),
      ...(this.bundle && this.evidenceReference ? { evidenceRevision: this.bundle.revision } : {}),
      ...(this.evidenceReference ? { evidenceReference: this.evidenceReference } : {}),
      ...(this.verification ? { verification: this.verification } : {}),
      ...(this.preservationOutcome ? { preservationOutcome: this.preservationOutcome } : {})
    };
    const result = await this.options.checkpointStore.put(checkpoint, {
      expectedRevision: this.checkpointRevision
    });
    if (result === "conflict") throw new VerifiedIngestWorkflowError("workflow.checkpoint_conflict", true);
    this.checkpointRevision = checkpoint.revision;
  }

  operationId(stage: WorkflowStage): string {
    let value = this.operationIds.get(stage);
    if (!value) {
      value = this.id("operation");
      this.operationIds.set(stage, value);
    }
    return value;
  }

  emitAttempt(stage: WorkflowStage): void {
    const attempt = (this.attempts.get(stage) ?? 0) + 1;
    this.attempts.set(stage, attempt);
    this.emit({ type: "workflow:stage-attempt", stage, attempt });
  }

  emitState(): void {
    this.emit({
      type: "workflow:state",
      summary: createSafeWorkflowStateSummary(this.state)
    });
    for (const listener of this.subscribers) {
      try {
        listener();
      } catch (error) {
        this.observeFailure({ observer: "subscriber", error });
      }
    }
  }

  emit(event: VerifiedIngestWorkflowEvent): void {
    try {
      this.options.onEvent?.(event);
    } catch (error) {
      this.observeFailure({ observer: "event", error });
    }
  }

  observeFailure(failure: { observer: "event" | "subscriber"; error: unknown }): void {
    try {
      this.options.onObserverError?.(failure);
    } catch {
      // Observer failures are intentionally isolated from workflow authority.
    }
  }

  id(kind: "workflow" | "evidence" | "operation"): string {
    if (this.options.createId) return this.options.createId(kind);
    const suffix = globalThis.crypto?.randomUUID?.() ??
      `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    return `${kind}-${suffix}`;
  }

  now(): string {
    return (this.options.now?.() ?? new Date()).toISOString();
  }

  requireManifest(): IngestManifest {
    if (!this.manifest) throw new VerifiedIngestWorkflowError("workflow.internal_failed");
    return this.manifest;
  }

  requireEvaluation(): DomainProfileEvaluation {
    if (!this.evaluation?.sessionBinding) throw new VerifiedIngestWorkflowError("workflow.internal_failed");
    return this.evaluation;
  }

  requireRecorder(): IngestProvenanceRecorder {
    if (!this.recorder) throw new VerifiedIngestWorkflowError("workflow.internal_failed");
    return this.recorder;
  }

  requireVerification(): WorkflowVerificationResult & { status: "verified" } {
    if (!this.verification) throw new VerifiedIngestWorkflowError("workflow.internal_failed");
    return this.verification;
  }

  requireProvenance(): IngestProvenanceArtifactV1 {
    if (!this.provenance) throw new VerifiedIngestWorkflowError("workflow.internal_failed");
    return this.provenance;
  }

  requireBundle(): IngestEvidenceBundleV1 {
    if (!this.bundle) throw new VerifiedIngestWorkflowError("workflow.internal_failed");
    return this.bundle;
  }
}

export function stageFromFailure(status: WorkflowFailedState["status"]): WorkflowStage {
  switch (status) {
    case "preparation_failed": return "preparation";
    case "upload_failed": return "upload";
    case "verification_failed": return "verification";
    case "evidence_persistence_failed": return "evidence_persistence";
    case "preservation_failed": return "preservation";
    case "evidence_finalization_failed": return "evidence_finalization";
  }
}

export function safeCategory(value: string | undefined): string {
  return value && /^[a-z0-9][a-z0-9._-]{0,127}$/.test(value) ? value : "application";
}

export function safeReference(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

export function lastAuthority(status: VerifiedIngestWorkflowState["status"]): StableWorkflowStatus | undefined {
  if (status === "prepared" || status === "uploading" || status === "paused") return "prepared";
  if (status === "uploaded_unverified" || status === "verifying" || status === "verification_failed") {
    return "uploaded_unverified";
  }
  if (status === "verified" || status === "persisting_evidence" || status === "evidence_persistence_failed") {
    return "verified";
  }
  if (status === "evidence_persisted" || status === "preserving" || status === "finalizing_evidence" ||
      status === "preservation_failed" || status === "evidence_finalization_failed") {
    return "evidence_persisted";
  }
  if (status === "preserved") return "preserved";
  return undefined;
}

export function isTerminal(state: VerifiedIngestWorkflowState): state is VerifiedIngestTerminalState {
  return ("terminal" in state && state.terminal === true) ||
    ("retryability" in state && state.retryability === "terminal");
}

export function isUploadRecoveryStatus(status: VerifiedIngestWorkflowState["status"]): boolean {
  return status === "prepared" || status === "uploading" || status === "paused" ||
    status === "upload_failed";
}

export function isEvidencePendingStatus(status: VerifiedIngestWorkflowState["status"]): boolean {
  return status === "verified" || status === "persisting_evidence" ||
    status === "evidence_persistence_failed";
}

export type WorkflowStateInput = VerifiedIngestWorkflowState extends infer State
  ? State extends WorkflowStateBase
    ? Omit<State, "workflowId" | "revision" | "updatedAt">
    : never
  : never;

export type TransitionedState<T extends WorkflowStateInput> = T & Pick<
  WorkflowStateBase,
  "workflowId" | "revision" | "updatedAt"
>;
