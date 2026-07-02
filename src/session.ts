import { planChunks } from "./chunks.js";
import { LargeImageIngestError, isLargeImageIngestError } from "./errors.js";
import { createManifest } from "./manifest.js";
import type {
  ChecksumOptions,
  ChecksumProgress,
  ChunkDescriptor,
  CreateIngestSessionOptions,
  FileChecksum,
  IngestEvent,
  IngestFileLike,
  IngestManifest,
  IngestSessionSnapshot,
  IngestSessionState
} from "./types.js";

export class LargeImageIngestSession {
  private readonly abortController = new AbortController();
  private readonly createdAt = new Date().toISOString();
  private readonly uploadedChunks = new Set<number>();
  private resumeWaiters: Array<() => void> = [];
  private manifest: IngestManifest | undefined;
  private nextChunkIndex = 0;
  private state: IngestSessionState = "idle";
  private uploadedBytes = 0;
  private uploadId: string | undefined;

  constructor(
    private readonly file: IngestFileLike,
    private readonly options: CreateIngestSessionOptions
  ) {
    this.emit({ type: "session:created", state: this.state });
  }

  abort(reason?: unknown): void {
    if (this.isTerminal()) {
      return;
    }

    const abortedError =
      isLargeImageIngestError(reason) && reason.code === "session.aborted"
        ? reason
        : new LargeImageIngestError("session.aborted", "Upload aborted.", { reason });

    this.abortController.abort(abortedError);
    this.releaseResumeWaiters();
  }

  getSnapshot(): IngestSessionSnapshot | undefined {
    if (!this.manifest) {
      return undefined;
    }

    const snapshot: IngestSessionSnapshot = {
      schemaVersion: "large-image-ingest.session.v1",
      createdAt: this.createdAt,
      manifest: this.manifest,
      nextChunkIndex: this.nextChunkIndex,
      state: this.state,
      updatedAt: new Date().toISOString(),
      uploadedBytes: this.uploadedBytes,
      uploadedChunks: [...this.uploadedChunks].sort((left, right) => left - right)
    };

    if (this.uploadId !== undefined) {
      snapshot.uploadId = this.uploadId;
    }

    return snapshot;
  }

  getState(): IngestSessionState {
    return this.state;
  }

  pause(): IngestSessionSnapshot {
    if (this.state !== "ready" && this.state !== "uploading") {
      throw new LargeImageIngestError(
        "session.invalid_state",
        `Cannot pause an ingest session while it is ${this.state}.`,
        { state: this.state }
      );
    }

    this.setState("paused");
    const snapshot = this.requireSnapshot();
    this.emit({ type: "upload:paused", snapshot, state: this.state });
    return snapshot;
  }

  resume(): void {
    if (this.state !== "paused") {
      throw new LargeImageIngestError(
        "session.invalid_state",
        `Cannot resume an ingest session while it is ${this.state}.`,
        { state: this.state }
      );
    }

    this.setState("uploading");
    const snapshot = this.requireSnapshot();
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    for (const waiter of waiters) {
      waiter();
    }
    this.emit({ type: "upload:resumed", snapshot, state: this.state });
  }

  async start(): Promise<IngestManifest> {
    try {
      this.throwIfAborted();
      const manifest = await this.prepareManifest();

      if (!manifest.validation.ok) {
        throw new LargeImageIngestError("validation.failed", "Cannot start upload because validation failed.", {
          issues: manifest.validation.issues
        });
      }

      this.setState("ready");
      const uploadId = await this.prepareUploadSession(manifest);
      this.uploadId = uploadId;
      this.setState("uploading");
      this.emit({ type: "upload:started", manifest, state: this.state, uploadId });

      const chunkPlan = planChunks(this.file.size, this.options.chunking);
      for (let index = this.nextChunkIndex; index < chunkPlan.chunks.length; index += 1) {
        const chunk = chunkPlan.chunks[index];
        if (!chunk) {
          continue;
        }

        await this.waitIfPaused();
        this.throwIfAborted();
        this.nextChunkIndex = index;

        if (this.uploadedChunks.has(chunk.index)) {
          this.emitSkipped(manifest, uploadId, chunk);
          continue;
        }

        const shouldUpload = await this.shouldUploadChunk(manifest, uploadId, chunk);
        if (!shouldUpload) {
          this.markChunkUploaded(chunk);
          this.emitSkipped(manifest, uploadId, chunk);
          this.emitProgress(manifest, uploadId, chunkPlan.totalChunks);
          continue;
        }

        this.emit({ type: "chunk:started", manifestId: manifest.id, chunk, state: this.state, uploadId });
        await this.uploadChunkWithRetry(manifest, uploadId, chunk);
        this.markChunkUploaded(chunk);
        this.nextChunkIndex = index + 1;
        this.emit({
          type: "chunk:completed",
          manifestId: manifest.id,
          chunk,
          state: this.state,
          totalBytes: this.file.size,
          uploadId,
          uploadedBytes: this.uploadedBytes
        });
        this.emitProgress(manifest, uploadId, chunkPlan.totalChunks);
      }

      this.throwIfAborted();
      await this.callTransport(
        "completeSession",
        () =>
          this.options.transport.completeSession({
            manifest,
            file: this.file,
            signal: this.abortController.signal,
            uploadId
          }),
        { manifestId: manifest.id, uploadId }
      );

      this.setState("completed");
      this.emit({ type: "upload:completed", manifest, state: this.state, uploadId });
      return manifest;
    } catch (error) {
      const normalized = this.normalizeError(error);
      const manifestId = this.manifest?.id;

      if (isLargeImageIngestError(normalized) && normalized.code === "session.aborted") {
        this.setState("aborted");
        this.emitUploadAborted(normalized, manifestId);
      } else {
        this.setState("failed");
        this.emitUploadFailed(normalized, manifestId);
      }

      throw normalized;
    }
  }

  private async prepareManifest(): Promise<IngestManifest> {
    const snapshot = this.options.resumeFrom;
    if (snapshot) {
      this.assertSnapshotMatchesFile(snapshot);
      this.manifest = snapshot.manifest;
      this.uploadId = snapshot.uploadId;
      this.uploadedBytes = snapshot.uploadedBytes;
      this.nextChunkIndex = snapshot.nextChunkIndex;
      this.uploadedChunks.clear();
      for (const chunkIndex of snapshot.uploadedChunks) {
        this.uploadedChunks.add(chunkIndex);
      }
      this.emit({ type: "manifest:created", manifest: snapshot.manifest, state: this.state });
      return snapshot.manifest;
    }

    this.setState("validating");
    this.emit({ type: "validation:started", state: this.state });
    if (this.options.checksum !== false) {
      this.emit({ type: "checksum:started", state: this.state });
    }

    let manifest: IngestManifest;
    try {
      manifest = await createManifest(this.file, this.createManifestOptions());
    } catch (error) {
      throw this.wrapCoreError("manifest.failed", "Manifest creation failed.", error);
    }

    this.manifest = manifest;
    this.emit({ type: "validation:completed", manifest, state: this.state });
    if (manifest.original.checksum) {
      this.emit({ type: "checksum:completed", checksum: manifest.original.checksum, state: this.state });
    }
    this.emit({ type: "manifest:created", manifest, state: this.state });
    return manifest;
  }

  private async prepareUploadSession(manifest: IngestManifest): Promise<string> {
    const snapshot = this.options.resumeFrom;
    if (snapshot?.uploadId) {
      if (this.options.transport.resumeSession) {
        const resumed = await this.callTransport(
          "resumeSession",
          () =>
            this.options.transport.resumeSession?.({
              manifest,
              file: this.file,
              signal: this.abortController.signal,
              snapshot
            }),
          { manifestId: manifest.id, uploadId: snapshot.uploadId }
        );
        if (!resumed) {
          throw new LargeImageIngestError("transport.failed", "Transport resumeSession did not return an upload ID.", {
            operation: "resumeSession",
            manifestId: manifest.id,
            uploadId: snapshot.uploadId
          });
        }
        return resumed.uploadId;
      }

      return snapshot.uploadId;
    }

    const session = await this.callTransport(
      "createSession",
      () =>
        this.options.transport.createSession({
          manifest,
          file: this.file,
          signal: this.abortController.signal
        }),
      { manifestId: manifest.id }
    );
    return session.uploadId;
  }

  private async shouldUploadChunk(
    manifest: IngestManifest,
    uploadId: string,
    chunk: ChunkDescriptor
  ): Promise<boolean> {
    if (!this.options.transport.shouldUploadChunk) {
      return true;
    }

    const context = {
      manifest,
      file: this.file,
      signal: this.abortController.signal,
      uploadId,
      chunk
    };

    const resumeFrom = this.options.resumeFrom;
    if (resumeFrom) {
      const shouldUpload = await this.callTransport(
        "shouldUploadChunk",
        () =>
          this.options.transport.shouldUploadChunk?.({
            ...context,
            snapshot: resumeFrom
          }),
        { manifestId: manifest.id, uploadId, chunkIndex: chunk.index }
      );
      return shouldUpload ?? true;
    }

    const shouldUpload = await this.callTransport(
      "shouldUploadChunk",
      () => this.options.transport.shouldUploadChunk?.(context),
      { manifestId: manifest.id, uploadId, chunkIndex: chunk.index }
    );
    return shouldUpload ?? true;
  }

  private async uploadChunkWithRetry(
    manifest: IngestManifest,
    uploadId: string,
    chunk: ChunkDescriptor
  ): Promise<void> {
    const retries = this.options.retries ?? 2;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        this.throwIfAborted();
        await this.callTransport(
          "uploadChunk",
          () =>
            this.options.transport.uploadChunk({
              manifest,
              file: this.file,
              signal: this.abortController.signal,
              uploadId,
              chunk,
              body: this.file.slice(chunk.start, chunk.end)
            }),
          { manifestId: manifest.id, uploadId, chunkIndex: chunk.index }
        );
        return;
      } catch (error) {
        const normalized = this.normalizeError(error);
        if (attempt >= retries || this.isAbortError(normalized)) {
          throw normalized;
        }

        this.emit({
          type: "chunk:retry",
          manifestId: manifest.id,
          chunk,
          attempt: attempt + 1,
          error: normalized,
          state: this.state,
          uploadId
        });
      }
    }
  }

  private createSessionChecksumOptions(): ChecksumOptions | false {
    if (this.options.checksum === false) {
      return false;
    }

    const checksumOptions = this.options.checksum ?? {};
    return {
      ...checksumOptions,
      onProgress: (progress: ChecksumProgress) => {
        checksumOptions.onProgress?.(progress);
        this.emit({ type: "checksum:progress", progress, state: this.state });
      }
    };
  }

  private createManifestOptions(): Parameters<typeof createManifest>[1] {
    const options: Parameters<typeof createManifest>[1] = {};
    options.checksum = this.createSessionChecksumOptions();

    if (this.options.chunking !== undefined) {
      options.chunking = this.options.chunking;
    }
    if (this.options.image !== undefined) {
      options.image = this.options.image;
    }
    if (this.options.metadata !== undefined) {
      options.metadata = this.options.metadata;
    }
    if (this.options.retries !== undefined) {
      options.retries = this.options.retries;
    }
    if (this.options.storage !== undefined) {
      options.storage = this.options.storage;
    }
    if (this.options.validation !== undefined) {
      options.validation = this.options.validation;
    }

    return options;
  }

  private assertSnapshotMatchesFile(snapshot: IngestSessionSnapshot): void {
    const original = snapshot.manifest.original;
    const lastModifiedAt =
      this.file.lastModified === undefined ? undefined : new Date(this.file.lastModified).toISOString();

    const matches =
      original.name === this.file.name &&
      original.sizeBytes === this.file.size &&
      original.mediaType === (this.file.type || "application/octet-stream") &&
      (original.lastModifiedAt === undefined || original.lastModifiedAt === lastModifiedAt);

    if (!matches) {
      throw new LargeImageIngestError(
        "session.snapshot_file_mismatch",
        "Resume snapshot does not match the provided file.",
        {
          expected: {
            name: original.name,
            sizeBytes: original.sizeBytes,
            mediaType: original.mediaType,
            lastModifiedAt: original.lastModifiedAt
          },
          actual: {
            name: this.file.name,
            sizeBytes: this.file.size,
            mediaType: this.file.type || "application/octet-stream",
            lastModifiedAt
          }
        }
      );
    }
  }

  private emitProgress(manifest: IngestManifest, uploadId: string, totalChunks: number): void {
    this.emit({
      type: "upload:progress",
      completedChunks: this.uploadedChunks.size,
      manifestId: manifest.id,
      state: this.state,
      totalBytes: this.file.size,
      totalChunks,
      uploadId,
      uploadedBytes: this.uploadedBytes
    });
  }

  private emitSkipped(manifest: IngestManifest, uploadId: string, chunk: ChunkDescriptor): void {
    this.emit({ type: "chunk:skipped", manifestId: manifest.id, chunk, state: this.state, uploadId });
  }

  private async callTransport<T>(
    operation: string,
    action: () => Promise<T> | T,
    details: Record<string, unknown> = {}
  ): Promise<T> {
    try {
      this.throwIfAborted();
      return await action();
    } catch (error) {
      throw this.wrapCoreError("transport.failed", `Transport ${operation} failed.`, error, {
        operation,
        ...details
      });
    }
  }

  private emitUploadAborted(error: unknown, manifestId: string | undefined): void {
    if (manifestId) {
      this.emit({ type: "upload:aborted", manifestId, error, state: this.state });
      return;
    }

    this.emit({ type: "upload:aborted", error, state: this.state });
  }

  private emitUploadFailed(error: unknown, manifestId: string | undefined): void {
    if (manifestId) {
      this.emit({ type: "upload:failed", manifestId, error, state: this.state });
      return;
    }

    this.emit({ type: "upload:failed", error, state: this.state });
  }

  private isAbortError(error: unknown): boolean {
    return isLargeImageIngestError(error) && error.code === "session.aborted";
  }

  private isTerminal(): boolean {
    return this.state === "completed" || this.state === "failed" || this.state === "aborted";
  }

  private markChunkUploaded(chunk: ChunkDescriptor): void {
    if (!this.uploadedChunks.has(chunk.index)) {
      this.uploadedChunks.add(chunk.index);
      this.uploadedBytes += chunk.size;
    }
  }

  private normalizeError(error: unknown): unknown {
    if (this.abortController.signal.aborted) {
      return this.abortController.signal.reason instanceof Error
        ? this.abortController.signal.reason
        : new LargeImageIngestError("session.aborted", "Upload aborted.", {
            reason: this.abortController.signal.reason
          });
    }

    if (isLargeImageIngestError(error)) {
      return error;
    }

    return new LargeImageIngestError("session.failed", "Ingest session failed.", {
      cause: serializeError(error)
    });
  }

  private requireSnapshot(): IngestSessionSnapshot {
    const snapshot = this.getSnapshot();
    if (!snapshot) {
      throw new LargeImageIngestError("session.invalid_state", "Cannot create a snapshot before manifest creation.");
    }
    return snapshot;
  }

  private setState(state: IngestSessionState): void {
    this.state = state;
  }

  private releaseResumeWaiters(): void {
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    for (const waiter of waiters) {
      waiter();
    }
  }

  private throwIfAborted(): void {
    if (this.abortController.signal.aborted) {
      throw this.normalizeError(new LargeImageIngestError("session.aborted", "Upload aborted."));
    }
  }

  private async waitIfPaused(): Promise<void> {
    while (this.state === "paused") {
      this.throwIfAborted();
      await new Promise<void>((resolve) => {
        this.resumeWaiters.push(resolve);
      });
      this.throwIfAborted();
    }
  }

  private wrapCoreError(
    code: "manifest.failed" | "session.failed" | "transport.failed",
    message: string,
    error: unknown,
    details: Record<string, unknown> = {}
  ): LargeImageIngestError {
    if (this.abortController.signal.aborted) {
      return this.abortController.signal.reason instanceof LargeImageIngestError
        ? this.abortController.signal.reason
        : new LargeImageIngestError("session.aborted", "Upload aborted.", {
            reason: this.abortController.signal.reason
          });
    }

    if (isLargeImageIngestError(error)) {
      return error;
    }

    return new LargeImageIngestError(code, message, {
      ...details,
      cause: serializeError(error)
    });
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

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return { value: error };
}
