import {
  createIngestEvidenceBundle,
  createSafeWorkflowSummary,
  validateIngestEvidenceBundle
} from "./evidence-bundle.js";
import { createSafeWorkflowStateSummary } from "./workflow-diagnostics.js";
import { calculateChecksum } from "./checksum.js";
import { createManifest } from "./manifest.js";
import {
  createDomainProfileReference,
  domainProfileReferencesEqual,
  evaluateDomainValidationProfile
} from "./profiles.js";
import { createIngestProvenanceRecorder } from "./provenance.js";
import { createIngestSession, type LargeImageIngestSession } from "./session.js";
import { VerifiedIngestWorkflowError, toWorkflowIssueCode } from "./workflow-errors.js";
import {
  parseWorkflowCheckpoint,
  restoreWorkflowOperationIds,
  workflowCheckpointMatchesSource
} from "./workflow-checkpoint.js";
export {
  parseWorkflowCheckpoint,
  restoreWorkflowOperationIds,
  workflowCheckpointMatchesSource
} from "./workflow-checkpoint.js";
export { nextWorkflowOperationAttempt } from "./workflow-operation.js";
export { createSafeWorkflowStateSummary } from "./workflow-diagnostics.js";
import {
  INGEST_EVIDENCE_BUNDLE_SCHEMA_VERSION,
  WORKFLOW_CHECKPOINT_SCHEMA_VERSION
} from "./workflow-types.js";
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

export {
  createIngestEvidenceBundle,
  createSafeWorkflowSummary,
  exportIngestEvidenceBundle,
  validateIngestEvidenceBundle
} from "./evidence-bundle.js";
export {
  VerifiedIngestWorkflowError,
  isVerifiedIngestWorkflowError
} from "./workflow-errors.js";
export {
  INGEST_EVIDENCE_BUNDLE_SCHEMA_VERSION,
  WORKFLOW_CHECKPOINT_SCHEMA_VERSION
} from "./workflow-types.js";
export type * from "./workflow-types.js";

export function createVerifiedIngestWorkflow(
  file: IngestFileLike,
  options: CreateVerifiedIngestWorkflowOptions
): VerifiedIngestWorkflow {
  return new DefaultVerifiedIngestWorkflow(file, options);
}

class DefaultVerifiedIngestWorkflow implements VerifiedIngestWorkflow {
  private workflowId: string;
  private stateRevision = 0;
  private checkpointRevision: number | "absent" = "absent";
  private state: VerifiedIngestWorkflowState;
  private activePromise: Promise<VerifiedIngestRunResult> | undefined;
  private session: LargeImageIngestSession | undefined;
  private manifest: IngestManifest | undefined;
  private evaluation: DomainProfileEvaluation | undefined;
  private recorder: IngestProvenanceRecorder | undefined;
  private provenance: IngestProvenanceArtifactV1 | undefined;
  private verification: (WorkflowVerificationResult & { status: "verified" }) | undefined;
  private bundle: IngestEvidenceBundleV1 | undefined;
  private pendingFinalBundle: IngestEvidenceBundleV1 | undefined;
  private evidenceId: string | undefined;
  private evidenceReference: string | undefined;
  private preservationOutcome: PreservationHandoffResult | undefined;
  private resumeRecordId: string | undefined;
  private readonly operationIds = new Map<WorkflowStage, string>();
  private readonly attempts = new Map<WorkflowStage, number>();
  private readonly subscribers = new Set<() => void>();
  private readonly abortController = new AbortController();
  private provenanceObserverFailed = false;

  constructor(
    private readonly file: IngestFileLike,
    private readonly options: CreateVerifiedIngestWorkflowOptions
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
    this.activePromise = this.runStart().finally(() => {
      this.activePromise = undefined;
    });
    return this.activePromise;
  }

  resume(workflowId: string): Promise<VerifiedIngestRunResult> {
    if (this.activePromise) return this.activePromise;
    if (this.state.status !== "preparing") {
      return Promise.reject(new VerifiedIngestWorkflowError("workflow.transition_invalid"));
    }
    this.activePromise = this.runResume(workflowId).finally(() => {
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
        operation = this.resumeRecordId ? () => this.runUpload(this.resumeRecordId) : undefined;
        break;
      case "verification_failed": operation = () => this.runVerification(); break;
      case "evidence_persistence_failed": operation = () => this.runInitialEvidencePersistence(); break;
      case "preservation_failed": operation = () => this.runPreservation(); break;
      case "evidence_finalization_failed":
        operation = this.preservationOutcome
          ? () => this.finalizePreservation(this.preservationOutcome as PreservationHandoffResult)
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

  private async runStart(): Promise<VerifiedIngestRunResult> {
    try {
      const manifest = await createManifest(this.file, {
        ...this.options.session,
        checksum: {
          ...this.options.session.checksum,
          algorithm: "sha256",
          required: true
        }
      });
      this.manifest = manifest;
      if (!manifest.original.checksum) {
        return this.fail("preparation_failed", ["workflow.source_identity_missing"], "terminal");
      }
      const evaluation = await evaluateDomainValidationProfile({
        profile: this.options.profile.definition,
        manifest,
        ...(this.options.profile.structuralEvidence
          ? { structuralEvidence: this.options.profile.structuralEvidence }
          : {}),
        ...(this.options.profile.externalEvidence
          ? { externalEvidence: this.options.profile.externalEvidence }
          : {}),
        evaluatedAt: this.now()
      });
      this.evaluation = evaluation;
      if (!evaluation.sessionBinding) {
        return this.fail("preparation_failed", ["workflow.profile_failed"], "terminal");
      }
      const recorderOptions = {
        manifest,
        policy: { id: evaluation.profile.name, version: evaluation.profile.version },
        transport: {
          category: safeCategory(this.options.session.transport.capabilities?.name),
          ...(this.options.session.transport.capabilities
            ? { capabilities: this.options.session.transport.capabilities }
            : {})
        },
        correlationId: this.workflowId,
        ...(this.options.now ? { now: this.options.now } : {})
      };
      this.recorder = createIngestProvenanceRecorder(recorderOptions);
      this.recorder.recordPolicyEvaluation({
        id: evaluation.profile.name,
        version: evaluation.profile.version,
        result: evaluation.result === "passed_with_warnings" ? "passed_with_warnings" : "passed",
        failedRuleCodes: evaluation.failedRuleCodes,
        warningRuleCodes: evaluation.warningRuleCodes,
        occurredAt: evaluation.evaluatedAt
      });
      this.transition({
        status: "prepared",
        manifest,
        profileEvaluation: evaluation,
        allowedActions: ["start_upload", "cancel"]
      });
      await this.persistCheckpoint("prepared");
      return await this.runUpload();
    } catch (error) {
      return this.fail("preparation_failed", [toWorkflowIssueCode(error)], "terminal");
    }
  }

  private async runResume(workflowId: string): Promise<VerifiedIngestRunResult> {
    try {
      const stored = await this.options.checkpointStore.get(workflowId);
      if (!stored) return this.fail("preparation_failed", ["workflow.checkpoint_invalid"], "terminal");
      const checkpoint = parseWorkflowCheckpoint(stored);
      this.workflowId = workflowId;
      this.stateRevision = checkpoint.revision;
      this.checkpointRevision = checkpoint.revision;
      this.evidenceId = checkpoint.evidenceId;
      const selectedProfile = createDomainProfileReference(this.options.profile.definition);
      if (!domainProfileReferencesEqual(checkpoint.profile, selectedProfile)) {
        return this.fail("preparation_failed", ["workflow.profile_mismatch"], "terminal");
      }
      if (!checkpoint.resumeRecordId || !checkpoint.sourceIdentity) {
        return this.fail("upload_failed", ["workflow.checkpoint_invalid"], "terminal");
      }
      const checksum = await calculateChecksum(this.file, { algorithm: "sha256", required: true });
      if (!workflowCheckpointMatchesSource(checkpoint, {
        sizeBytes: this.file.size,
        checksum: checksum.value
      })) {
        return this.fail("preparation_failed", ["workflow.source_mismatch"], "terminal");
      }
      const record = await this.options.session.resume.store.get(checkpoint.resumeRecordId);
      if (!record || record.manifest.id !== checkpoint.manifestId) {
        return this.fail("upload_failed", ["workflow.checkpoint_invalid"], "terminal");
      }
      this.resumeRecordId = checkpoint.resumeRecordId;
      this.operationIds.clear();
      for (const [stage, operationId] of restoreWorkflowOperationIds(checkpoint)) {
        this.operationIds.set(stage, operationId);
      }
      this.attempts.clear();
      for (const [stage, attempt] of Object.entries(checkpoint.attempts)) {
        if (attempt !== undefined) this.attempts.set(stage as WorkflowStage, attempt);
      }
      this.manifest = record.manifest;
      const evaluation = await evaluateDomainValidationProfile({
        profile: this.options.profile.definition,
        manifest: record.manifest,
        ...(this.options.profile.structuralEvidence
          ? { structuralEvidence: this.options.profile.structuralEvidence }
          : {}),
        ...(this.options.profile.externalEvidence
          ? { externalEvidence: this.options.profile.externalEvidence }
          : {}),
        evaluatedAt: this.now()
      });
      if (!evaluation.sessionBinding) {
        return this.fail("preparation_failed", ["workflow.profile_failed"], "terminal");
      }
      this.evaluation = evaluation;
      this.recorder = this.createRecorder(record.manifest, evaluation);
      if (isUploadRecoveryStatus(checkpoint.status)) {
        this.transition({
          status: "prepared",
          manifest: record.manifest,
          profileEvaluation: evaluation,
          allowedActions: ["start_upload", "cancel"]
        });
        return await this.runUpload(checkpoint.resumeRecordId);
      }
      this.recorder.observeIngestEvent({
        type: "completed",
        manifest: record.manifest,
        uploadId: record.transport.uploadId
      });
      if (checkpoint.status === "uploaded_unverified" || checkpoint.status === "verification_failed" ||
          checkpoint.status === "verifying") {
        this.transition({
          status: "uploaded_unverified",
          manifest: record.manifest,
          allowedActions: ["verify", "stop"]
        });
        return await this.runVerification();
      }
      if (checkpoint.verification?.status !== "verified") {
        return this.fail("verification_failed", ["workflow.checkpoint_invalid"], "terminal", "uploaded_unverified");
      }
      this.verification = checkpoint.verification;
      this.recorder.recordVerification({
        status: "verified",
        verifierCategory: this.options.verifier.category,
        expectedEvidenceCategories: checkpoint.verification.expectedEvidenceCategories,
        observedEvidenceCategories: checkpoint.verification.observedEvidenceCategories,
        verifiedAt: checkpoint.verification.checkedAt
      });
      if (isEvidencePendingStatus(checkpoint.status)) {
        this.transition({
          status: "verified",
          manifest: record.manifest,
          verification: checkpoint.verification,
          allowedActions: ["persist_evidence", "stop"]
        });
        return await this.runInitialEvidencePersistence();
      }
      if (!checkpoint.evidenceId || !checkpoint.evidenceRevision) {
        return this.fail("evidence_persistence_failed", ["workflow.checkpoint_invalid"], "terminal", "verified");
      }
      const evidence = await this.options.evidenceSink.get({
        evidenceId: checkpoint.evidenceId,
        revision: checkpoint.evidenceRevision
      });
      if (!evidence) {
        return this.reconciliationRequired("evidence_persistence", "verified");
      }
      const evidenceValidation = await validateIngestEvidenceBundle(evidence.bundle, {
        manifest: record.manifest,
        provenance: evidence.provenance
      });
      if (!evidenceValidation.ok || evidence.bundle.id !== checkpoint.evidenceId ||
          evidence.bundle.revision !== checkpoint.evidenceRevision ||
          !safeReference(evidence.reference)) {
        return this.fail(
          "evidence_persistence_failed",
          ["workflow.evidence_bundle_invalid"],
          "terminal",
          "verified"
        );
      }
      this.provenance = evidence.provenance;
      this.bundle = evidence.bundle;
      this.evidenceId = evidence.bundle.id;
      this.evidenceReference = evidence.reference;
      this.preservationOutcome = checkpoint.preservationOutcome;
      if (checkpoint.status === "preserved" && evidence.bundle.preservation.status === "preserved") {
        return this.transition({
          status: "preserved",
          terminal: true,
          bundle: evidence.bundle,
          evidenceReference: evidence.reference,
          allowedActions: []
        });
      }
      this.transition({
        status: "evidence_persisted",
        terminal: false,
        preservation: { status: "pending" },
        bundle: evidence.bundle,
        evidenceReference: evidence.reference,
        allowedActions: ["preserve", "stop"]
      });
      if (checkpoint.status === "evidence_finalization_failed" && checkpoint.preservationOutcome) {
        return await this.finalizePreservation(checkpoint.preservationOutcome);
      }
      return await this.runPreservation();
    } catch (error) {
      return this.fail("preparation_failed", [toWorkflowIssueCode(error)], "terminal");
    }
  }

  private async runUpload(resumeRecordId?: string): Promise<VerifiedIngestRunResult> {
    const manifest = this.requireManifest();
    const evaluation = this.requireEvaluation();
    const recorder = this.requireRecorder();
    this.operationId("upload");
    this.emitAttempt("upload");
    this.transition({ status: "uploading", manifest, allowedActions: ["pause", "cancel"] });
    try {
      await this.persistCheckpoint("prepared");
    } catch {
      return this.reconciliationRequired("upload", "prepared");
    }
    const sessionBinding = evaluation.sessionBinding;
    if (!sessionBinding) throw new VerifiedIngestWorkflowError("workflow.profile_failed");
    this.session = createIngestSession(this.file, {
      ...this.options.session,
      resume: { ...this.options.session.resume, cleanup: "mark-complete" },
      manifest,
      domainProfile: sessionBinding,
      onEvent: (event) => {
        if (event.type === "resume:available" || event.type === "resume:checkpoint") {
          this.resumeRecordId = event.recordId;
        }
        recorder.observeIngestEvent(event);
      },
      onSnapshot: (snapshot) => this.observeUploadSnapshot(snapshot),
      onObserverError: (failure) => {
        this.provenanceObserverFailed = true;
        this.observeFailure({ observer: "event", error: failure.error });
      }
    });
    try {
      const completedManifest = resumeRecordId
        ? await this.session.resume(resumeRecordId)
        : await this.session.start();
      if (this.provenanceObserverFailed) {
        return this.fail("upload_failed", ["workflow.observer_failed"], "terminal", "prepared");
      }
      this.manifest = completedManifest;
      this.transition({
        status: "uploaded_unverified",
        manifest: completedManifest,
        allowedActions: ["verify", "stop"]
      });
      await this.persistCheckpoint("uploaded_unverified");
      return await this.runVerification();
    } catch (error) {
      const snapshot = this.session.getSnapshot();
      if (snapshot?.status === "paused") {
        const state = this.transition({
          status: "paused",
          lastAuthoritativeState: "prepared",
          allowedActions: ["resume", "cancel"]
        });
        await this.persistCheckpoint("prepared");
        return state;
      }
      if (snapshot?.status === "canceled") {
        return this.transition({ status: "canceled", terminal: true, allowedActions: [] });
      }
      return this.fail("upload_failed", [toWorkflowIssueCode(error)], "restart_upload", "prepared");
    }
  }

  private async runVerification(): Promise<VerifiedIngestRunResult> {
    const manifest = this.requireManifest();
    const recorder = this.requireRecorder();
    this.transition({ status: "verifying", manifest, allowedActions: [] });
    this.emitAttempt("verification");
    try {
      const operationId = this.operationId("verification");
      let verification: WorkflowVerificationResult;
      try {
        verification = await this.options.verifier.verify({
          manifest,
          operationId,
          signal: this.abortController.signal
        });
      } catch {
        if (!this.options.verifier.reconcile) {
          return this.reconciliationRequired("verification", "uploaded_unverified");
        }
        const reconciled = await this.options.verifier.reconcile({
          manifest,
          operationId,
          signal: this.abortController.signal
        });
        if (reconciled === "not_found") {
          return this.fail("verification_failed", ["workflow.verification_failed"], "retry", "uploaded_unverified");
        }
        verification = reconciled;
      }
      if (isTerminal(this.state)) return this.state;
      recorder.recordVerification({
        status: verification.status,
        verifierCategory: this.options.verifier.category,
        ...(verification.status === "verified"
          ? {
              expectedEvidenceCategories: verification.expectedEvidenceCategories,
              observedEvidenceCategories: verification.observedEvidenceCategories,
              verifiedAt: verification.checkedAt
            }
          : {
              issueCodes: verification.issueCodes,
              verifiedAt: verification.checkedAt
            })
      });
      if (verification.status !== "verified") {
        return this.fail(
          "verification_failed",
          ["workflow.verification_failed"],
          verification.retryable ? "retry" : "terminal",
          "uploaded_unverified"
        );
      }
      this.verification = verification;
      this.transition({
        status: "verified",
        manifest,
        verification,
        allowedActions: ["persist_evidence", "stop"]
      });
      await this.persistCheckpoint("verified");
      return await this.runInitialEvidencePersistence();
    } catch (error) {
      return this.fail(
        "verification_failed",
        [toWorkflowIssueCode(error)],
        "retry",
        "uploaded_unverified"
      );
    }
  }

  private async runInitialEvidencePersistence(): Promise<VerifiedIngestRunResult> {
    const manifest = this.requireManifest();
    const evaluation = this.requireEvaluation();
    const verification = this.requireVerification();
    const recorder = this.requireRecorder();
    this.transition({
      status: "persisting_evidence",
      lastAuthoritativeState: "verified",
      allowedActions: []
    });
    this.emitAttempt("evidence_persistence");
    try {
      const provenance = await recorder.seal();
      this.provenance = provenance;
      const evidenceId = this.evidenceId ?? this.id("evidence");
      this.evidenceId = evidenceId;
      const operationId = this.operationId("evidence_persistence");
      const preservation = this.options.preservation
        ? { status: "pending" as const }
        : { status: "not_requested" as const };
      const bundle = this.bundle?.id === evidenceId && this.bundle.revision === 1
        ? this.bundle
        : await createIngestEvidenceBundle({
            id: evidenceId,
            revision: 1,
            workflowId: this.workflowId,
            manifest,
            profileEvaluation: evaluation,
            verification,
            verifierCategory: safeCategory(this.options.verifier.category),
            provenance,
            evidenceOperationId: operationId,
            transportCategory: safeCategory(this.options.session.transport.capabilities?.name),
            preservation,
            terminal: this.options.preservation
              ? { classification: "nonterminal", state: "evidence_persisted", lastAuthoritativeState: "evidence_persisted" }
              : { classification: "success", state: "evidence_persisted", lastAuthoritativeState: "evidence_persisted" },
            stages: [
              {
                stage: "upload",
                operationId: this.operationId("upload"),
                attempts: this.attempts.get("upload") ?? 1,
                outcome: "succeeded",
                issueCodes: []
              },
              {
                stage: "verification",
                operationId: this.operationId("verification"),
                attempts: this.attempts.get("verification") ?? 1,
                outcome: "succeeded",
                issueCodes: []
              },
              {
                stage: "evidence_persistence",
                operationId,
                attempts: this.attempts.get("evidence_persistence") ?? 1,
                outcome: "succeeded",
                issueCodes: []
              }
            ],
            createdAt: this.now()
          });
      this.bundle = bundle;
      const validation = await validateIngestEvidenceBundle(bundle, { manifest, provenance });
      if (!validation.ok) {
        throw new VerifiedIngestWorkflowError("workflow.evidence_bundle_invalid");
      }
      let receipt: { status: "persisted"; reference: string; revision: number };
      try {
        receipt = await this.options.evidenceSink.persist({
          operationId,
          evidenceId,
          revision: 1,
          expectedRevision: "absent",
          provenance,
          bundle
        });
      } catch {
        if (!this.options.evidenceSink.reconcile) {
          return this.reconciliationRequired("evidence_persistence", "verified");
        }
        const reconciled = await this.options.evidenceSink.reconcile({
          operationId,
          evidenceId,
          revision: 1
        });
        if (reconciled.status === "not_found") {
          return this.fail("evidence_persistence_failed", ["workflow.evidence_persistence_failed"], "retry", "verified");
        }
        receipt = reconciled;
      }
      if (isTerminal(this.state)) return this.state;
      if (receipt.revision !== 1 || !safeReference(receipt.reference)) {
        throw new VerifiedIngestWorkflowError("workflow.evidence_persistence_failed", true);
      }
      this.bundle = bundle;
      this.evidenceReference = receipt.reference;
      if (!this.options.preservation) {
        const state = this.transition({
          status: "evidence_persisted",
          terminal: true,
          preservation: { status: "not_requested" },
          bundle,
          evidenceReference: receipt.reference,
          allowedActions: []
        });
        await this.persistCheckpoint("evidence_persisted");
        await this.cleanupResumeRecord();
        this.emit({ type: "workflow:completed", status: "evidence_persisted" });
        return state;
      }
      this.transition({
        status: "evidence_persisted",
        terminal: false,
        preservation: { status: "pending" },
        bundle,
        evidenceReference: receipt.reference,
        allowedActions: ["preserve", "stop"]
      });
      await this.persistCheckpoint("evidence_persisted");
      return await this.runPreservation();
    } catch (error) {
      return this.fail(
        "evidence_persistence_failed",
        [toWorkflowIssueCode(error) === "workflow.internal_failed"
          ? "workflow.evidence_persistence_failed"
          : toWorkflowIssueCode(error)],
        "retry",
        "verified"
      );
    }
  }

  private async runPreservation(): Promise<VerifiedIngestRunResult> {
    const adapter = this.options.preservation;
    const manifest = this.requireManifest();
    const provenance = this.requireProvenance();
    const bundle = this.requireBundle();
    if (!adapter) throw new VerifiedIngestWorkflowError("workflow.transition_invalid");
    this.transition({ status: "preserving", lastAuthoritativeState: "evidence_persisted", allowedActions: [] });
    this.emitAttempt("preservation");
    const operationId = this.operationId("preservation");
    let outcome: PreservationHandoffResult;
    try {
      try {
        outcome = await adapter.handoff({
          operationId,
          manifest,
          provenance,
          evidence: bundle,
          signal: this.abortController.signal
        });
      } catch {
        if (!adapter.reconcile) {
          return this.reconciliationRequired("preservation", "evidence_persisted");
        }
        const reconciled = await adapter.reconcile({
          operationId,
          workflowId: this.workflowId,
          signal: this.abortController.signal
        });
        if (reconciled.status === "not_found") {
          return this.fail("preservation_failed", ["workflow.preservation_failed"], "retry", "evidence_persisted");
        }
        outcome = reconciled;
      }
      this.preservationOutcome = outcome;
    } catch {
      return this.reconciliationRequired("preservation", "evidence_persisted");
    }
    if (isTerminal(this.state)) return this.state;
    if (outcome.status === "failed" && outcome.retryable) {
      return this.fail(
        "preservation_failed",
        ["workflow.preservation_failed"],
        "retry",
        "evidence_persisted"
      );
    }
    return await this.finalizePreservation(outcome);
  }

  private async finalizePreservation(outcome: PreservationHandoffResult): Promise<VerifiedIngestRunResult> {
    const prior = this.requireBundle();
    const provenance = this.requireProvenance();
    this.transition({
      status: "finalizing_evidence",
      lastAuthoritativeState: "evidence_persisted",
      preservationOutcome: outcome,
      pendingBundleRevision: 2,
      allowedActions: []
    });
    this.emitAttempt("evidence_finalization");
    try {
      const operationId = this.operationId("evidence_finalization");
      const finalBundle = this.pendingFinalBundle ?? await createIngestEvidenceBundle({
        id: prior.id,
        revision: 2,
        workflowId: this.workflowId,
        manifest: this.requireManifest(),
        profileEvaluation: this.requireEvaluation(),
        verification: this.requireVerification(),
        verifierCategory: safeCategory(this.options.verifier.category),
        provenance,
        evidenceOperationId: this.operationId("evidence_persistence"),
        transportCategory: prior.transfer.transportCategory,
        preservation: outcome,
        terminal: {
          classification: outcome.status === "preserved" ? "success" : "failure",
          state: outcome.status === "preserved" ? "preserved" : "preservation_failed",
          lastAuthoritativeState: outcome.status === "preserved" ? "preserved" : "evidence_persisted"
        },
        stages: [
          ...prior.stages,
          {
            stage: "preservation",
            operationId: this.operationId("preservation"),
            attempts: this.attempts.get("preservation") ?? 1,
            outcome: outcome.status === "preserved" ? "succeeded" : "failed",
            issueCodes: outcome.status === "failed" ? outcome.issueCodes : []
          },
          {
            stage: "evidence_finalization",
            operationId,
            attempts: this.attempts.get("evidence_finalization") ?? 1,
            outcome: "succeeded",
            issueCodes: []
          }
        ],
        createdAt: prior.createdAt
      });
      this.pendingFinalBundle = finalBundle;
      const validation = await validateIngestEvidenceBundle(finalBundle, {
        manifest: this.requireManifest(),
        provenance
      });
      if (!validation.ok) {
        throw new VerifiedIngestWorkflowError("workflow.evidence_bundle_invalid");
      }
      let receipt: { status: "persisted"; reference: string; revision: number };
      try {
        receipt = await this.options.evidenceSink.persist({
          operationId,
          evidenceId: prior.id,
          revision: 2,
          expectedRevision: 1,
          provenance,
          bundle: finalBundle
        });
      } catch {
        if (!this.options.evidenceSink.reconcile) {
          return this.reconciliationRequired("evidence_finalization", "evidence_persisted");
        }
        const reconciled = await this.options.evidenceSink.reconcile({
          operationId,
          evidenceId: prior.id,
          revision: 2
        });
        if (reconciled.status === "not_found") {
          return this.fail(
            "evidence_finalization_failed",
            ["workflow.evidence_finalization_failed"],
            "retry",
            "evidence_persisted"
          );
        }
        receipt = reconciled;
      }
      if (isTerminal(this.state)) return this.state;
      if (receipt.revision !== 2 || !safeReference(receipt.reference)) {
        throw new VerifiedIngestWorkflowError("workflow.evidence_finalization_failed", true);
      }
      this.bundle = finalBundle;
      this.pendingFinalBundle = undefined;
      this.evidenceReference = receipt.reference;
      if (outcome.status === "failed") {
        return this.fail("preservation_failed", ["workflow.preservation_failed"], outcome.retryable ? "retry" : "terminal", "evidence_persisted");
      }
      const state = this.transition({
        status: "preserved",
        terminal: true,
        bundle: finalBundle,
        evidenceReference: receipt.reference,
        allowedActions: []
      });
      await this.persistCheckpoint("preserved");
      await this.cleanupResumeRecord();
      this.emit({ type: "workflow:completed", status: "preserved" });
      return state;
    } catch {
      return this.fail(
        "evidence_finalization_failed",
        ["workflow.evidence_finalization_failed"],
        "retry",
        "evidence_persisted"
      );
    }
  }

  private observeUploadSnapshot(snapshot: UploadSessionSnapshot): void {
    if (this.state.status !== "uploading" || !this.manifest) return;
    this.transition({
      status: "uploading",
      manifest: this.manifest,
      snapshot,
      allowedActions: ["pause", "cancel"]
    });
  }

  private transition<T extends WorkflowStateInput>(next: T): TransitionedState<T> {
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

  private async fail(
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

  private async persistCheckpoint(authority: StableWorkflowStatus): Promise<void> {
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

  private operationId(stage: WorkflowStage): string {
    let value = this.operationIds.get(stage);
    if (!value) {
      value = this.id("operation");
      this.operationIds.set(stage, value);
    }
    return value;
  }

  private emitAttempt(stage: WorkflowStage): void {
    const attempt = (this.attempts.get(stage) ?? 0) + 1;
    this.attempts.set(stage, attempt);
    this.emit({ type: "workflow:stage-attempt", stage, attempt });
  }

  private emitState(): void {
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

  private emit(event: VerifiedIngestWorkflowEvent): void {
    try {
      this.options.onEvent?.(event);
    } catch (error) {
      this.observeFailure({ observer: "event", error });
    }
  }

  private observeFailure(failure: { observer: "event" | "subscriber"; error: unknown }): void {
    try {
      this.options.onObserverError?.(failure);
    } catch {
      // Observer failures are intentionally isolated from workflow authority.
    }
  }

  private id(kind: "workflow" | "evidence" | "operation"): string {
    if (this.options.createId) return this.options.createId(kind);
    const suffix = globalThis.crypto?.randomUUID?.() ??
      `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    return `${kind}-${suffix}`;
  }

  private now(): string {
    return (this.options.now?.() ?? new Date()).toISOString();
  }

  private requireManifest(): IngestManifest {
    if (!this.manifest) throw new VerifiedIngestWorkflowError("workflow.internal_failed");
    return this.manifest;
  }

  private requireEvaluation(): DomainProfileEvaluation {
    if (!this.evaluation?.sessionBinding) throw new VerifiedIngestWorkflowError("workflow.internal_failed");
    return this.evaluation;
  }

  private requireRecorder(): IngestProvenanceRecorder {
    if (!this.recorder) throw new VerifiedIngestWorkflowError("workflow.internal_failed");
    return this.recorder;
  }

  private requireVerification(): WorkflowVerificationResult & { status: "verified" } {
    if (!this.verification) throw new VerifiedIngestWorkflowError("workflow.internal_failed");
    return this.verification;
  }

  private requireProvenance(): IngestProvenanceArtifactV1 {
    if (!this.provenance) throw new VerifiedIngestWorkflowError("workflow.internal_failed");
    return this.provenance;
  }

  private requireBundle(): IngestEvidenceBundleV1 {
    if (!this.bundle) throw new VerifiedIngestWorkflowError("workflow.internal_failed");
    return this.bundle;
  }

  private createRecorder(
    manifest: IngestManifest,
    evaluation: DomainProfileEvaluation
  ): IngestProvenanceRecorder {
    const recorder = createIngestProvenanceRecorder({
      manifest,
      policy: { id: evaluation.profile.name, version: evaluation.profile.version },
      transport: {
        category: safeCategory(this.options.session.transport.capabilities?.name),
        ...(this.options.session.transport.capabilities
          ? { capabilities: this.options.session.transport.capabilities }
          : {})
      },
      correlationId: this.workflowId,
      ...(this.options.now ? { now: this.options.now } : {})
    });
    recorder.recordPolicyEvaluation({
      id: evaluation.profile.name,
      version: evaluation.profile.version,
      result: evaluation.result === "passed_with_warnings" ? "passed_with_warnings" : "passed",
      failedRuleCodes: evaluation.failedRuleCodes,
      warningRuleCodes: evaluation.warningRuleCodes,
      occurredAt: evaluation.evaluatedAt
    });
    return recorder;
  }

  private async cleanupResumeRecord(): Promise<void> {
    if (this.options.session.resume.cleanup === "mark-complete" || !this.resumeRecordId) return;
    try {
      await this.options.session.resume.store.delete(this.resumeRecordId);
    } catch (error) {
      this.observeFailure({ observer: "event", error });
    }
  }

  private async reconciliationRequired(
    stage: WorkflowStage,
    authority?: StableWorkflowStatus
  ): Promise<VerifiedIngestRunResult> {
    const state = this.transition({
      status: "reconciliation_required",
      stage,
      ...(authority ? { lastAuthoritativeState: authority } : {}),
      issueCodes: ["workflow.reconciliation_required"],
      allowedActions: ["retry", "stop"]
    });
    this.emit({
      type: "workflow:reconciliation-required",
      stage,
      code: "workflow.reconciliation_required"
    });
    if (authority) {
      try {
        await this.persistCheckpoint(authority);
      } catch {
        // The reconciliation state remains authoritative in memory; a stale writer never overwrites storage.
      }
    }
    return state;
  }
}

function stageFromFailure(status: WorkflowFailedState["status"]): WorkflowStage {
  switch (status) {
    case "preparation_failed": return "preparation";
    case "upload_failed": return "upload";
    case "verification_failed": return "verification";
    case "evidence_persistence_failed": return "evidence_persistence";
    case "preservation_failed": return "preservation";
    case "evidence_finalization_failed": return "evidence_finalization";
  }
}

function safeCategory(value: string | undefined): string {
  return value && /^[a-z0-9][a-z0-9._-]{0,127}$/.test(value) ? value : "application";
}

function safeReference(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

function lastAuthority(status: VerifiedIngestWorkflowState["status"]): StableWorkflowStatus | undefined {
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

function isTerminal(state: VerifiedIngestWorkflowState): state is VerifiedIngestTerminalState {
  return ("terminal" in state && state.terminal === true) ||
    ("retryability" in state && state.retryability === "terminal");
}

function isUploadRecoveryStatus(status: VerifiedIngestWorkflowState["status"]): boolean {
  return status === "prepared" || status === "uploading" || status === "paused" ||
    status === "upload_failed";
}

function isEvidencePendingStatus(status: VerifiedIngestWorkflowState["status"]): boolean {
  return status === "verified" || status === "persisting_evidence" ||
    status === "evidence_persistence_failed";
}

type WorkflowStateInput = VerifiedIngestWorkflowState extends infer State
  ? State extends WorkflowStateBase
    ? Omit<State, "workflowId" | "revision" | "updatedAt">
    : never
  : never;

type TransitionedState<T extends WorkflowStateInput> = T & Pick<
  WorkflowStateBase,
  "workflowId" | "revision" | "updatedAt"
>;
