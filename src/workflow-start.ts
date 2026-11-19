import { validateIngestEvidenceBundle } from "./evidence-bundle.js";
import { calculateChecksum } from "./checksum.js";
import { createManifest } from "./manifest.js";
import { createDomainProfileReference, domainProfileReferencesEqual, evaluateDomainValidationProfile } from "./profiles.js";
import { createIngestProvenanceRecorder } from "./provenance.js";
import { toWorkflowIssueCode } from "./workflow-errors.js";
import { parseWorkflowCheckpoint, restoreWorkflowOperationIds, workflowCheckpointMatchesSource } from "./workflow-checkpoint.js";
import type { VerifiedIngestRunResult, WorkflowStage } from "./workflow-types.js";
import { safeCategory, safeReference, isUploadRecoveryStatus, isEvidencePendingStatus } from "./workflow-runtime.js";
import { runUpload, runVerification, createRecorder, reconciliationRequired } from "./workflow-upload.js";
import { runInitialEvidencePersistence, runPreservation, finalizePreservation } from "./workflow-evidence.js";
import type { DefaultVerifiedIngestWorkflow } from "./workflow-runtime.js";

export async function runStart(wf: DefaultVerifiedIngestWorkflow): Promise<VerifiedIngestRunResult> {
  try {
    const manifest = await createManifest(wf.file, {
      ...wf.options.session,
      checksum: {
        ...wf.options.session.checksum,
        algorithm: "sha256",
        required: true
      }
    });
    wf.manifest = manifest;
    if (!manifest.original.checksum) {
      return wf.fail("preparation_failed", ["workflow.source_identity_missing"], "terminal");
    }
    const evaluation = await evaluateDomainValidationProfile({
      profile: wf.options.profile.definition,
      manifest,
      ...(wf.options.profile.structuralEvidence
        ? { structuralEvidence: wf.options.profile.structuralEvidence }
        : {}),
      ...(wf.options.profile.externalEvidence
        ? { externalEvidence: wf.options.profile.externalEvidence }
        : {}),
      evaluatedAt: wf.now()
    });
    wf.evaluation = evaluation;
    if (!evaluation.sessionBinding) {
      return wf.fail("preparation_failed", ["workflow.profile_failed"], "terminal");
    }
    const recorderOptions = {
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
    };
    wf.recorder = createIngestProvenanceRecorder(recorderOptions);
    wf.recorder.recordPolicyEvaluation({
      id: evaluation.profile.name,
      version: evaluation.profile.version,
      result: evaluation.result === "passed_with_warnings" ? "passed_with_warnings" : "passed",
      failedRuleCodes: evaluation.failedRuleCodes,
      warningRuleCodes: evaluation.warningRuleCodes,
      occurredAt: evaluation.evaluatedAt
    });
    wf.transition({
      status: "prepared",
      manifest,
      profileEvaluation: evaluation,
      allowedActions: ["start_upload", "cancel"]
    });
    await wf.persistCheckpoint("prepared");
    return await runUpload(wf);
  } catch (error) {
    return wf.fail("preparation_failed", [toWorkflowIssueCode(error)], "terminal");
  }
}

export async function runResume(wf: DefaultVerifiedIngestWorkflow, workflowId: string): Promise<VerifiedIngestRunResult> {
  try {
    const stored = await wf.options.checkpointStore.get(workflowId);
    if (!stored) return wf.fail("preparation_failed", ["workflow.checkpoint_invalid"], "terminal");
    const checkpoint = parseWorkflowCheckpoint(stored);
    wf.workflowId = workflowId;
    wf.stateRevision = checkpoint.revision;
    wf.checkpointRevision = checkpoint.revision;
    wf.evidenceId = checkpoint.evidenceId;
    const selectedProfile = createDomainProfileReference(wf.options.profile.definition);
    if (!domainProfileReferencesEqual(checkpoint.profile, selectedProfile)) {
      return wf.fail("preparation_failed", ["workflow.profile_mismatch"], "terminal");
    }
    if (!checkpoint.resumeRecordId || !checkpoint.sourceIdentity) {
      return wf.fail("upload_failed", ["workflow.checkpoint_invalid"], "terminal");
    }
    const checksum = await calculateChecksum(wf.file, {
      ...wf.options.session.checksum,
      algorithm: "sha256",
      required: true
    });
    if (!workflowCheckpointMatchesSource(checkpoint, {
      sizeBytes: wf.file.size,
      checksum: checksum.value
    })) {
      return wf.fail("preparation_failed", ["workflow.source_mismatch"], "terminal");
    }
    const record = await wf.options.session.resume.store.get(checkpoint.resumeRecordId);
    if (!record || record.manifest.id !== checkpoint.manifestId) {
      return wf.fail("upload_failed", ["workflow.checkpoint_invalid"], "terminal");
    }
    wf.resumeRecordId = checkpoint.resumeRecordId;
    wf.operationIds.clear();
    for (const [stage, operationId] of restoreWorkflowOperationIds(checkpoint)) {
      wf.operationIds.set(stage, operationId);
    }
    wf.attempts.clear();
    for (const [stage, attempt] of Object.entries(checkpoint.attempts)) {
      if (attempt !== undefined) wf.attempts.set(stage as WorkflowStage, attempt);
    }
    wf.manifest = record.manifest;
    const evaluation = await evaluateDomainValidationProfile({
      profile: wf.options.profile.definition,
      manifest: record.manifest,
      ...(wf.options.profile.structuralEvidence
        ? { structuralEvidence: wf.options.profile.structuralEvidence }
        : {}),
      ...(wf.options.profile.externalEvidence
        ? { externalEvidence: wf.options.profile.externalEvidence }
        : {}),
      evaluatedAt: wf.now()
    });
    if (!evaluation.sessionBinding) {
      return wf.fail("preparation_failed", ["workflow.profile_failed"], "terminal");
    }
    wf.evaluation = evaluation;
    wf.recorder = createRecorder(wf, record.manifest, evaluation);
    if (isUploadRecoveryStatus(checkpoint.status)) {
      wf.transition({
        status: "prepared",
        manifest: record.manifest,
        profileEvaluation: evaluation,
        allowedActions: ["start_upload", "cancel"]
      });
      return await runUpload(wf, checkpoint.resumeRecordId);
    }
    wf.recorder.observeIngestEvent({
      type: "completed",
      manifest: record.manifest,
      uploadId: record.transport.uploadId
    });
    if (checkpoint.status === "uploaded_unverified" || checkpoint.status === "verification_failed" ||
        checkpoint.status === "verifying") {
      wf.transition({
        status: "uploaded_unverified",
        manifest: record.manifest,
        allowedActions: ["verify", "stop"]
      });
      return await runVerification(wf);
    }
    if (checkpoint.verification?.status !== "verified") {
      return wf.fail("verification_failed", ["workflow.checkpoint_invalid"], "terminal", "uploaded_unverified");
    }
    wf.verification = checkpoint.verification;
    wf.recorder.recordVerification({
      status: "verified",
      verifierCategory: wf.options.verifier.category,
      expectedEvidenceCategories: checkpoint.verification.expectedEvidenceCategories,
      observedEvidenceCategories: checkpoint.verification.observedEvidenceCategories,
      verifiedAt: checkpoint.verification.checkedAt
    });
    if (isEvidencePendingStatus(checkpoint.status)) {
      wf.transition({
        status: "verified",
        manifest: record.manifest,
        verification: checkpoint.verification,
        allowedActions: ["persist_evidence", "stop"]
      });
      return await runInitialEvidencePersistence(wf);
    }
    if (!checkpoint.evidenceId || !checkpoint.evidenceRevision) {
      return wf.fail("evidence_persistence_failed", ["workflow.checkpoint_invalid"], "terminal", "verified");
    }
    const evidence = await wf.options.evidenceSink.get({
      evidenceId: checkpoint.evidenceId,
      revision: checkpoint.evidenceRevision
    });
    if (!evidence) {
      return reconciliationRequired(wf, "evidence_persistence", "verified");
    }
    const evidenceValidation = await validateIngestEvidenceBundle(evidence.bundle, {
      manifest: record.manifest,
      provenance: evidence.provenance
    });
    if (!evidenceValidation.ok || evidence.bundle.id !== checkpoint.evidenceId ||
        evidence.bundle.revision !== checkpoint.evidenceRevision ||
        !safeReference(evidence.reference)) {
      return wf.fail(
        "evidence_persistence_failed",
        ["workflow.evidence_bundle_invalid"],
        "terminal",
        "verified"
      );
    }
    wf.provenance = evidence.provenance;
    wf.bundle = evidence.bundle;
    wf.evidenceId = evidence.bundle.id;
    wf.evidenceReference = evidence.reference;
    wf.preservationOutcome = checkpoint.preservationOutcome;
    if (checkpoint.status === "preserved" && evidence.bundle.preservation.status === "preserved") {
      return wf.transition({
        status: "preserved",
        terminal: true,
        bundle: evidence.bundle,
        evidenceReference: evidence.reference,
        allowedActions: []
      });
    }
    wf.transition({
      status: "evidence_persisted",
      terminal: false,
      preservation: { status: "pending" },
      bundle: evidence.bundle,
      evidenceReference: evidence.reference,
      allowedActions: ["preserve", "stop"]
    });
    if (checkpoint.status === "evidence_finalization_failed" && checkpoint.preservationOutcome) {
      return await finalizePreservation(wf, checkpoint.preservationOutcome);
    }
    return await runPreservation(wf);
  } catch (error) {
    return wf.fail("preparation_failed", [toWorkflowIssueCode(error)], "terminal");
  }
}
