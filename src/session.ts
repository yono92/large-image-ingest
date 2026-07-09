import { planChunks } from "./chunks.js";
import { createManifest } from "./manifest.js";
import {
  ResumeConflictError,
  UploadCanceledError,
  UploadPausedError,
  chunkingIdentityMatches,
  createResumeChunkingIdentity,
  createResumeConflict,
  createResumeFileIdentity,
  createResumeRecord,
  fileIdentityMatches,
  getNextIncompleteChunkIndex,
  isChunkCompleted,
  isResumeRecordExpired,
  mergeCompletedChunkRange,
  mergeTransportState
} from "./resume.js";
import type {
  ChunkDescriptor,
  ChunkPlan,
  CompletedChunkRange,
  CreateIngestSessionOptions,
  IngestError,
  IngestEvent,
  IngestFileLike,
  IngestIssueCode,
  IngestManifest,
  ResumeRecord,
  ResumeRecordStatus,
  ResumeStore,
  ResumeTransportState,
  RetryDecisionContext,
  RetryPolicy,
  TransportCapabilities,
  TransportSession,
  UploadChunkReceipt,
  UploadChunkResult,
  UploadSessionResult,
  UploadSessionSnapshot,
  UploadSessionStatus
} from "./types.js";

const SUPPORTED_RESUME_SCHEMA_VERSION = "large-image-ingest.resume.v0.1";

interface NormalizedUploadChunkResult {
  receipt: UploadChunkReceipt;
  transportResult?: UploadChunkResult | undefined;
}

interface NormalizedRetryPolicy {
  maxAttempts: number;
  delayMs: number;
  backoffFactor: number;
  maxDelayMs: number;
  jitter: "none" | "full";
  isRetryable?: RetryPolicy["isRetryable"];
}

export class LargeImageIngestSession {
  private readonly abortController = new AbortController();
  private cancelEmitted = false;
  private currentRecord: ResumeRecord | undefined;
  private currentSnapshot: UploadSessionSnapshot | undefined;
  private currentTransportSession: TransportSession | undefined;
  private lifecycleAction: "pause" | "cancel" | undefined;
  private readonly completedReceipts = new Map<number, UploadChunkReceipt>();

  constructor(
    private readonly file: IngestFileLike,
    private readonly options: CreateIngestSessionOptions
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

    if (this.currentRecord) {
      this.currentRecord = await this.markRecordCanceled(this.currentRecord);
    }
  }

  getSnapshot(): UploadSessionSnapshot | undefined {
    return this.currentSnapshot ? cloneSnapshot(this.currentSnapshot) : undefined;
  }

  async start(): Promise<IngestManifest> {
    let manifest: IngestManifest | undefined;
    let chunkPlan: ChunkPlan | undefined;
    const snapshotCreatedAt = this.options.resumeFrom?.createdAt ?? nowIso();

    try {
      this.throwIfStopped();
      manifest = this.options.manifest ?? await createManifest(this.file, this.options);
      this.emit({ type: "validated", manifest });

      if (!manifest.validation.ok) {
        throw createIngestError(
          "transport.failed",
          "Cannot start upload because validation failed.",
          false
        );
      }

      chunkPlan = planChunks(this.file.size, this.options.chunking);
      validateChunkPlanForTransport(chunkPlan, this.options.transport.capabilities);
      this.hydrateResumeSnapshot(manifest, chunkPlan);

      const session = await this.createOrResumeSnapshotSession(manifest, chunkPlan);
      this.currentTransportSession = session;
      manifest.upload.transport = { name: session.transportName };

      this.emit({ type: "started", manifest, uploadId: session.uploadId });
      this.updateSnapshot({
        manifest,
        chunkPlan,
        session,
        status: this.options.resumeFrom ? "resuming" : "uploading",
        createdAt: snapshotCreatedAt
      });

      let record = this.options.resumeFrom
        ? undefined
        : await this.createInitialResumeRecord(manifest, session);

      if (this.options.resumeFrom) {
        this.updateSnapshot({
          manifest,
          chunkPlan,
          session,
          status: "uploading",
          createdAt: snapshotCreatedAt
        });
      }

      record = await this.uploadRemainingChunks(manifest, session, chunkPlan, record, snapshotCreatedAt);
      await this.completeUpload(manifest, session, record, chunkPlan, snapshotCreatedAt);

      return manifest;
    } catch (error) {
      await this.handleSessionError(error, manifest, chunkPlan, snapshotCreatedAt);
      throw this.normalizeStopError(error);
    }
  }

  async resume(recordId: string): Promise<IngestManifest> {
    const store = this.requireResumeStore();
    let manifest: IngestManifest | undefined;
    let chunkPlan: ChunkPlan | undefined;
    const snapshotCreatedAt = nowIso();

    try {
      const record = await this.getResumeRecord(store, recordId);
      manifest = record.manifest;
      this.emit({ type: "validated", manifest });
      this.throwIfStopped();

      await this.validateResumeRecord(record, store);

      if (!this.options.transport.resumeSession) {
        throw this.emitResumeConflict(
          "resume.transport_unsupported",
          "The configured upload transport does not support persistent resume.",
          record.id
        );
      }

      let session: TransportSession;
      try {
        session = normalizeTransportSession(
          await this.options.transport.resumeSession({
            manifest,
            file: this.file,
            signal: this.abortController.signal,
            record
          }),
          this.transportName(record.transport.name),
          record.transport
        );
      } catch (error) {
        throw this.emitResumeConflict(
          "resume.transport_mismatch",
          "The transport could not validate the remote resume session.",
          record.id,
          error
        );
      }

      if (session.uploadId !== record.transport.uploadId) {
        throw this.emitResumeConflict(
          "resume.transport_mismatch",
          "The transport returned a different remote upload session.",
          record.id
        );
      }

      this.currentTransportSession = session;
      manifest.upload.transport = { name: session.transportName };
      const activeRecord = await this.putResumeRecord(
        this.withTransport(
          this.withStatus(record, "active"),
          mergeTransportState(record.transport, this.createTransportState(session))
        )
      );

      this.emit({ type: "resume:started", recordId: activeRecord.id, manifestId: manifest.id });

      chunkPlan = planChunks(this.file.size, this.options.chunking);
      validateChunkPlanForTransport(chunkPlan, this.options.transport.capabilities);
      this.hydrateResumeRecord(activeRecord, chunkPlan, session);
      this.updateSnapshot({
        manifest,
        chunkPlan,
        session,
        status: "resuming",
        createdAt: snapshotCreatedAt
      });

      const nextRecord = await this.uploadRemainingChunks(
        manifest,
        session,
        chunkPlan,
        activeRecord,
        snapshotCreatedAt
      );
      await this.completeUpload(manifest, session, nextRecord, chunkPlan, snapshotCreatedAt);

      return manifest;
    } catch (error) {
      await this.handleSessionError(error, manifest, chunkPlan, snapshotCreatedAt);
      throw this.normalizeStopError(error);
    }
  }

  private async createOrResumeSnapshotSession(
    manifest: IngestManifest,
    chunkPlan: ChunkPlan
  ): Promise<TransportSession> {
    const context = {
      manifest,
      file: this.file,
      signal: this.abortController.signal
    };
    const fallbackTransportName = this.transportName();

    if (this.options.resumeFrom) {
      const snapshot = this.options.resumeFrom;

      if (this.options.transport.resumeSession) {
        const record = await this.createRecordFromSnapshot(manifest, chunkPlan, snapshot);
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

  private async createInitialResumeRecord(
    manifest: IngestManifest,
    session: TransportSession
  ): Promise<ResumeRecord | undefined> {
    const store = this.options.resume?.store;
    if (!store) {
      return undefined;
    }

    const record = createResumeRecord({
      manifest,
      file: await createResumeFileIdentity(this.file),
      chunking: createResumeChunkingIdentity(this.file.size, this.options.chunking),
      transport: this.createTransportState(session)
    });

    const persisted = await this.putResumeRecord(record);
    this.emit({
      type: "resume:available",
      recordId: persisted.id,
      manifestId: manifest.id,
      status: persisted.progress.status
    });

    return persisted;
  }

  private async createRecordFromSnapshot(
    manifest: IngestManifest,
    chunkPlan: ChunkPlan,
    snapshot: UploadSessionSnapshot
  ): Promise<ResumeRecord> {
    const completedChunkRanges = receiptsToRanges(snapshot.completedChunks);
    const now = nowIso();

    return {
      schemaVersion: SUPPORTED_RESUME_SCHEMA_VERSION,
      id: `snapshot_${snapshot.manifestId}`,
      manifest,
      file: await createResumeFileIdentity(this.file),
      chunking: {
        strategy: "fixed-size",
        chunkSizeBytes: chunkPlan.chunkSize,
        totalBytes: chunkPlan.totalBytes,
        totalChunks: chunkPlan.totalChunks
      },
      transport: snapshot.transportSession
        ? this.createTransportState(snapshot.transportSession)
        : { uploadId: `snapshot_${snapshot.manifestId}` },
      progress: {
        status: "active",
        uploadedBytes: snapshot.uploadedBytes,
        completedChunkRanges,
        nextChunkIndex: getNextIncompleteChunkIndex(completedChunkRanges, chunkPlan.totalChunks)
      },
      createdAt: snapshot.createdAt,
      updatedAt: now
    };
  }

  private async validateResumeRecord(record: ResumeRecord, store: ResumeStore): Promise<void> {
    if (record.schemaVersion !== SUPPORTED_RESUME_SCHEMA_VERSION) {
      throw this.emitResumeConflict(
        "resume.schema_unsupported",
        "The resume record schema version is not supported.",
        record.id
      );
    }

    if (isResumeRecordExpired(record)) {
      const expired = await this.putResumeRecord(this.withStatus(record, "expired", "resume.expired"));
      this.emit({ type: "resume:expired", recordId: expired.id });
      throw this.emitResumeConflict(
        "resume.expired",
        "The stored remote resume handle has expired.",
        expired.id
      );
    }

    const fileIdentity = await createResumeFileIdentity(this.file);
    if (!fileIdentityMatches(record.file, fileIdentity)) {
      throw this.emitResumeConflict(
        "resume.file_mismatch",
        "The selected file does not match the stored resume record.",
        record.id
      );
    }

    const chunking = createResumeChunkingIdentity(this.file.size, this.options.chunking);
    if (!chunkingIdentityMatches(record.chunking, chunking)) {
      throw this.emitResumeConflict(
        "resume.chunking_mismatch",
        "The active chunking options do not match the stored resume record.",
        record.id
      );
    }

    if (record.progress.status === "completed" || record.progress.status === "canceled") {
      throw this.emitResumeConflict(
        "resume.record_not_found",
        "The resume record is terminal and cannot be resumed.",
        record.id
      );
    }

    this.currentRecord = record;
    void store;
  }

  private async uploadRemainingChunks(
    manifest: IngestManifest,
    session: TransportSession,
    chunkPlan: ChunkPlan,
    record: ResumeRecord | undefined,
    snapshotCreatedAt: string
  ): Promise<ResumeRecord | undefined> {
    let activeRecord = record;

    for (const chunk of chunkPlan.chunks) {
      if (this.completedReceipts.has(chunk.index)) {
        continue;
      }

      this.throwIfStopped();
      this.emit({ type: "chunk:started", manifestId: manifest.id, chunk });

      const result = await this.uploadChunkWithRetry(manifest, session, chunk);
      this.storeReceipt(chunk, result.receipt);

      if (activeRecord) {
        activeRecord = await this.checkpointChunk(activeRecord, chunk, chunkPlan, result.transportResult);
      }

      const uploadedBytes = calculateUploadedBytes(this.sortedReceipts());
      this.emit({
        type: "chunk:completed",
        manifestId: manifest.id,
        chunk,
        uploadedBytes,
        totalBytes: this.file.size
      });
      this.updateSnapshot({
        manifest,
        chunkPlan,
        session,
        status: "uploading",
        createdAt: snapshotCreatedAt
      });

      this.throwIfStopped();
    }

    return activeRecord;
  }

  private async checkpointChunk(
    record: ResumeRecord,
    chunk: ChunkDescriptor,
    chunkPlan: ChunkPlan,
    result: UploadChunkResult | undefined
  ): Promise<ResumeRecord> {
    const completedChunkRanges = mergeCompletedChunkRange(
      record.progress.completedChunkRanges,
      chunk.index
    );
    const uploadedBytes = this.sumCompletedBytes(completedChunkRanges, chunkPlan.chunks);
    const nextChunkIndex = getNextIncompleteChunkIndex(completedChunkRanges, chunkPlan.totalChunks);

    const progress: ResumeRecord["progress"] = {
      ...record.progress,
      status: "active",
      uploadedBytes,
      completedChunkRanges,
      nextChunkIndex
    };

    const transport = result ? mergeTransportState(record.transport, result) : record.transport;
    const next = await this.putResumeRecord({
      ...record,
      transport,
      progress,
      updatedAt: nowIso()
    });

    this.emit({
      type: "resume:checkpoint",
      recordId: next.id,
      completedChunkRanges: next.progress.completedChunkRanges
    });

    return next;
  }

  private async uploadChunkWithRetry(
    manifest: IngestManifest,
    session: TransportSession,
    chunk: ChunkDescriptor
  ): Promise<NormalizedUploadChunkResult> {
    const retryPolicy = normalizeRetryPolicy(this.options.retryPolicy, this.options.retries);

    for (let attempt = 0; attempt < retryPolicy.maxAttempts; attempt += 1) {
      try {
        this.throwIfStopped();
        const result = await this.options.transport.uploadChunk({
          manifest,
          file: this.file,
          signal: this.abortController.signal,
          uploadId: session.uploadId,
          chunk,
          body: this.file.slice(chunk.start, chunk.end),
          session,
          previousReceipts: this.sortedReceipts()
        });

        return normalizeChunkResult(chunk, session, result);
      } catch (error) {
        if (this.lifecycleAction === "cancel") {
          throw new UploadCanceledError(this.currentRecord?.id);
        }

        if (this.lifecycleAction === "pause") {
          throw new UploadPausedError(this.currentRecord?.id);
        }

        if (this.abortController.signal.aborted) {
          throw this.abortController.signal.reason ?? error;
        }

        if (isNonRetryableIngestError(error)) {
          throw error;
        }

        if (!shouldRetry(error, retryPolicy, {
          attempt: attempt + 1,
          chunk,
          manifestId: manifest.id,
          error
        })) {
          throw error;
        }

        if (attempt >= retryPolicy.maxAttempts - 1) {
          throw error;
        }

        this.emit({ type: "retry", manifestId: manifest.id, chunk, attempt: attempt + 1, error });
        await this.waitForRetryDelay(calculateRetryDelay(retryPolicy, attempt + 1));
      }
    }

    throw createIngestError("transport.failed", "Chunk upload failed.", true);
  }

  private async waitForRetryDelay(delayMs: number): Promise<void> {
    if (delayMs <= 0) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      if (this.abortController.signal.aborted) {
        reject(this.abortController.signal.reason);
        return;
      }

      const cleanup = (): void => {
        this.abortController.signal.removeEventListener("abort", abort);
      };
      const timeout = setTimeout(() => {
        cleanup();
        resolve();
      }, delayMs);
      const abort = (): void => {
        clearTimeout(timeout);
        cleanup();
        reject(this.abortController.signal.reason);
      };

      this.abortController.signal.addEventListener("abort", abort, { once: true });
    });
  }

  private async completeUpload(
    manifest: IngestManifest,
    session: TransportSession,
    record: ResumeRecord | undefined,
    chunkPlan: ChunkPlan,
    snapshotCreatedAt: string
  ): Promise<void> {
    this.throwIfStopped();
    this.updateSnapshot({
      manifest,
      chunkPlan,
      session,
      status: "completing",
      createdAt: snapshotCreatedAt
    });

    await this.options.transport.completeSession({
      manifest,
      file: this.file,
      signal: this.abortController.signal,
      uploadId: session.uploadId,
      session,
      receipts: this.sortedReceipts()
    });

    if (record) {
      await this.completeResumeRecord(record);
    }

    this.updateSnapshot({
      manifest,
      chunkPlan,
      session,
      status: "completed",
      createdAt: snapshotCreatedAt
    });
    this.emit({ type: "completed", manifest, uploadId: session.uploadId });
  }

  private async completeResumeRecord(record: ResumeRecord): Promise<void> {
    const store = this.options.resume?.store;
    if (!store) {
      return;
    }

    if (this.options.resume?.cleanup === "mark-complete") {
      await this.putResumeRecord(this.withStatus(record, "completed"));
      return;
    }

    try {
      await store.delete(record.id);
    } catch (error) {
      throw this.emitResumeConflict(
        "resume.store_failed",
        "The resume store could not delete the completed record.",
        record.id,
        error
      );
    }
  }

  private hydrateResumeSnapshot(manifest: IngestManifest, chunkPlan: ChunkPlan): void {
    const snapshot = this.options.resumeFrom;

    if (!snapshot) {
      return;
    }

    if (snapshot.manifestId !== manifest.id) {
      throw createIngestError(
        "transport.resume_failed",
        "Cannot resume upload because the snapshot manifest does not match the active manifest.",
        false,
        {
          expectedManifestId: manifest.id,
          snapshotManifestId: snapshot.manifestId
        }
      );
    }

    validateResumeChunkPlan(snapshot.chunkPlan, chunkPlan);

    for (const receipt of snapshot.completedChunks) {
      const chunk = chunkPlan.chunks[receipt.chunkIndex];
      if (!chunk) {
        throw createIngestError(
          "transport.receipt_invalid",
          "Cannot resume upload because a stored receipt references an unknown chunk.",
          false,
          { chunkIndex: receipt.chunkIndex }
        );
      }

      this.storeReceipt(chunk, receipt);
    }
  }

  private hydrateResumeRecord(
    record: ResumeRecord,
    chunkPlan: ChunkPlan,
    session: TransportSession
  ): void {
    for (const range of record.progress.completedChunkRanges) {
      for (let index = range.startIndex; index <= range.endIndexInclusive; index += 1) {
        const chunk = chunkPlan.chunks[index];

        if (!chunk) {
          continue;
        }

        this.completedReceipts.set(index, {
          chunkIndex: index,
          sizeBytes: chunk.size,
          completedAt: record.updatedAt,
          transport: {
            name: session.transportName
          }
        });
      }
    }
  }

  private async abortTransportSession(manifest: IngestManifest): Promise<void> {
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
        receipts: this.sortedReceipts()
      });
    } catch (error) {
      throw createIngestError(
        "transport.abort_failed",
        toErrorMessage(error, "Transport abort failed."),
        false
      );
    }
  }

  private async handleSessionError(
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
      this.currentRecord = await this.markRecordPaused(this.currentRecord);
    } else if (this.currentRecord && lifecycleStatus === "canceled") {
      this.currentRecord = await this.markRecordCanceled(this.currentRecord);
    } else if (!lifecycleStatus && !(error instanceof ResumeConflictError)) {
      await this.markCurrentRecordFailed(error);
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

  private normalizeStopError(error: unknown): unknown {
    if (this.lifecycleAction === "cancel" && !(error instanceof UploadCanceledError)) {
      return new UploadCanceledError(this.currentRecord?.id);
    }

    if (this.lifecycleAction === "pause" && !(error instanceof UploadPausedError)) {
      return new UploadPausedError(this.currentRecord?.id);
    }

    return error;
  }

  private storeReceipt(chunk: ChunkDescriptor, receipt: UploadChunkReceipt): void {
    this.completedReceipts.set(chunk.index, validateReceipt(chunk, receipt));
  }

  private sortedReceipts(): UploadChunkReceipt[] {
    return Array.from(this.completedReceipts.values()).sort(
      (left, right) => left.chunkIndex - right.chunkIndex
    );
  }

  private updateSnapshot(options: {
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
      completedChunks: this.sortedReceipts(),
      failedChunk: options.failedChunk,
      uploadedBytes: calculateUploadedBytes(this.sortedReceipts()),
      totalBytes: this.file.size,
      createdAt: options.createdAt,
      updatedAt: nowIso()
    };

    if (options.error !== undefined) {
      snapshot.error = toSnapshotError(options.error);
    }

    this.currentSnapshot = cloneSnapshot(snapshot);
    this.options.onSnapshot?.(cloneSnapshot(snapshot));
    this.emit({ type: "snapshot", snapshot: redactSnapshot(snapshot) });
    return cloneSnapshot(snapshot);
  }

  private async getResumeRecord(store: ResumeStore, recordId: string): Promise<ResumeRecord> {
    let record: ResumeRecord | undefined;
    try {
      record = await store.get(recordId);
    } catch (error) {
      throw this.emitResumeConflict(
        "resume.store_failed",
        "The resume store could not read the record.",
        recordId,
        error
      );
    }

    if (!record) {
      throw this.emitResumeConflict(
        "resume.record_not_found",
        "The requested resume record does not exist.",
        recordId
      );
    }

    return record;
  }

  private async putResumeRecord(record: ResumeRecord): Promise<ResumeRecord> {
    const store = this.requireResumeStore();
    this.currentRecord = record;

    try {
      await store.put(record);
    } catch (error) {
      throw this.emitResumeConflict(
        "resume.store_failed",
        "The resume store could not persist the record.",
        record.id,
        error
      );
    }

    return record;
  }

  private async markRecordPaused(record: ResumeRecord): Promise<ResumeRecord> {
    return this.putResumeRecord(this.withStatus(record, "paused"));
  }

  private async markRecordCanceled(record: ResumeRecord): Promise<ResumeRecord> {
    const canceled = await this.putResumeRecord(this.withStatus(record, "canceled"));
    this.emitCancel(canceled.id);
    return canceled;
  }

  private async markCurrentRecordFailed(error: unknown): Promise<void> {
    if (!this.currentRecord) {
      return;
    }

    if (this.isTerminalOrControlledStatus(this.currentRecord.progress.status)) {
      return;
    }

    const issueCode = this.toIssueCode(error);
    this.currentRecord = await this.putResumeRecord(
      this.withStatus(this.currentRecord, "failed", issueCode)
    );
  }

  private withStatus(
    record: ResumeRecord,
    status: ResumeRecordStatus,
    lastErrorCode?: IngestIssueCode
  ): ResumeRecord {
    const progress: ResumeRecord["progress"] = {
      ...record.progress,
      status
    };

    if (lastErrorCode !== undefined) {
      progress.lastErrorCode = lastErrorCode;
    }

    return {
      ...record,
      progress,
      updatedAt: nowIso()
    };
  }

  private withTransport(record: ResumeRecord, transport: ResumeTransportState): ResumeRecord {
    return {
      ...record,
      transport,
      updatedAt: nowIso()
    };
  }

  private createTransportState(session: TransportSession | UploadSessionResult): ResumeTransportState {
    const state: ResumeTransportState = {
      uploadId: session.uploadId
    };

    const transportName = "transportName" in session ? session.transportName : session.transportName;
    if (transportName !== undefined) {
      state.name = transportName;
    }

    if (session.resumeToken !== undefined) {
      state.resumeToken = session.resumeToken;
    }

    if (session.expiresAt !== undefined) {
      state.expiresAt = session.expiresAt;
    }

    const data = "data" in session ? session.data : session.remote;
    if (data !== undefined) {
      state.data = data;
    }

    return state;
  }

  private sumCompletedBytes(
    ranges: ResumeRecord["progress"]["completedChunkRanges"],
    chunks: readonly ChunkDescriptor[]
  ): number {
    let total = 0;

    for (const range of ranges) {
      for (let index = range.startIndex; index <= range.endIndexInclusive; index += 1) {
        total += chunks[index]?.size ?? 0;
      }
    }

    return total;
  }

  private requireResumeStore(): ResumeStore {
    const store = this.options.resume?.store;
    if (!store) {
      throw this.emitResumeConflict(
        "resume.store_failed",
        "A resume store is required for persistent resume operations."
      );
    }

    return store;
  }

  private emitResumeConflict(
    code: ResumeConflictError["code"],
    message: string,
    recordId?: string,
    error?: unknown
  ): ResumeConflictError {
    const conflict = createResumeConflict(code, message, recordId);
    const event: IngestEvent = { type: "resume:conflict", code, error: error ?? conflict };
    if (recordId !== undefined) {
      event.recordId = recordId;
    }
    this.emit(event);
    return conflict;
  }

  private emitPause(recordId: string | undefined): void {
    if (recordId === undefined) {
      this.emit({ type: "upload:paused" });
      return;
    }

    this.emit({ type: "upload:paused", recordId });
  }

  private emitCancel(recordId: string | undefined): void {
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

  private lifecycleStatus(): "paused" | "canceled" | undefined {
    if (this.lifecycleAction === "pause") {
      return "paused";
    }

    if (this.lifecycleAction === "cancel") {
      return "canceled";
    }

    return undefined;
  }

  private throwIfStopped(): void {
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

  private isTerminalOrControlledStatus(status: ResumeRecordStatus): boolean {
    return status === "completed" || status === "canceled" || status === "expired" || status === "paused";
  }

  private toIssueCode(error: unknown): IngestIssueCode {
    if (error instanceof ResumeConflictError) {
      return error.code;
    }

    if (isIngestError(error)) {
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

  private transportName(fallback?: string): string {
    return fallback ?? this.options.transport.capabilities?.name ?? "custom";
  }

  private emit(event: IngestEvent): void {
    this.options.onEvent?.(event);
  }
}

export function createIngestSession(
  file: IngestFileLike,
  options: CreateIngestSessionOptions
): LargeImageIngestSession {
  return new LargeImageIngestSession(file, options);
}

function normalizeTransportSession(
  session: TransportSession | UploadSessionResult,
  transportName: string,
  fallback?: Partial<TransportSession | ResumeTransportState>
): TransportSession {
  const normalized: TransportSession = {
    uploadId: session.uploadId,
    transportName: session.transportName ?? transportName,
    createdAt: session.createdAt ?? nowIso()
  };

  const expiresAt = session.expiresAt ?? fallback?.expiresAt;
  if (expiresAt !== undefined) {
    normalized.expiresAt = expiresAt;
  }

  const resumeToken = session.resumeToken ?? fallback?.resumeToken;
  if (resumeToken !== undefined) {
    normalized.resumeToken = resumeToken;
  }

  const secretsRef = "secretsRef" in session ? session.secretsRef : undefined;
  if (secretsRef !== undefined) {
    normalized.secretsRef = secretsRef;
  }

  const remote = session.remote ?? ("data" in session ? session.data : undefined);
  if (remote !== undefined) {
    normalized.remote = remote;
  }

  return normalized;
}

function normalizeChunkResult(
  chunk: ChunkDescriptor,
  session: TransportSession,
  result: void | UploadChunkResult | UploadChunkReceipt
): NormalizedUploadChunkResult {
  if (isUploadChunkReceipt(result)) {
    return {
      receipt: validateReceipt(chunk, result)
    };
  }

  return {
    receipt: {
      chunkIndex: chunk.index,
      sizeBytes: chunk.size,
      completedAt: nowIso(),
      transport: {
        name: session.transportName
      }
    },
    transportResult: result ?? undefined
  };
}

function isUploadChunkReceipt(value: unknown): value is UploadChunkReceipt {
  return Boolean(
    value &&
      typeof value === "object" &&
      "chunkIndex" in value &&
      "sizeBytes" in value &&
      "transport" in value
  );
}

function validateResumeChunkPlan(snapshotPlan: ChunkPlan, activePlan: ChunkPlan): void {
  if (
    snapshotPlan.chunkSize !== activePlan.chunkSize ||
    snapshotPlan.totalBytes !== activePlan.totalBytes ||
    snapshotPlan.totalChunks !== activePlan.totalChunks
  ) {
    throw createIngestError(
      "transport.resume_failed",
      "Cannot resume upload because the snapshot chunk plan does not match the active file.",
      false,
      {
        snapshotChunkSize: snapshotPlan.chunkSize,
        activeChunkSize: activePlan.chunkSize,
        snapshotTotalBytes: snapshotPlan.totalBytes,
        activeTotalBytes: activePlan.totalBytes
      }
    );
  }

  for (const activeChunk of activePlan.chunks) {
    const snapshotChunk = snapshotPlan.chunks[activeChunk.index];

    if (
      !snapshotChunk ||
      snapshotChunk.start !== activeChunk.start ||
      snapshotChunk.end !== activeChunk.end ||
      snapshotChunk.size !== activeChunk.size
    ) {
      throw createIngestError(
        "transport.resume_failed",
        "Cannot resume upload because the snapshot chunk ranges do not match the active file.",
        false,
        { chunkIndex: activeChunk.index }
      );
    }
  }
}

function validateChunkPlanForTransport(
  chunkPlan: ChunkPlan,
  capabilities: TransportCapabilities | undefined
): void {
  if (!capabilities) {
    return;
  }

  if (capabilities.maxChunkCount !== undefined && chunkPlan.totalChunks > capabilities.maxChunkCount) {
    throw createIngestError(
      "chunk.invalid_size",
      `Chunk plan exceeds transport max chunk count of ${capabilities.maxChunkCount}.`,
      false
    );
  }

  for (const chunk of chunkPlan.chunks) {
    const isFinalChunk = chunk.index === chunkPlan.totalChunks - 1;
    const minChunkSize = isFinalChunk
      ? capabilities.minFinalChunkSizeBytes ?? capabilities.minChunkSizeBytes
      : capabilities.minChunkSizeBytes;

    if (minChunkSize !== undefined && chunk.size < minChunkSize) {
      throw createIngestError(
        "chunk.invalid_size",
        `Chunk ${chunk.index} is smaller than the transport minimum chunk size.`,
        false,
        { chunkIndex: chunk.index, chunkSize: chunk.size, minChunkSize }
      );
    }

    if (capabilities.maxChunkSizeBytes !== undefined && chunk.size > capabilities.maxChunkSizeBytes) {
      throw createIngestError(
        "chunk.invalid_size",
        `Chunk ${chunk.index} is larger than the transport maximum chunk size.`,
        false,
        {
          chunkIndex: chunk.index,
          chunkSize: chunk.size,
          maxChunkSize: capabilities.maxChunkSizeBytes
        }
      );
    }
  }
}

function validateReceipt(
  chunk: ChunkDescriptor,
  receipt: UploadChunkReceipt | undefined
): UploadChunkReceipt {
  if (!receipt) {
    throw createIngestError(
      "transport.receipt_missing",
      `Transport did not return a receipt for chunk ${chunk.index}.`,
      false,
      { chunkIndex: chunk.index }
    );
  }

  if (receipt.chunkIndex !== chunk.index) {
    throw createIngestError(
      "transport.receipt_invalid",
      `Transport returned a receipt for chunk ${receipt.chunkIndex} while uploading chunk ${chunk.index}.`,
      false,
      { chunkIndex: chunk.index, receiptChunkIndex: receipt.chunkIndex }
    );
  }

  if (receipt.sizeBytes !== chunk.size) {
    throw createIngestError(
      "transport.receipt_invalid",
      `Transport returned a receipt with size ${receipt.sizeBytes} for chunk ${chunk.index}, expected ${chunk.size}.`,
      false,
      { chunkIndex: chunk.index, chunkSize: chunk.size, receiptSize: receipt.sizeBytes }
    );
  }

  return receipt;
}

function receiptsToRanges(receipts: readonly UploadChunkReceipt[]): CompletedChunkRange[] {
  return receipts
    .slice()
    .sort((left, right) => left.chunkIndex - right.chunkIndex)
    .reduce<CompletedChunkRange[]>((ranges, receipt) => {
      const previous = ranges[ranges.length - 1];

      if (!previous || receipt.chunkIndex > previous.endIndexInclusive + 1) {
        ranges.push({
          startIndex: receipt.chunkIndex,
          endIndexInclusive: receipt.chunkIndex
        });
        return ranges;
      }

      previous.endIndexInclusive = Math.max(previous.endIndexInclusive, receipt.chunkIndex);
      return ranges;
    }, []);
}

function calculateUploadedBytes(receipts: readonly UploadChunkReceipt[]): number {
  return receipts.reduce((total, receipt) => total + receipt.sizeBytes, 0);
}

function cloneSnapshot(snapshot: UploadSessionSnapshot): UploadSessionSnapshot {
  return {
    ...snapshot,
    transportSession: snapshot.transportSession
      ? { ...snapshot.transportSession, remote: cloneRecord(snapshot.transportSession.remote) }
      : undefined,
    chunkPlan: {
      ...snapshot.chunkPlan,
      chunks: snapshot.chunkPlan.chunks.map((chunk) => ({ ...chunk }))
    },
    completedChunks: snapshot.completedChunks.map(cloneReceipt),
    failedChunk: snapshot.failedChunk ? { ...snapshot.failedChunk } : undefined,
    error: snapshot.error ? { ...snapshot.error } : undefined,
    redactions: snapshot.redactions
      ? {
          transportSession: snapshot.redactions.transportSession
            ? [...snapshot.redactions.transportSession]
            : undefined,
          receipts: snapshot.redactions.receipts ? [...snapshot.redactions.receipts] : undefined
        }
      : undefined
  };
}

function redactSnapshot(snapshot: UploadSessionSnapshot): UploadSessionSnapshot {
  const redacted = cloneSnapshot(snapshot);
  const transportRedactions: string[] = [];
  const receiptRedactions: string[] = [];

  if (redacted.transportSession) {
    if (redacted.transportSession.resumeToken !== undefined) {
      delete redacted.transportSession.resumeToken;
      transportRedactions.push("resumeToken");
    }

    if (redacted.transportSession.secretsRef !== undefined) {
      delete redacted.transportSession.secretsRef;
      transportRedactions.push("secretsRef");
    }

    if (redacted.transportSession.remote !== undefined) {
      delete redacted.transportSession.remote;
      transportRedactions.push("remote");
    }
  }

  redacted.completedChunks = redacted.completedChunks.map((receipt) => {
    const transport = { ...receipt.transport };

    if (transport.location !== undefined) {
      delete transport.location;
      receiptRedactions.push("transport.location");
    }

    if (transport.opaque !== undefined) {
      delete transport.opaque;
      receiptRedactions.push("transport.opaque");
    }

    return {
      ...receipt,
      transport
    };
  });

  if (transportRedactions.length > 0 || receiptRedactions.length > 0) {
    redacted.redactions = {
      transportSession: unique(transportRedactions),
      receipts: unique(receiptRedactions)
    };
  }

  return redacted;
}

function cloneReceipt(receipt: UploadChunkReceipt): UploadChunkReceipt {
  return {
    ...receipt,
    checksum: receipt.checksum ? { ...receipt.checksum } : undefined,
    transport: {
      ...receipt.transport,
      opaque: cloneRecord(receipt.transport.opaque)
    }
  };
}

function cloneRecord<T extends Record<string, unknown> | undefined>(record: T): T {
  return record ? ({ ...record } as T) : record;
}

function unique(values: readonly string[]): string[] | undefined {
  const result = Array.from(new Set(values));
  return result.length > 0 ? result : undefined;
}

function normalizeRetryPolicy(
  policy: RetryPolicy | undefined,
  legacyRetries: number | undefined
): NormalizedRetryPolicy {
  const maxAttempts = policy?.maxAttempts ?? (legacyRetries ?? 2) + 1;
  assertRetryInteger(maxAttempts, "retryPolicy.maxAttempts", 1);

  const delayMs = policy?.delayMs ?? 0;
  assertRetryNumber(delayMs, "retryPolicy.delayMs");

  const backoffFactor = policy?.backoffFactor ?? 1;
  assertRetryNumber(backoffFactor, "retryPolicy.backoffFactor");
  if (backoffFactor < 1) {
    throw new RangeError("retryPolicy.backoffFactor must be at least 1.");
  }

  const maxDelayMs = policy?.maxDelayMs ?? Number.MAX_SAFE_INTEGER;
  assertRetryNumber(maxDelayMs, "retryPolicy.maxDelayMs");

  return {
    maxAttempts,
    delayMs,
    backoffFactor,
    maxDelayMs,
    jitter: policy?.jitter ?? "none",
    isRetryable: policy?.isRetryable
  };
}

function shouldRetry(
  error: unknown,
  policy: NormalizedRetryPolicy,
  context: RetryDecisionContext
): boolean {
  if (policy.isRetryable) {
    return policy.isRetryable(error, context);
  }

  return true;
}

function calculateRetryDelay(policy: NormalizedRetryPolicy, retryNumber: number): number {
  const baseDelay = policy.delayMs * Math.pow(policy.backoffFactor, Math.max(0, retryNumber - 1));
  const capped = Math.min(baseDelay, policy.maxDelayMs);

  if (policy.jitter === "full" && capped > 0) {
    return Math.floor(Math.random() * capped);
  }

  return capped;
}

function assertRetryInteger(value: number, name: string, min: number): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new RangeError(`${name} must be a safe integer greater than or equal to ${min}.`);
  }
}

function assertRetryNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }
}

function createIngestError(
  code: IngestIssueCode,
  message: string,
  retryable: boolean,
  details?: Record<string, unknown>
): IngestError {
  const error = new Error(message) as IngestError;
  error.code = code;
  error.retryable = retryable;

  if (details) {
    error.details = details;
  }

  return error;
}

function isIngestError(error: unknown): error is IngestError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      "retryable" in error
  );
}

function isNonRetryableIngestError(error: unknown): error is IngestError {
  return isIngestError(error) && error.retryable === false;
}

function toSnapshotError(error: unknown): UploadSessionSnapshot["error"] {
  if (isIngestError(error)) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable
    };
  }

  return {
    code: "transport.failed",
    message: toErrorMessage(error, "Upload failed."),
    retryable: false
  };
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return fallback;
}

function nowIso(): string {
  return new Date().toISOString();
}
