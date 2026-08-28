import {
  classifyResumeRecordForFile,
  isResumeRecordExpired,
  validateResumeRecord
} from "../resume.js";
import type { IngestController, IngestControllerState } from "../react-controller.js";
import type { IngestManifest, ResumeRecord } from "../types.js";
import { mergeInspectionUploadLabels } from "./labels.js";
import { toSafeUiError } from "./safe-error.js";
import type {
  CompletionVerificationResult,
  InspectionControlIntent,
  InspectionUiControls,
  InspectionUiPhase,
  InspectionUiState,
  InspectionUploadActions,
  InspectionUploadConfiguration,
  InspectionUploadLabels,
  InspectionUploadUiValue,
  RecoveryChoiceSummary,
  RecoveryCompatibility,
  SafeUiError,
  SelectedInspectionSource,
  VerificationPresentation
} from "./types.js";

const emptyControls: InspectionUiControls = Object.freeze({
  canSelect: true,
  canRemove: false,
  canStart: false,
  canPause: false,
  canResume: false,
  canCancel: false,
  canRetryVerification: false,
  canDiscardRecovery: false
});

export class InspectionUploadCoordinator {
  private configuration: InspectionUploadConfiguration;
  private labels: InspectionUploadLabels;
  private readonly listeners = new Set<() => void>();
  private controller: IngestController | undefined;
  private unsubscribeController: (() => void) | undefined;
  private source: SelectedInspectionSource | undefined;
  private generation = 0;
  private recoveryGeneration = 0;
  private recoveryRecords = new Map<string, ResumeRecord>();
  private requestedAction: InspectionControlIntent;
  private recoveryChoices: readonly RecoveryChoiceSummary[] = [];
  private selectedRecoveryKey: string | undefined;
  private recoveryLoading = false;
  private safeError: SafeUiError | undefined;
  private verification: VerificationPresentation = { status: "not_configured" };
  private verificationAbort: AbortController | undefined;
  private completedManifest: IngestManifest | undefined;
  private lastControllerError: unknown;
  private lastObserverError: unknown;
  private state: InspectionUiState;
  private value: InspectionUploadUiValue;

  readonly actions: InspectionUploadActions = Object.freeze({
    selectFile: (file: File) => this.selectFile(file),
    removeSource: () => this.removeSource(),
    start: () => this.start(),
    pause: () => this.pause(),
    resume: (recoveryKey?: string) => this.resume(recoveryKey),
    cancel: () => this.cancel(),
    refreshRecovery: () => this.refreshRecovery(),
    discardRecovery: (recoveryKey: string) => this.discardRecovery(recoveryKey),
    retryVerification: () => this.retryVerification()
  });

  constructor(configuration: InspectionUploadConfiguration) {
    this.configuration = configuration;
    this.labels = mergeInspectionUploadLabels(configuration.labels);
    this.state = this.buildState();
    this.value = Object.freeze({ state: this.state, actions: this.actions, labels: this.labels });
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getValue = (): InspectionUploadUiValue => this.value;

  updateConfiguration(configuration: InspectionUploadConfiguration): void {
    this.configuration = configuration;
    this.labels = mergeInspectionUploadLabels(configuration.labels);
    this.publish();
  }

  dispose(): void {
    this.verificationAbort?.abort();
    this.unsubscribeController?.();
    this.unsubscribeController = undefined;
  }

  async selectFile(file: File): Promise<void> {
    if (!(file instanceof File)) {
      throw new TypeError("Inspection upload selection requires a local File.");
    }
    if (!this.state.controls.canSelect) {
      throw new Error("Cancel the active ingest before replacing its source.");
    }

    this.generation += 1;
    this.verificationAbort?.abort();
    this.unsubscribeController?.();
    this.safeError = undefined;
    this.requestedAction = undefined;
    this.completedManifest = undefined;
    this.verification = { status: "not_configured" };
    this.lastControllerError = undefined;
    this.lastObserverError = undefined;
    this.source = createSelectedSource(file, this.generation);
    this.controller = this.configuration.createController(file);
    this.unsubscribeController = this.controller.subscribe(() => this.handleControllerRevision());
    this.publish();
    try {
      await this.classifyRecoveryChoices(this.generation);
    } catch (error) {
      this.reportOperationError(error);
      throw error;
    }
  }

  removeSource(): void {
    if (!this.state.controls.canRemove) {
      throw new Error("Cancel the active ingest before removing its source.");
    }
    this.generation += 1;
    this.verificationAbort?.abort();
    this.unsubscribeController?.();
    this.unsubscribeController = undefined;
    this.controller = undefined;
    this.source = undefined;
    this.safeError = undefined;
    this.requestedAction = undefined;
    this.completedManifest = undefined;
    this.verification = { status: "not_configured" };
    this.selectedRecoveryKey = undefined;
    this.recoveryChoices = this.recoveryChoices.map((choice) => ({
      ...choice,
      compatibility: choice.compatibility === "expired" ? "expired" : "awaiting_source"
    }));
    this.publish();
  }

  async start(): Promise<IngestManifest> {
    const controller = this.requireController();
    if (!this.state.controls.canStart) {
      throw new Error("Start is not available in the current upload state.");
    }
    this.requestedAction = "start";
    this.safeError = undefined;
    this.publish();
    try {
      return await controller.start();
    } catch (error) {
      this.reportOperationError(error);
      throw error;
    } finally {
      if (this.requestedAction === "start") {
        this.requestedAction = undefined;
        this.publish();
      }
    }
  }

  pause(): void {
    const controller = this.requireController();
    if (!this.state.controls.canPause) {
      throw new Error("Pause is not available in the current upload state.");
    }
    this.requestedAction = "pause";
    this.publish();
    try {
      controller.pause();
    } catch (error) {
      this.requestedAction = undefined;
      this.reportOperationError(error);
      throw error;
    }
  }

  async resume(recoveryKey?: string): Promise<IngestManifest> {
    const controller = this.requireController();
    const key = recoveryKey ?? this.selectedRecoveryKey;
    if (!key || !this.state.controls.canResume) {
      throw new Error("Choose one compatible recovery record before resuming.");
    }
    const record = this.recoveryRecords.get(key);
    if (!record) {
      throw new Error("The selected recovery record is no longer available.");
    }
    this.requestedAction = "resume";
    this.safeError = undefined;
    this.publish();
    try {
      return await controller.resume(record.id);
    } catch (error) {
      this.reportOperationError(error);
      throw error;
    } finally {
      if (this.requestedAction === "resume") {
        this.requestedAction = undefined;
        this.publish();
      }
    }
  }

  async cancel(): Promise<void> {
    const controller = this.requireController();
    if (!this.state.controls.canCancel) {
      throw new Error("Cancel is not available in the current upload state.");
    }
    this.requestedAction = "cancel";
    this.publish();
    try {
      await controller.cancel();
    } catch (error) {
      this.reportOperationError(error);
      throw error;
    } finally {
      if (this.requestedAction === "cancel") {
        this.requestedAction = undefined;
        this.publish();
      }
    }
  }

  async refreshRecovery(): Promise<void> {
    const recovery = this.configuration.recovery;
    const revision = ++this.recoveryGeneration;
    if (!recovery) {
      this.recoveryRecords.clear();
      this.recoveryChoices = [];
      this.selectedRecoveryKey = undefined;
      this.publish();
      return;
    }

    this.recoveryLoading = true;
    this.publish();
    try {
      const values = await recovery.store.list();
      if (revision !== this.recoveryGeneration) return;
      const nextRecords = new Map<string, ResumeRecord>();
      const nextChoices: RecoveryChoiceSummary[] = [];
      let index = 0;
      for (const value of values) {
        const validated = validateResumeRecord(value);
        if (!validated.ok) continue;
        const record = validated.record;
        if (!isRecoverableStatus(record.progress.status) && !isResumeRecordExpired(record, recovery.clock?.())) {
          continue;
        }
        const key = `recovery-${revision}-${index++}`;
        nextRecords.set(key, record);
        nextChoices.push(projectRecoveryChoice(
          key,
          record,
          isResumeRecordExpired(record, recovery.clock?.()) ? "expired" : "awaiting_source"
        ));
      }
      this.recoveryRecords = nextRecords;
      this.recoveryChoices = nextChoices;
      this.selectedRecoveryKey = undefined;
      this.recoveryLoading = false;
      this.publish();
      if (this.source) {
        await this.classifyRecoveryChoices(this.generation);
      }
    } catch (error) {
      if (revision !== this.recoveryGeneration) return;
      this.recoveryLoading = false;
      this.reportOperationError(error);
      throw error;
    }
  }

  async discardRecovery(recoveryKey: string): Promise<void> {
    const recovery = this.configuration.recovery;
    const record = this.recoveryRecords.get(recoveryKey);
    const choice = this.recoveryChoices.find((current) => current.key === recoveryKey);
    if (!recovery?.confirmDiscard || !record || !choice) {
      throw new Error("Recovery discard is not configured for this choice.");
    }
    if (!await recovery.confirmDiscard(choice)) return;
    try {
      await recovery.store.delete(record.id);
      await this.refreshRecovery();
    } catch (error) {
      this.reportOperationError(error);
      throw error;
    }
  }

  async retryVerification(): Promise<void> {
    if (!this.state.controls.canRetryVerification || !this.completedManifest) {
      throw new Error("Verification retry is not available.");
    }
    await this.beginVerification(this.completedManifest, this.generation);
  }

  private requireController(): IngestController {
    if (!this.controller) {
      throw new Error("Select one local source before using upload controls.");
    }
    return this.controller;
  }

  private handleControllerRevision(): void {
    const controllerState = this.controller?.getState();
    if (!controllerState) return;

    if (this.requestedAction === "pause" && controllerState.status === "paused") {
      this.requestedAction = undefined;
    } else if (this.requestedAction === "cancel" && controllerState.status === "canceled") {
      this.requestedAction = undefined;
    }

    if (controllerState.error !== undefined && controllerState.error !== this.lastControllerError) {
      this.lastControllerError = controllerState.error;
      this.reportOperationError(controllerState.error, false);
    }
    const observerError = controllerState.observerFailure?.error;
    if (observerError !== undefined && observerError !== this.lastObserverError) {
      this.lastObserverError = observerError;
      const safe: SafeUiError = {
        category: "observer",
        title: "Status reporting failed",
        guidance: "The ingest operation remains authoritative even though status reporting failed.",
        retryable: false
      };
      this.safeError = safe;
      this.callCallback(this.configuration.onError, observerError, safe);
    }

    this.publish();

    if (
      controllerState.status === "completed" &&
      controllerState.manifest &&
      controllerState.manifest !== this.completedManifest
    ) {
      this.completedManifest = controllerState.manifest;
      void this.beginVerification(controllerState.manifest, this.generation);
    }
  }

  private async classifyRecoveryChoices(generation: number): Promise<void> {
    if (!this.source || generation !== this.generation || this.recoveryChoices.length === 0) return;
    const source = this.source;
    const recovery = this.configuration.recovery;
    if (!recovery) return;

    const classified = await Promise.all(this.recoveryChoices.map(async (choice) => {
      const record = this.recoveryRecords.get(choice.key);
      if (!record || choice.compatibility === "expired") return choice;
      const result = await classifyResumeRecordForFile(record, source.file, recovery.chunking);
      return {
        ...choice,
        compatibility: normalizeCompatibility(result)
      } satisfies RecoveryChoiceSummary;
    }));
    if (generation !== this.generation || source !== this.source) return;
    this.recoveryChoices = classified;
    const compatible = classified.filter((choice) => choice.compatibility === "compatible");
    this.selectedRecoveryKey = compatible.length === 1 ? compatible[0]?.key : undefined;
    this.publish();
  }

  private async beginVerification(manifest: IngestManifest, generation: number): Promise<void> {
    const verifier = this.configuration.verifier;
    if (!verifier || !this.source) {
      this.verification = { status: "not_configured" };
      this.publish();
      return;
    }
    const source = this.source;
    this.verificationAbort?.abort();
    const abortController = new AbortController();
    this.verificationAbort = abortController;
    this.verification = { status: "pending" };
    this.publish();
    try {
      const result = await verifier.verify(manifest, {
        source: withoutFile(source),
        signal: abortController.signal
      });
      if (generation !== this.generation || source !== this.source || abortController.signal.aborted) return;
      this.verification = toVerificationPresentation(result);
      this.callCallback(this.configuration.onVerificationResult, result);
      this.publish();
    } catch (error) {
      if (generation !== this.generation || source !== this.source || abortController.signal.aborted) return;
      const result: CompletionVerificationResult = { status: "unavailable", retryable: true };
      this.verification = { status: "unavailable", retryable: true };
      this.callCallback(this.configuration.onVerificationResult, result);
      this.reportOperationError(error);
    }
  }

  private reportOperationError(error: unknown, publish = true): void {
    const safe = toSafeUiError(error);
    this.safeError = safe;
    this.callCallback(this.configuration.onError, error, safe);
    if (publish) this.publish();
  }

  private callCallback<T extends readonly unknown[]>(
    callback: ((...arguments_: T) => void) | undefined,
    ...arguments_: T
  ): void {
    try {
      callback?.(...arguments_);
    } catch (error) {
      try {
        this.configuration.onCallbackError?.(error);
      } catch {
        // Consumer callback failures never participate in ingest control flow.
      }
    }
  }

  private buildState(): InspectionUiState {
    const controllerState = this.controller?.getState();
    const phase = derivePhase(this.source, controllerState, this.requestedAction, this.verification);
    const controls = deriveControls(
      phase,
      controllerState,
      this.recoveryChoices,
      this.selectedRecoveryKey,
      this.verification,
      Boolean(this.configuration.recovery?.confirmDiscard)
    );
    const state: InspectionUiState = {
      phase,
      uploadedBytes: controllerState?.uploadedBytes ?? 0,
      totalBytes: controllerState?.totalBytes ?? this.source?.sizeBytes ?? 0,
      progress: controllerState?.progress ?? 0,
      recoveryChoices: Object.freeze(this.recoveryChoices.map((choice) => Object.freeze({ ...choice }))),
      recoveryLoading: this.recoveryLoading,
      verification: this.verification,
      controls,
      ...(this.source ? { source: this.source } : {}),
      ...(this.requestedAction ? { requestedAction: this.requestedAction } : {}),
      ...(controllerState?.preparation ? { preparation: controllerState.preparation } : {}),
      ...(this.selectedRecoveryKey ? { selectedRecoveryKey: this.selectedRecoveryKey } : {}),
      ...(this.safeError ? { error: this.safeError } : {})
    };
    return Object.freeze(state);
  }

  private publish(): void {
    this.state = this.buildState();
    this.value = Object.freeze({ state: this.state, actions: this.actions, labels: this.labels });
    this.callCallback(this.configuration.onStateChange, this.state);
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // UI subscribers cannot participate in upload control flow.
      }
    }
  }
}

function createSelectedSource(file: File, generation: number): SelectedInspectionSource {
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

function withoutFile(source: SelectedInspectionSource): Omit<SelectedInspectionSource, "file"> {
  const safe = {
    selectionId: source.selectionId,
    name: source.name,
    sizeBytes: source.sizeBytes,
    mediaType: source.mediaType
  };
  return source.lastModified === undefined ? safe : { ...safe, lastModified: source.lastModified };
}

function projectRecoveryChoice(
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

function normalizeCompatibility(
  compatibility: Awaited<ReturnType<typeof classifyResumeRecordForFile>>
): RecoveryCompatibility {
  return compatibility === "not_recoverable" ? "expired" : compatibility;
}

function isRecoverableStatus(status: ResumeRecord["progress"]["status"]): boolean {
  return status === "active" || status === "paused" || status === "failed" || status === "expired";
}

function derivePhase(
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

function deriveControls(
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

function toVerificationPresentation(result: CompletionVerificationResult): VerificationPresentation {
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
