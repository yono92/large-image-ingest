import { createIngestProvenanceRecorder } from "./provenance.js";
import { createIngestSession } from "./session.js";
import { VerifiedIngestWorkflowError, toWorkflowIssueCode } from "./workflow-errors.js";
import type {
  StableWorkflowStatus,
  VerifiedIngestRunResult,
  WorkflowStage,
  WorkflowVerificationResult
} from "./workflow-types.js";
import type { DomainProfileEvaluation } from "./profiles.js";
import type { IngestProvenanceRecorder } from "./provenance.js";
import type { IngestManifest } from "./types.js";
import { safeCategory, isTerminal } from "./workflow-runtime.js";
import { runInitialEvidencePersistence } from "./workflow-evidence.js";
import type { DefaultVerifiedIngestWorkflow } from "./workflow-runtime.js";

export async function runUpload(wf: DefaultVerifiedIngestWorkflow, resumeRecordId?: string): Promise<VerifiedIngestRunResult> {
  const manifest = wf.requireManifest();
  const evaluation = wf.requireEvaluation();
  const recorder = wf.requireRecorder();
  wf.operationId("upload");
  wf.emitAttempt("upload");
  wf.transition({ status: "uploading", manifest, allowedActions: ["pause", "cancel"] });
  try {
    await wf.persistCheckpoint("prepared");
  } catch {
    return reconciliationRequired(wf, "upload", "prepared");
  }
  const sessionBinding = evaluation.sessionBinding;
  if (!sessionBinding) throw new VerifiedIngestWorkflowError("workflow.profile_failed");
  wf.session = createIngestSession(wf.file, {
    ...wf.options.session,
    resume: { ...wf.options.session.resume, cleanup: "mark-complete" },
    manifest,
    domainProfile: sessionBinding,
    onEvent: (event) => {
      if (event.type === "resume:available" || event.type === "resume:checkpoint") {
        wf.resumeRecordId = event.recordId;
      }
      recorder.observeIngestEvent(event);
    },
    onSnapshot: (snapshot) => wf.observeUploadSnapshot(snapshot),
    onObserverError: (failure) => {
      wf.provenanceObserverFailed = true;
      wf.observeFailure({ observer: "event", error: failure.error });
    }
  });
  try {
    const completedManifest = resumeRecordId
      ? await wf.session.resume(resumeRecordId)
      : await wf.session.start();
    if (wf.provenanceObserverFailed) {
      return wf.fail("upload_failed", ["workflow.observer_failed"], "terminal", "prepared");
    }
    wf.manifest = completedManifest;
    wf.transition({
      status: "uploaded_unverified",
      manifest: completedManifest,
      allowedActions: ["verify", "stop"]
    });
    await wf.persistCheckpoint("uploaded_unverified");
    return await runVerification(wf);
  } catch (error) {
    const snapshot = wf.session.getSnapshot();
    if (snapshot?.status === "paused") {
      const state = wf.transition({
        status: "paused",
        lastAuthoritativeState: "prepared",
        allowedActions: ["resume", "cancel"]
      });
      await wf.persistCheckpoint("prepared");
      return state;
    }
    if (snapshot?.status === "canceled") {
      return wf.transition({ status: "canceled", terminal: true, allowedActions: [] });
    }
    return wf.fail("upload_failed", [toWorkflowIssueCode(error)], "restart_upload", "prepared");
  }
}

export async function runVerification(wf: DefaultVerifiedIngestWorkflow): Promise<VerifiedIngestRunResult> {
  const manifest = wf.requireManifest();
  const recorder = wf.requireRecorder();
  wf.transition({ status: "verifying", manifest, allowedActions: [] });
  wf.emitAttempt("verification");
  try {
    const operationId = wf.operationId("verification");
    let verification: WorkflowVerificationResult;
    try {
      verification = await wf.options.verifier.verify({
        manifest,
        operationId,
        signal: wf.abortController.signal
      });
    } catch {
      if (!wf.options.verifier.reconcile) {
        return reconciliationRequired(wf, "verification", "uploaded_unverified");
      }
      const reconciled = await wf.options.verifier.reconcile({
        manifest,
        operationId,
        signal: wf.abortController.signal
      });
      if (reconciled === "not_found") {
        return wf.fail("verification_failed", ["workflow.verification_failed"], "retry", "uploaded_unverified");
      }
      verification = reconciled;
    }
    if (isTerminal(wf.state)) return wf.state;
    recorder.recordVerification({
      status: verification.status,
      verifierCategory: wf.options.verifier.category,
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
      return wf.fail(
        "verification_failed",
        ["workflow.verification_failed"],
        verification.retryable ? "retry" : "terminal",
        "uploaded_unverified"
      );
    }
    wf.verification = verification;
    wf.transition({
      status: "verified",
      manifest,
      verification,
      allowedActions: ["persist_evidence", "stop"]
    });
    await wf.persistCheckpoint("verified");
    return await runInitialEvidencePersistence(wf);
  } catch (error) {
    return wf.fail(
      "verification_failed",
      [toWorkflowIssueCode(error)],
      "retry",
      "uploaded_unverified"
    );
  }
}

export function createRecorder(
  wf: DefaultVerifiedIngestWorkflow,
  manifest: IngestManifest,
  evaluation: DomainProfileEvaluation
): IngestProvenanceRecorder {
  const recorder = createIngestProvenanceRecorder({
    manifest,
    policy: { id: evaluation.profile.name, version: evaluation.profile.version },
    transport: {
      category: safeCategory(wf.options.session.transport.capabilities?.name),
      ...(wf.options.session.transport.capabilities
        ? { capabilities: wf.options.session.transport.capabilities }
        : {})
    },
    correlationId: wf.workflowId,
    ...(wf.options.now ? { now: wf.options.now } : {})
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

export async function cleanupResumeRecord(wf: DefaultVerifiedIngestWorkflow): Promise<void> {
  if (wf.options.session.resume.cleanup === "mark-complete" || !wf.resumeRecordId) return;
  try {
    await wf.options.session.resume.store.delete(wf.resumeRecordId);
  } catch (error) {
    wf.observeFailure({ observer: "event", error });
  }
}

export async function reconciliationRequired(
  wf: DefaultVerifiedIngestWorkflow,
  stage: WorkflowStage,
  authority?: StableWorkflowStatus
): Promise<VerifiedIngestRunResult> {
  const state = wf.transition({
    status: "reconciliation_required",
    stage,
    ...(authority ? { lastAuthoritativeState: authority } : {}),
    issueCodes: ["workflow.reconciliation_required"],
    allowedActions: ["retry", "stop"]
  });
  wf.emit({
    type: "workflow:reconciliation-required",
    stage,
    code: "workflow.reconciliation_required"
  });
  if (authority) {
    try {
      await wf.persistCheckpoint(authority);
    } catch {
      // The reconciliation state remains authoritative in memory; a stale writer never overwrites storage.
    }
  }
  return state;
}
