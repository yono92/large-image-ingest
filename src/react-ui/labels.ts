import type { InspectionUploadConfiguration, InspectionUploadLabels } from "./types.js";

export const defaultInspectionUploadLabels: InspectionUploadLabels = Object.freeze({
  panelTitle: "Inspection upload",
  panelDescription: "Upload one original inspection image with resumable, verifiable transfer.",
  chooseFile: "Choose inspection image",
  dropFile: "Drop one local inspection image here",
  multipleFilesRejected: "Choose one local file at a time.",
  sourceHeading: "Selected original",
  sourceDerivative: "Caller-provided preview derivative",
  validationHeading: "Validation",
  preparationHeading: "Source identity preparation",
  progressHeading: "Acknowledged upload progress",
  controlsHeading: "Upload controls",
  recoveryHeading: "Recover an interrupted upload",
  verificationHeading: "Stored-original verification",
  errorHeading: "Upload needs attention",
  start: "Start ingest",
  pause: "Pause",
  resume: "Resume",
  cancel: "Cancel",
  remove: "Remove selected source",
  refreshRecovery: "Refresh recovery choices",
  discardRecovery: "Discard recovery record",
  retryVerification: "Retry verification",
  noSource: "No local source selected.",
  reselectSource: "Browser storage retains recovery evidence, not the original bytes. Reselect the original file to continue.",
  noRecovery: "No recoverable uploads are available.",
  transferComplete: "Transfer completed. Stored-original verification is separate.",
  verificationNotConfigured: "Stored-original verification is not configured.",
  verificationPending: "Stored-original verification is pending.",
  verificationVerified: "The application verified the stored original.",
  verificationFailed: "Stored-original verification failed.",
  verificationUnavailable: "Stored-original verification is currently unavailable.",
  phase: Object.freeze({
    empty: "Waiting for a local source",
    selected: "Ready to validate",
    validating: "Validating the source",
    preparing_identity: "Preparing source identity",
    creating_upload: "Creating the upload",
    uploading: "Uploading acknowledged chunks",
    pause_requested: "Pause requested",
    paused: "Upload paused",
    resuming: "Resuming upload",
    cancel_requested: "Cancellation requested",
    canceled: "Upload canceled",
    completing: "Finalizing transfer",
    transfer_completed: "Transfer completed",
    verified: "Stored original verified",
    verification_failed: "Stored verification failed",
    failed: "Upload failed"
  })
});

export function mergeInspectionUploadLabels(
  overrides: InspectionUploadConfiguration["labels"]
): InspectionUploadLabels {
  if (!overrides) {
    return defaultInspectionUploadLabels;
  }

  return {
    ...defaultInspectionUploadLabels,
    ...overrides,
    phase: {
      ...defaultInspectionUploadLabels.phase,
      ...overrides.phase
    }
  };
}
