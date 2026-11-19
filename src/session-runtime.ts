import { validateDomainProfileSessionBinding } from "./profiles.js";
import { ResumeConflictError, UploadCanceledError, UploadPausedError } from "./resume.js";
import type {
  ChunkDescriptor,
  ChunkPlan,
  ContentSourceIdentityV1,
  CreateIngestSessionOptions,
  IngestEvent,
  IngestFileLike,
  IngestIssueCode,
  IngestManifest,
  IngestObserverFailure,
  ResumeRecord,
  ResumeRecordStatus,
  TransportSession,
  UploadChunkReceipt,
  UploadSessionSnapshot,
  UploadSessionStatus
} from "./types.js";
import { normalizeTransportSession, calculateUploadedBytes } from "./session-receipts.js";
import {
  cloneSnapshot,
  redactSnapshot,
  createIngestError,
  isIngestError,
  isIngestIssueErrorCode,
  toSnapshotError,
  toErrorMessage,
  nowIso
} from "./session-state.js";
import { parallelState } from "./session-parallel.js";
import { sortedReceipts } from "./session-transfer.js";
import type { PendingChecksum } from "./session-overlap.js";
import { withSessionChecksumAuthority, createRecordFromSnapshot } from "./session-resume.js";
import { markRecordPaused, markRecordCanceled, markCurrentRecordFailed } from "./session-resume-store.js";
import { resumeUpload, startUpload } from "./session-flow.js";

/** Internal session state and lifecycle; the public facade is `LargeImageIngestSession`. */
export class SessionRuntime {
  readonly abortController = new AbortController();
  cancelEmitted = false;
  currentRecord: ResumeRecord | undefined;
  currentSnapshot: UploadSessionSnapshot | undefined;
  currentTransportSession: TransportSession | undefined;
  lifecycleAction: "pause" | "cancel" | undefined;
  resumeSourceIdentity: ContentSourceIdentityV1 | undefined;
  parallelSourceIdentity: ContentSourceIdentityV1 | undefined;
  readonly completedReceipts = new Map<number, UploadChunkReceipt>();
  readonly inFlightChunks = new Set<number>();
  readonly retryableChunks = new Set<number>();
  readonly failedChunks = new Set<number>();
  readonly ambiguousChunks = new Set<number>();
  pendingChecksum: PendingChecksum | undefined;

  constructor(
    readonly file: IngestFileLike,
    readonly options: CreateIngestSessionOptions
  ) {}

  abort(reason?: unknown): void {
    this.abortController.abort(reason);
  }

  pause(reason?: unknown): void {
    this.lifecycleAction = "pause";

    if (!this.abortController.signal.aborted) {
      this.abortController.abort(reason ?? new UploadPausedError(this.currentRecord?.id));
    }
  }

  async cancel(reason?: unknown): Promise<void> {
    this.lifecycleAction = "cancel";

    if (!this.abortController.signal.aborted) {
      this.abortController.abort(reason ?? new UploadCanceledError(this.currentRecord?.id));
    }

    // The running authority publishes cancellation after every worker and
    // serialized receipt commit has settled.
  }

  getSnapshot(): UploadSessionSnapshot | undefined {
    return this.currentSnapshot ? cloneSnapshot(this.currentSnapshot) : undefined;
  }

  start(): Promise<IngestManifest> {
    return startUpload(this);
  }

  resume(recordId: string): Promise<IngestManifest> {
    return resumeUpload(this, recordId);
  }

  async createOrResumeSnapshotSession(
    manifest: IngestManifest,
    chunkPlan: ChunkPlan
  ): Promise<TransportSession> {
    const context = {
      manifest,
      file: this.file,
      signal: this.abortController.signal,
      ...(this.options.parallel ? { parallel: parallelState(this, chunkPlan) } : {})
    };
    const fallbackTransportName = this.transportName();

    if (this.options.resumeFrom) {
      const snapshot = this.options.resumeFrom;

      if (this.options.transport.resumeSession) {
        const record = await createRecordFromSnapshot(this, manifest, chunkPlan, snapshot);
        return normalizeTransportSession(
          await this.options.transport.resumeSession({
            ...context,
            record,
            snapshot
          }),
          snapshot.transportSession?.transportName ?? fallbackTransportName,
          snapshot.transportSession
        );
      }

      if (snapshot.transportSession) {
        return snapshot.transportSession;
      }

      throw createIngestError(
        "transport.resume_failed",
        "Cannot resume upload because the snapshot has no transport session.",
        false
      );
    }

    return normalizeTransportSession(
      await this.options.transport.createSession(context),
      fallbackTransportName
    );
  }

  createManifestOptions(): CreateIngestSessionOptions {
    if (this.options.checksum === false) {
      return this.options;
    }
    return {
      ...this.options,
      checksum: withSessionChecksumAuthority(this, this.options.checksum ?? {})
    };
  }

  validateDomainProfileBinding(manifest: IngestManifest): void {
    const binding = this.options.domainProfile;
    if (binding && !validateDomainProfileSessionBinding(binding, manifest.id)) {
      throw createIngestError(
        "profile.binding_invalid",
        "The domain profile binding is invalid for this manifest.",
        false
      );
    }
  }

  async abortTransportSession(manifest: IngestManifest): Promise<void> {
    const session = this.currentTransportSession;

    if (!session || !this.options.transport.abortSession) {
      return;
    }

    try {
      await this.options.transport.abortSession({
        manifest,
        file: this.file,
        signal: new AbortController().signal,
        uploadId: session.uploadId,
        session,
        receipts: sortedReceipts(this)
      });
    } catch (error) {
      throw createIngestError(
        "transport.abort_failed",
        toErrorMessage(error, "Transport abort failed."),
        false
      );
    }
  }

  async handleSessionError(
    error: unknown,
    manifest: IngestManifest | undefined,
    chunkPlan: ChunkPlan | undefined,
    snapshotCreatedAt: string
  ): Promise<void> {
    const lifecycleStatus = this.lifecycleStatus();
    let snapshot: UploadSessionSnapshot | undefined;

    if (lifecycleStatus === "canceled" && manifest) {
      try {
        await this.abortTransportSession(manifest);
      } catch (abortError) {
        error = abortError;
      }
    }

    if (this.currentRecord && lifecycleStatus === "paused") {
      this.currentRecord = await markRecordPaused(this, this.currentRecord);
    } else if (this.currentRecord && lifecycleStatus === "canceled") {
      this.currentRecord = await markRecordCanceled(this, this.currentRecord);
    } else if (!lifecycleStatus && !(error instanceof ResumeConflictError)) {
      await markCurrentRecordFailed(this, error);
    }

    if (manifest && chunkPlan) {
      snapshot = this.updateSnapshot({
        manifest,
        chunkPlan,
        session: this.currentTransportSession,
        status: lifecycleStatus ?? "failed",
        createdAt: snapshotCreatedAt,
        error
      });
    }

    if (snapshot && lifecycleStatus === "paused") {
      this.emit({ type: "paused", snapshot: redactSnapshot(snapshot) });
      this.emitPause(this.currentRecord?.id);
    } else if (snapshot && lifecycleStatus === "canceled") {
      this.emit({ type: "canceled", snapshot: redactSnapshot(snapshot) });
      this.emitCancel(this.currentRecord?.id);
    }

    if (!lifecycleStatus && !(error instanceof ResumeConflictError)) {
      this.emit(
        manifest
          ? { type: "failed", manifestId: manifest.id, error }
          : { type: "failed", error }
      );
    }
  }

  normalizeStopError(error: unknown): unknown {
    if (this.lifecycleAction === "cancel" && !(error instanceof UploadCanceledError)) {
      return new UploadCanceledError(this.currentRecord?.id);
    }

    if (this.lifecycleAction === "pause" && !(error instanceof UploadPausedError)) {
      return new UploadPausedError(this.currentRecord?.id);
    }

    return error;
  }

  updateSnapshot(options: {
    manifest: IngestManifest;
    chunkPlan: ChunkPlan;
    session?: TransportSession | undefined;
    status: UploadSessionStatus;
    createdAt: string;
    error?: unknown;
    failedChunk?: ChunkDescriptor | undefined;
  }): UploadSessionSnapshot {
    const snapshot: UploadSessionSnapshot = {
      manifestId: options.manifest.id,
      status: options.status,
      transportSession: options.session,
      chunkPlan: options.chunkPlan,
      completedChunks: sortedReceipts(this),
      failedChunk: options.failedChunk,
      uploadedBytes: calculateUploadedBytes(sortedReceipts(this)),
      totalBytes: this.file.size,
      createdAt: options.createdAt,
      updatedAt: nowIso()
    };
    const parallel = parallelState(
      this,
      options.chunkPlan,
      Math.max(0, options.chunkPlan.totalChunks - this.completedReceipts.size)
    );
    if (parallel) {
      snapshot.parallel = parallel;
      snapshot.chunkOutcomes = {
        missing: Math.max(
          0,
          options.chunkPlan.totalChunks - this.completedReceipts.size - this.inFlightChunks.size - this.retryableChunks.size - this.ambiguousChunks.size - this.failedChunks.size
        ),
        inFlight: this.inFlightChunks.size,
        acknowledged: this.completedReceipts.size,
        retryable: this.retryableChunks.size,
        ambiguous: this.ambiguousChunks.size,
        failed: this.failedChunks.size
      };
    }

    if (options.error !== undefined) {
      snapshot.error = toSnapshotError(options.error);
    }

    this.currentSnapshot = cloneSnapshot(snapshot);
    this.observeSnapshot(cloneSnapshot(snapshot));
    this.emit({ type: "snapshot", snapshot: redactSnapshot(snapshot) });
    return cloneSnapshot(snapshot);
  }

  emitPause(recordId: string | undefined): void {
    if (recordId === undefined) {
      this.emit({ type: "upload:paused" });
      return;
    }

    this.emit({ type: "upload:paused", recordId });
  }

  emitCancel(recordId: string | undefined): void {
    if (this.cancelEmitted) {
      return;
    }

    this.cancelEmitted = true;
    if (recordId === undefined) {
      this.emit({ type: "upload:canceled" });
      return;
    }

    this.emit({ type: "upload:canceled", recordId });
  }

  lifecycleStatus(): "paused" | "canceled" | undefined {
    if (this.lifecycleAction === "pause") {
      return "paused";
    }

    if (this.lifecycleAction === "cancel") {
      return "canceled";
    }

    return undefined;
  }

  throwIfStopped(): void {
    if (this.lifecycleAction === "pause") {
      throw new UploadPausedError(this.currentRecord?.id);
    }

    if (this.lifecycleAction === "cancel") {
      throw new UploadCanceledError(this.currentRecord?.id);
    }

    if (this.abortController.signal.aborted) {
      throw this.abortController.signal.reason ?? createIngestError(
        "transport.aborted",
        "Upload aborted.",
        false
      );
    }
  }

  isTerminalOrControlledStatus(status: ResumeRecordStatus): boolean {
    return status === "completed" || status === "canceled" || status === "expired" || status === "paused";
  }

  toIssueCode(error: unknown): IngestIssueCode {
    if (error instanceof ResumeConflictError) {
      return error.code;
    }

    if (isIngestError(error) && isIngestIssueErrorCode(error.code)) {
      return error.code;
    }

    if (this.lifecycleAction === "pause") {
      return "transport.paused";
    }

    if (this.lifecycleAction === "cancel") {
      return "transport.canceled";
    }

    if (this.abortController.signal.aborted) {
      return "transport.aborted";
    }

    return "transport.failed";
  }

  transportName(fallback?: string): string {
    return fallback ?? this.options.transport.capabilities?.name ?? "custom";
  }

  emit(event: IngestEvent): void {
    try {
      this.options.onEvent?.(event);
    } catch (error) {
      this.reportObserverFailure({
        observer: "event",
        eventType: event.type,
        error
      });
    }
  }

  observeSnapshot(snapshot: UploadSessionSnapshot): void {
    try {
      this.options.onSnapshot?.(snapshot);
    } catch (error) {
      this.reportObserverFailure({ observer: "snapshot", error });
    }
  }

  reportObserverFailure(failure: IngestObserverFailure): void {
    try {
      this.options.onObserverError?.(failure);
    } catch {
      // Observer error reporting is isolated from upload control flow too.
    }
  }
}
