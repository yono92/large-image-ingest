// Part of coordinator.ts, split out to keep modules under 500 lines; public exports stay on coordinator.ts.
import type { IngestControllerState } from "../react-controller.js";
import type { ResumeCompatibilityResult, ResumeRecord } from "../types.js";
import type {
  CompletionVerificationResult,
  InspectionControlIntent,
  InspectionUiControls,
  InspectionUiPhase,
  RecoveryChoiceSummary,
  RecoveryCompatibility,
  SelectedInspectionSource,
  VerificationPresentation
} from "./types.js";
import { emptyControls } from "./coordinator-shared.js";

export function createSelectedSource(file: File, generation: number): SelectedInspectionSource {
  const source: SelectedInspectionSource = {
    file,
    selectionId: `selection-${generation}`,
    name: file.name,
    sizeBytes: file.size,
    mediaType: file.type || "application/octet-stream"
  };
  if (Number.isFinite(file.lastModified)) {
    return Object.freeze({ ...source, lastModified: file.lastModified });
  }
  return Object.freeze(source);
}

export function withoutFile(source: SelectedInspectionSource): Omit<SelectedInspectionSource, "file"> {
  const safe = {
    selectionId: source.selectionId,
    name: source.name,
    sizeBytes: source.sizeBytes,
    mediaType: source.mediaType
  };
  return source.lastModified === undefined ? safe : { ...safe, lastModified: source.lastModified };
}

export function projectRecoveryChoice(
  key: string,
  record: ResumeRecord,
  compatibility: RecoveryCompatibility
): RecoveryChoiceSummary {
  const choice: RecoveryChoiceSummary = {
    key,
    fileName: record.file.name,
    sizeBytes: record.file.sizeBytes,
    updatedAt: record.updatedAt,
    uploadedBytes: record.progress.uploadedBytes,
    totalBytes: record.chunking.totalBytes,
    compatibility
  };
  return record.transport.name ? { ...choice, transportLabel: record.transport.name } : choice;
}

export function normalizeCompatibility(result: ResumeCompatibilityResult): RecoveryCompatibility {
  if (result.status === "resumable" || result.status === "upgradeable") return "compatible";
  if (result.status === "expired") return "expired";
  if (result.status === "restart_only") return "restart_only";
  if (result.reason === "source_mismatch") return "file_mismatch";
  if (result.reason === "chunking_mismatch") return "chunking_mismatch";
  return "incompatible";
}

export function combineSignals(primary: AbortSignal, secondary?: AbortSignal): AbortSignal {
  if (!secondary || secondary === primary) return primary;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([primary, secondary]);
  const controller = new AbortController();
  const abort = (signal: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(signal.reason);
  };
  if (primary.aborted) abort(primary);
  else primary.addEventListener("abort", () => abort(primary), { once: true });
  if (secondary.aborted) abort(secondary);
  else secondary.addEventListener("abort", () => abort(secondary), { once: true });
  return controller.signal;
}

export function isRecoverableStatus(status: ResumeRecord["progress"]["status"]): boolean {
  return status === "active" || status === "paused" || status === "failed" || status === "expired";
}

export function derivePhase(
  source: SelectedInspectionSource | undefined,
  controller: IngestControllerState | undefined,
  requestedAction: InspectionControlIntent,
  verification: VerificationPresentation
): InspectionUiPhase {
  if (!source || !controller) return "empty";
  if (requestedAction === "pause" && (controller.status === "uploading" || controller.status === "resuming")) {
    return "pause_requested";
  }
  if (requestedAction === "cancel") return "cancel_requested";
  if (controller.status === "completed") {
    if (verification.status === "verified") return "verified";
    if (verification.status === "failed" || verification.status === "unavailable") return "verification_failed";
    return "transfer_completed";
  }
  if (controller.preparation?.phase === "preparing_identity") return "preparing_identity";
  if (controller.preparation?.phase === "creating_upload") return "creating_upload";
  switch (controller.status) {
    case "idle": return "selected";
    case "starting":
    case "validating": return "validating";
    case "creating": return "creating_upload";
    case "uploading": return "uploading";
    case "paused": return "paused";
    case "resuming": return "resuming";
    case "completing": return "completing";
    case "canceled": return "canceled";
    case "failed": return "failed";
  }
}

export function deriveControls(
  phase: InspectionUiPhase,
  controller: IngestControllerState | undefined,
  choices: readonly RecoveryChoiceSummary[],
  selectedRecoveryKey: string | undefined,
  verification: VerificationPresentation,
  discardConfigured: boolean
): InspectionUiControls {
  if (!controller) {
    return Object.freeze({
      ...emptyControls,
      canDiscardRecovery: discardConfigured && choices.length > 0
    });
  }
  const active = phase === "validating" || phase === "preparing_identity" ||
    phase === "creating_upload" || phase === "uploading" || phase === "pause_requested" ||
    phase === "resuming" || phase === "cancel_requested" || phase === "completing";
  const selectedChoice = choices.find((choice) => choice.key === selectedRecoveryKey);
  const hasCompatibleChoice = choices.some((choice) => choice.compatibility === "compatible");
  return Object.freeze({
    canSelect: !active,
    canRemove: !active && phase !== "paused",
    canStart: phase === "selected" || phase === "failed" || phase === "canceled",
    canPause: phase === "uploading" || phase === "resuming",
    canResume: (Boolean(selectedChoice?.compatibility === "compatible") || hasCompatibleChoice) &&
      (phase === "selected" || phase === "paused" || phase === "failed"),
    canCancel: active || phase === "paused",
    canRetryVerification: (verification.status === "failed" || verification.status === "unavailable") &&
      verification.retryable,
    canDiscardRecovery: discardConfigured && choices.length > 0
  });
}

export function toVerificationPresentation(result: CompletionVerificationResult): VerificationPresentation {
  if (result.status === "verified") {
    return result.checkedAt ? { status: "verified", checkedAt: result.checkedAt } : { status: "verified" };
  }
  if (result.status === "failed") {
    return {
      status: "failed",
      issues: result.issues.map((issue) => ({ code: issue.code, severity: issue.severity })),
      retryable: result.retryable === true,
      ...(result.checkedAt ? { checkedAt: result.checkedAt } : {})
    };
  }
  return {
    status: "unavailable",
    retryable: result.retryable === true,
    ...(result.checkedAt ? { checkedAt: result.checkedAt } : {})
  };
}
