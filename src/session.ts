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
  CreateIngestSessionOptions,
  IngestEvent,
  IngestFileLike,
  IngestIssueCode,
  IngestManifest,
  ResumeRecord,
  ResumeRecordStatus,
  ResumeStore,
  ResumeTransportState,
  UploadChunkResult,
  UploadSessionResult
} from "./types.js";

const SUPPORTED_RESUME_SCHEMA_VERSION = "large-image-ingest.resume.v0.1";

export class LargeImageIngestSession {
  private readonly abortController = new AbortController();
  private cancelEmitted = false;
  private cancelRequested = false;
  private currentRecord: ResumeRecord | undefined;
  private pauseRequested = false;

  constructor(
    private readonly file: IngestFileLike,
    private readonly options: CreateIngestSessionOptions
  ) {}

  abort(reason?: unknown): void {
    this.abortController.abort(reason);
  }

  pause(_reason?: unknown): void {
    this.pauseRequested = true;
  }

  async cancel(_reason?: unknown): Promise<void> {
    this.cancelRequested = true;

    if (!this.abortController.signal.aborted) {
      this.abortController.abort(new UploadCanceledError(this.currentRecord?.id));
    }

    if (this.currentRecord) {
      this.currentRecord = await this.markRecordCanceled(this.currentRecord);
    } else {
      this.emitCancel(undefined);
    }
  }

  async start(): Promise<IngestManifest> {
    let manifest: IngestManifest | undefined;

    try {
      manifest = await createManifest(this.file, this.options);
      this.emit({ type: "validated", manifest });
      this.throwIfStopped();

      if (!manifest.validation.ok) {
        throw new Error("Cannot start upload because validation failed.");
      }

      const session = await this.options.transport.createSession({
        manifest,
        file: this.file,
        signal: this.abortController.signal
      });

      this.emit({ type: "started", manifest, uploadId: session.uploadId });

      const chunkPlan = planChunks(this.file.size, this.options.chunking);
      const record = await this.createInitialResumeRecord(manifest, session);

      await this.uploadRemainingChunks(manifest, session.uploadId, chunkPlan, record);
      await this.completeUpload(manifest, session.uploadId, record);

      return manifest;
    } catch (error) {
      await this.handleSessionError(error, manifest);
      throw this.normalizeStopError(error);
    }
  }

  async resume(recordId: string): Promise<IngestManifest> {
    const store = this.requireResumeStore();
    let manifest: IngestManifest | undefined;

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

      let session: UploadSessionResult;
      try {
        session = await this.options.transport.resumeSession({
          manifest,
          file: this.file,
          signal: this.abortController.signal,
          record
        });
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

      const activeRecord = await this.putResumeRecord(
        this.withTransport(
          this.withStatus(record, "active"),
          mergeTransportState(record.transport, session)
        )
      );

      this.emit({ type: "resume:started", recordId: activeRecord.id, manifestId: manifest.id });

      const chunkPlan = planChunks(this.file.size, this.options.chunking);
      await this.uploadRemainingChunks(manifest, activeRecord.transport.uploadId, chunkPlan, activeRecord);
      await this.completeUpload(manifest, activeRecord.transport.uploadId, this.currentRecord);

      return manifest;
    } catch (error) {
      await this.handleSessionError(error, manifest);
      throw this.normalizeStopError(error);
    }
  }

  private async createInitialResumeRecord(
    manifest: IngestManifest,
    session: UploadSessionResult
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
    uploadId: string,
    chunkPlan: ChunkPlan,
    record: ResumeRecord | undefined
  ): Promise<void> {
    let activeRecord = record;
    let uploadedBytes = activeRecord?.progress.uploadedBytes ?? 0;

    for (const chunk of chunkPlan.chunks) {
      if (activeRecord && isChunkCompleted(activeRecord.progress.completedChunkRanges, chunk.index)) {
        uploadedBytes = activeRecord.progress.uploadedBytes;
        continue;
      }

      this.throwIfStopped();
      this.emit({ type: "chunk:started", manifestId: manifest.id, chunk });

      const result = await this.uploadChunkWithRetry(manifest, uploadId, chunk);

      if (this.cancelRequested) {
        if (activeRecord) {
          activeRecord = await this.markRecordCanceled(activeRecord);
        } else {
          this.emitCancel(undefined);
        }
        throw new UploadCanceledError(activeRecord?.id);
      }

      if (activeRecord) {
        activeRecord = await this.checkpointChunk(activeRecord, chunk, chunkPlan, result);
        uploadedBytes = activeRecord.progress.uploadedBytes;
      } else {
        uploadedBytes += chunk.size;
      }

      this.emit({
        type: "chunk:completed",
        manifestId: manifest.id,
        chunk,
        uploadedBytes,
        totalBytes: this.file.size
      });

      if (this.pauseRequested) {
        if (activeRecord) {
          activeRecord = await this.markRecordPaused(activeRecord);
        }

        this.emitPause(activeRecord?.id);
        throw new UploadPausedError(activeRecord?.id);
      }
    }
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
      updatedAt: new Date().toISOString()
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
    uploadId: string,
    chunk: ChunkDescriptor
  ): Promise<UploadChunkResult | undefined> {
    const retries = this.options.retries ?? 2;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        this.throwIfStopped();
        const result = await this.options.transport.uploadChunk({
          manifest,
          file: this.file,
          signal: this.abortController.signal,
          uploadId,
          chunk,
          body: this.file.slice(chunk.start, chunk.end)
        });
        return result ?? undefined;
      } catch (error) {
        if (this.cancelRequested) {
          throw new UploadCanceledError(this.currentRecord?.id);
        }

        if (attempt >= retries) {
          throw error;
        }

        this.emit({ type: "retry", manifestId: manifest.id, chunk, attempt: attempt + 1, error });
      }
    }

    return undefined;
  }

  private async completeUpload(
    manifest: IngestManifest,
    uploadId: string,
    record: ResumeRecord | undefined
  ): Promise<void> {
    this.throwIfStopped();

    await this.options.transport.completeSession({
      manifest,
      file: this.file,
      signal: this.abortController.signal,
      uploadId
    });

    if (record) {
      await this.completeResumeRecord(record);
    }

    this.emit({ type: "completed", manifest, uploadId });
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
      updatedAt: new Date().toISOString()
    };
  }

  private withTransport(record: ResumeRecord, transport: ResumeTransportState): ResumeRecord {
    return {
      ...record,
      transport,
      updatedAt: new Date().toISOString()
    };
  }

  private createTransportState(session: UploadSessionResult): ResumeTransportState {
    const state: ResumeTransportState = {
      uploadId: session.uploadId
    };

    if (session.resumeToken !== undefined) {
      state.resumeToken = session.resumeToken;
    }

    if (session.expiresAt !== undefined) {
      state.expiresAt = session.expiresAt;
    }

    if (session.data !== undefined) {
      state.data = session.data;
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

  private async handleSessionError(error: unknown, manifest: IngestManifest | undefined): Promise<void> {
    if (this.cancelRequested) {
      if (this.currentRecord) {
        this.currentRecord = await this.markRecordCanceled(this.currentRecord);
      } else {
        this.emitCancel(undefined);
      }
      return;
    }

    if (error instanceof UploadPausedError || error instanceof ResumeConflictError) {
      return;
    }

    await this.markCurrentRecordFailed(error);
    this.emit(
      manifest
        ? { type: "failed", manifestId: manifest.id, error }
        : { type: "failed", error }
    );
  }

  private normalizeStopError(error: unknown): unknown {
    if (this.cancelRequested && !(error instanceof UploadCanceledError)) {
      return new UploadCanceledError(this.currentRecord?.id);
    }

    return error;
  }

  private throwIfStopped(): void {
    if (this.cancelRequested) {
      throw new UploadCanceledError(this.currentRecord?.id);
    }

    if (this.abortController.signal.aborted) {
      throw this.abortController.signal.reason ?? new Error("Upload aborted.");
    }
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

  private isTerminalOrControlledStatus(status: ResumeRecordStatus): boolean {
    return status === "completed" || status === "canceled" || status === "expired" || status === "paused";
  }

  private toIssueCode(error: unknown): IngestIssueCode {
    if (error instanceof ResumeConflictError) {
      return error.code;
    }

    if (this.abortController.signal.aborted) {
      return "transport.aborted";
    }

    return "transport.failed";
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
