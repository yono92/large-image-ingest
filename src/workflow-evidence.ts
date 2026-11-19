import { createIngestEvidenceBundle, validateIngestEvidenceBundle } from "./evidence-bundle.js";
import { VerifiedIngestWorkflowError, toWorkflowIssueCode } from "./workflow-errors.js";
import type { PreservationHandoffResult, VerifiedIngestRunResult } from "./workflow-types.js";
import { safeCategory, safeReference, isTerminal } from "./workflow-runtime.js";
import { cleanupResumeRecord, reconciliationRequired } from "./workflow-upload.js";
import type { DefaultVerifiedIngestWorkflow } from "./workflow-runtime.js";

export async function runInitialEvidencePersistence(wf: DefaultVerifiedIngestWorkflow): Promise<VerifiedIngestRunResult> {
  const manifest = wf.requireManifest();
  const evaluation = wf.requireEvaluation();
  const verification = wf.requireVerification();
  const recorder = wf.requireRecorder();
  wf.transition({
    status: "persisting_evidence",
    lastAuthoritativeState: "verified",
    allowedActions: []
  });
  wf.emitAttempt("evidence_persistence");
  try {
    const provenance = await recorder.seal();
    wf.provenance = provenance;
    const evidenceId = wf.evidenceId ?? wf.id("evidence");
    wf.evidenceId = evidenceId;
    const operationId = wf.operationId("evidence_persistence");
    const preservation = wf.options.preservation
      ? { status: "pending" as const }
      : { status: "not_requested" as const };
    const bundle = wf.bundle?.id === evidenceId && wf.bundle.revision === 1
      ? wf.bundle
      : await createIngestEvidenceBundle({
          id: evidenceId,
          revision: 1,
          workflowId: wf.workflowId,
          manifest,
          profileEvaluation: evaluation,
          verification,
          verifierCategory: safeCategory(wf.options.verifier.category),
          provenance,
          evidenceOperationId: operationId,
          transportCategory: safeCategory(wf.options.session.transport.capabilities?.name),
          preservation,
          terminal: wf.options.preservation
            ? { classification: "nonterminal", state: "evidence_persisted", lastAuthoritativeState: "evidence_persisted" }
            : { classification: "success", state: "evidence_persisted", lastAuthoritativeState: "evidence_persisted" },
          stages: [
            {
              stage: "upload",
              operationId: wf.operationId("upload"),
              attempts: wf.attempts.get("upload") ?? 1,
              outcome: "succeeded",
              issueCodes: []
            },
            {
              stage: "verification",
              operationId: wf.operationId("verification"),
              attempts: wf.attempts.get("verification") ?? 1,
              outcome: "succeeded",
              issueCodes: []
            },
            {
              stage: "evidence_persistence",
              operationId,
              attempts: wf.attempts.get("evidence_persistence") ?? 1,
              outcome: "succeeded",
              issueCodes: []
            }
          ],
          createdAt: wf.now()
        });
    wf.bundle = bundle;
    const validation = await validateIngestEvidenceBundle(bundle, { manifest, provenance });
    if (!validation.ok) {
      throw new VerifiedIngestWorkflowError("workflow.evidence_bundle_invalid");
    }
    let receipt: { status: "persisted"; reference: string; revision: number };
    try {
      receipt = await wf.options.evidenceSink.persist({
        operationId,
        evidenceId,
        revision: 1,
        expectedRevision: "absent",
        provenance,
        bundle
      });
    } catch {
      if (!wf.options.evidenceSink.reconcile) {
        return reconciliationRequired(wf, "evidence_persistence", "verified");
      }
      const reconciled = await wf.options.evidenceSink.reconcile({
        operationId,
        evidenceId,
        revision: 1
      });
      if (reconciled.status === "not_found") {
        return wf.fail("evidence_persistence_failed", ["workflow.evidence_persistence_failed"], "retry", "verified");
      }
      receipt = reconciled;
    }
    if (isTerminal(wf.state)) return wf.state;
    if (receipt.revision !== 1 || !safeReference(receipt.reference)) {
      throw new VerifiedIngestWorkflowError("workflow.evidence_persistence_failed", true);
    }
    wf.bundle = bundle;
    wf.evidenceReference = receipt.reference;
    if (!wf.options.preservation) {
      const state = wf.transition({
        status: "evidence_persisted",
        terminal: true,
        preservation: { status: "not_requested" },
        bundle,
        evidenceReference: receipt.reference,
        allowedActions: []
      });
      await wf.persistCheckpoint("evidence_persisted");
      await cleanupResumeRecord(wf);
      wf.emit({ type: "workflow:completed", status: "evidence_persisted" });
      return state;
    }
    wf.transition({
      status: "evidence_persisted",
      terminal: false,
      preservation: { status: "pending" },
      bundle,
      evidenceReference: receipt.reference,
      allowedActions: ["preserve", "stop"]
    });
    await wf.persistCheckpoint("evidence_persisted");
    return await runPreservation(wf);
  } catch (error) {
    return wf.fail(
      "evidence_persistence_failed",
      [toWorkflowIssueCode(error) === "workflow.internal_failed"
        ? "workflow.evidence_persistence_failed"
        : toWorkflowIssueCode(error)],
      "retry",
      "verified"
    );
  }
}

export async function runPreservation(wf: DefaultVerifiedIngestWorkflow): Promise<VerifiedIngestRunResult> {
  const adapter = wf.options.preservation;
  const manifest = wf.requireManifest();
  const provenance = wf.requireProvenance();
  const bundle = wf.requireBundle();
  if (!adapter) throw new VerifiedIngestWorkflowError("workflow.transition_invalid");
  wf.transition({ status: "preserving", lastAuthoritativeState: "evidence_persisted", allowedActions: [] });
  wf.emitAttempt("preservation");
  const operationId = wf.operationId("preservation");
  let outcome: PreservationHandoffResult;
  try {
    try {
      outcome = await adapter.handoff({
        operationId,
        manifest,
        provenance,
        evidence: bundle,
        signal: wf.abortController.signal
      });
    } catch {
      if (!adapter.reconcile) {
        return reconciliationRequired(wf, "preservation", "evidence_persisted");
      }
      const reconciled = await adapter.reconcile({
        operationId,
        workflowId: wf.workflowId,
        signal: wf.abortController.signal
      });
      if (reconciled.status === "not_found") {
        return wf.fail("preservation_failed", ["workflow.preservation_failed"], "retry", "evidence_persisted");
      }
      outcome = reconciled;
    }
    wf.preservationOutcome = outcome;
  } catch {
    return reconciliationRequired(wf, "preservation", "evidence_persisted");
  }
  if (isTerminal(wf.state)) return wf.state;
  if (outcome.status === "failed" && outcome.retryable) {
    return wf.fail(
      "preservation_failed",
      ["workflow.preservation_failed"],
      "retry",
      "evidence_persisted"
    );
  }
  return await finalizePreservation(wf, outcome);
}

export async function finalizePreservation(wf: DefaultVerifiedIngestWorkflow, outcome: PreservationHandoffResult): Promise<VerifiedIngestRunResult> {
  const prior = wf.requireBundle();
  const provenance = wf.requireProvenance();
  wf.transition({
    status: "finalizing_evidence",
    lastAuthoritativeState: "evidence_persisted",
    preservationOutcome: outcome,
    pendingBundleRevision: 2,
    allowedActions: []
  });
  wf.emitAttempt("evidence_finalization");
  try {
    const operationId = wf.operationId("evidence_finalization");
    const finalBundle = wf.pendingFinalBundle ?? await createIngestEvidenceBundle({
      id: prior.id,
      revision: 2,
      workflowId: wf.workflowId,
      manifest: wf.requireManifest(),
      profileEvaluation: wf.requireEvaluation(),
      verification: wf.requireVerification(),
      verifierCategory: safeCategory(wf.options.verifier.category),
      provenance,
      evidenceOperationId: wf.operationId("evidence_persistence"),
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
          operationId: wf.operationId("preservation"),
          attempts: wf.attempts.get("preservation") ?? 1,
          outcome: outcome.status === "preserved" ? "succeeded" : "failed",
          issueCodes: outcome.status === "failed" ? outcome.issueCodes : []
        },
        {
          stage: "evidence_finalization",
          operationId,
          attempts: wf.attempts.get("evidence_finalization") ?? 1,
          outcome: "succeeded",
          issueCodes: []
        }
      ],
      createdAt: prior.createdAt
    });
    wf.pendingFinalBundle = finalBundle;
    const validation = await validateIngestEvidenceBundle(finalBundle, {
      manifest: wf.requireManifest(),
      provenance
    });
    if (!validation.ok) {
      throw new VerifiedIngestWorkflowError("workflow.evidence_bundle_invalid");
    }
    let receipt: { status: "persisted"; reference: string; revision: number };
    try {
      receipt = await wf.options.evidenceSink.persist({
        operationId,
        evidenceId: prior.id,
        revision: 2,
        expectedRevision: 1,
        provenance,
        bundle: finalBundle
      });
    } catch {
      if (!wf.options.evidenceSink.reconcile) {
        return reconciliationRequired(wf, "evidence_finalization", "evidence_persisted");
      }
      const reconciled = await wf.options.evidenceSink.reconcile({
        operationId,
        evidenceId: prior.id,
        revision: 2
      });
      if (reconciled.status === "not_found") {
        return wf.fail(
          "evidence_finalization_failed",
          ["workflow.evidence_finalization_failed"],
          "retry",
          "evidence_persisted"
        );
      }
      receipt = reconciled;
    }
    if (isTerminal(wf.state)) return wf.state;
    if (receipt.revision !== 2 || !safeReference(receipt.reference)) {
      throw new VerifiedIngestWorkflowError("workflow.evidence_finalization_failed", true);
    }
    wf.bundle = finalBundle;
    wf.pendingFinalBundle = undefined;
    wf.evidenceReference = receipt.reference;
    if (outcome.status === "failed") {
      return wf.fail("preservation_failed", ["workflow.preservation_failed"], outcome.retryable ? "retry" : "terminal", "evidence_persisted");
    }
    const state = wf.transition({
      status: "preserved",
      terminal: true,
      bundle: finalBundle,
      evidenceReference: receipt.reference,
      allowedActions: []
    });
    await wf.persistCheckpoint("preserved");
    await cleanupResumeRecord(wf);
    wf.emit({ type: "workflow:completed", status: "preserved" });
    return state;
  } catch {
    return wf.fail(
      "evidence_finalization_failed",
      ["workflow.evidence_finalization_failed"],
      "retry",
      "evidence_persisted"
    );
  }
}
