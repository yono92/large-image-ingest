import { planChunks } from "./chunks.js";
import { createManifest } from "./manifest.js";
import { calculateBlobSha256, checksumValuesEqual } from "./checksum.js";
import { ChunkIntegrityError } from "./errors.js";
import {
  domainProfileReferencesEqual,
  validateDomainProfileSessionBinding
} from "./profiles.js";
import {
  ResumeConflictError,
  UploadCanceledError,
  UploadPausedError,
  chunkingIdentityMatches,
  classifyPersistentResume,
  createContentSourceIdentity,
  createContentSourceIdentityFromChecksum,
  createResumeChunkingIdentity,
  createResumeConflict,
  createResumeFileIdentity,
  createPersistentResumeRecord,
  createResumeRecord,
  fileIdentityMatches,
  getNextIncompleteChunkIndex,
  isChunkCompleted,
  isResumeRecordExpired,
  mergeCompletedChunkRange,
  mergeTransportState,
  normalizeTransportRecoveryCapabilities,
  parseResumeRecord
} from "./resume.js";
import type {
  ChunkDescriptor,
  ChunkIntegrityEvidence,
  ChunkPlan,
  CompletedChunkRange,
  ContentSourceIdentityV1,
  CreateIngestSessionOptions,
  IngestError,
  IngestErrorCode,
  IngestEvent,
  IngestFileLike,
  IngestIssueCode,
  IngestManifest,
  IngestObserverFailure,
  ResumeRecord,
  ResumeCompatibilityResult,
  ResumeConflictCode,
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

const CURRENT_RESUME_SCHEMA_VERSION = "large-image-ingest.resume.v0.3";
const PARALLEL_RESUME_SCHEMA_VERSION = "large-image-ingest.resume.v0.4";
const PARALLEL_POLICY_ID = "parallel-worker-pool-v1";
const CHUNK_INTEGRITY_POLICY_ID = "chunk-sha256-base64-v1";

interface NormalizedUploadChunkResult {
  receipt: UploadChunkReceipt;
  transportResult?: UploadChunkResult | undefined;
  attemptId?: string | undefined;
  attemptNumber?: number | undefined;
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
  private resumeSourceIdentity: ContentSourceIdentityV1 | undefined;
  private parallelSourceIdentity: ContentSourceIdentityV1 | undefined;
  private readonly completedReceipts = new Map<number, UploadChunkReceipt>();
  private readonly inFlightChunks = new Set<number>();
  private readonly retryableChunks = new Set<number>();
  private readonly failedChunks = new Set<number>();
  private readonly ambiguousChunks = new Set<number>();

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

    // The running authority publishes cancellation after every worker and
    // serialized receipt commit has settled.
  }

  getSnapshot(): UploadSessionSnapshot | undefined {
    return this.currentSnapshot ? cloneSnapshot(this.currentSnapshot) : undefined;
  }

  async start(): Promise<IngestManifest> {
    let manifest: IngestManifest | undefined;
    let chunkPlan: ChunkPlan | undefined;
    let contentIdentity: ContentSourceIdentityV1 | undefined;
    const snapshotCreatedAt = this.options.resumeFrom?.createdAt ?? nowIso();

    try {
      this.throwIfStopped();
      manifest = this.options.manifest ?? await createManifest(this.file, this.createManifestOptions());
      this.validateDomainProfileBinding(manifest);
      this.emit({ type: "validated", manifest });

      if (!manifest.validation.ok) {
        throw createIngestError(
          "validation.failed",
          "Cannot start upload because validation failed.",
          false
        );
      }

      chunkPlan = planChunks(this.file.size, this.options.chunking);
      validateChunkPlanForTransport(chunkPlan, this.options.transport.capabilities);
      this.validateParallelAdmission();
      this.validateRequestedResumeCapability();
      if (this.options.resume && !this.options.resumeFrom) {
        contentIdentity = await this.prepareContentSourceIdentity(manifest);
      }
      if (this.options.parallel) {
        contentIdentity ??= await this.prepareContentSourceIdentity(manifest);
        this.parallelSourceIdentity = contentIdentity;
      }
      await this.validateParallelSnapshot(manifest, chunkPlan);
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
        : await this.createInitialResumeRecord(manifest, session, contentIdentity);

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

      if (!this.options.transport.resumeSession) {
        throw this.emitResumeConflict(
          "resume.transport_unsupported",
          "The configured upload transport does not support persistent resume.",
          record.id
        );
      }

      chunkPlan = planChunks(this.file.size, this.options.chunking);
      validateChunkPlanForTransport(chunkPlan, this.options.transport.capabilities);
      this.validateParallelAdmission();
      this.validateParallelResume(record, chunkPlan);
      this.resumeSourceIdentity = await this.validateResumeRecord(record, store);
      this.parallelSourceIdentity = this.resumeSourceIdentity;

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
        if (
          isIngestError(error) &&
          (error.code === "resume.receipt_missing" || error.code === "resume.receipt_invalid")
        ) {
          throw this.emitResumeConflict(error.code, error.message, record.id, error);
        }

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
      this.hydrateResumeRecord(record, chunkPlan, session);
      const reconciledRecord = await this.reconcileParallelResume(record, manifest, session, chunkPlan);
      manifest.upload.transport = { name: session.transportName };
      const activeRecord = await this.putResumeRecord(
        this.withTransport(
          this.withStatus(reconciledRecord, "active"),
          mergeTransportState(reconciledRecord.transport, this.createTransportState(session))
        )
      );

      this.emit({ type: "resume:started", recordId: activeRecord.id, manifestId: manifest.id });

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
      signal: this.abortController.signal,
      ...(this.options.parallel ? { parallel: this.parallelState(chunkPlan) } : {})
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

  private createManifestOptions(): CreateIngestSessionOptions {
    if (this.options.checksum === false) {
      return this.options;
    }
    return {
      ...this.options,
      checksum: this.withSessionChecksumAuthority(this.options.checksum ?? {})
    };
  }

  private validateDomainProfileBinding(manifest: IngestManifest): void {
    const binding = this.options.domainProfile;
    if (binding && !validateDomainProfileSessionBinding(binding, manifest.id)) {
      throw createIngestError(
        "profile.binding_invalid",
        "The domain profile binding is invalid for this manifest.",
        false
      );
    }
  }

  private async prepareContentSourceIdentity(
    manifest: IngestManifest
  ): Promise<ContentSourceIdentityV1> {
    if (manifest.original.checksum) {
      return createContentSourceIdentityFromChecksum(
        manifest.original.sizeBytes,
        manifest.original.checksum
      );
    }
    return this.calculateSelectedSourceIdentity();
  }

  private calculateSelectedSourceIdentity(): Promise<ContentSourceIdentityV1> {
    const configured = this.options.sourceIdentity ?? (
      this.options.checksum === false ? {} : this.options.checksum ?? {}
    );
    return createContentSourceIdentity(
      this.file,
      this.withSessionChecksumAuthority(configured)
    );
  }

  private withSessionChecksumAuthority(
    options: NonNullable<CreateIngestSessionOptions["sourceIdentity"]>
  ): NonNullable<CreateIngestSessionOptions["sourceIdentity"]> {
    const userObserver = options.onObserverError;
    return {
      ...options,
      signal: combineAbortSignals(this.abortController.signal, options.signal),
      onObserverError: (failure) => {
        this.reportObserverFailure({ observer: "checksum", error: failure.error });
        try {
          userObserver?.(failure);
        } catch {
          // Checksum observer reporting is isolated from ingest authority.
        }
      }
    };
  }

  private async createInitialResumeRecord(
    manifest: IngestManifest,
    session: TransportSession,
    contentIdentity: ContentSourceIdentityV1 | undefined
  ): Promise<ResumeRecord | undefined> {
    const store = this.options.resume?.store;
    if (!store) {
      return undefined;
    }

    if (!contentIdentity) {
      throw createIngestError(
        "resume.identity_missing",
        "Persistent resume requires whole-file source identity.",
        false
      );
    }
    const record = createPersistentResumeRecord({
      manifest,
      file: await createResumeFileIdentity(this.file),
      contentIdentity,
      chunking: createResumeChunkingIdentity(this.file.size, this.options.chunking),
      transport: this.createTransportState(session),
      ...(this.options.parallel
        ? { parallel: this.parallelState(planChunks(this.file.size, this.options.chunking))! }
        : {}),
      ...(this.options.domainProfile
        ? { domainProfile: this.options.domainProfile.profile }
        : {})
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
      schemaVersion: "large-image-ingest.resume.v0.2",
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
      ...(this.options.domainProfile
        ? { domainProfile: this.options.domainProfile.profile }
        : {}),
      receipts: snapshot.completedChunks.map(cloneReceipt),
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

  private async validateResumeRecord(
    record: ResumeRecord,
    store: ResumeStore
  ): Promise<ContentSourceIdentityV1> {
    if (isResumeRecordExpired(record)) {
      const expired = await this.putResumeRecord(this.withStatus(record, "expired", "resume.expired"));
      this.emit({ type: "resume:expired", recordId: expired.id });
      throw this.emitResumeConflict(
        "resume.expired",
        "The stored remote resume handle has expired.",
        expired.id
      );
    }

    if (record.progress.status === "completed" || record.progress.status === "canceled") {
      throw this.emitResumeConflict(
        "resume.record_not_found",
        "The resume record is terminal and cannot be resumed.",
        record.id
      );
    }

    if (!normalizeTransportRecoveryCapabilities(this.options.transport.capabilities).persistentResume) {
      throw this.emitResumeConflict(
        "resume.transport_unsupported",
        "The configured upload transport does not support persistent resume.",
        record.id
      );
    }

    const activeTransportName = this.options.transport.capabilities?.name;
    if (activeTransportName && record.transport.name && activeTransportName !== record.transport.name) {
      throw this.emitResumeConflict(
        "resume.transport_mismatch",
        "The stored resume transport does not match the configured transport.",
        record.id
      );
    }

    const activeProfile = this.options.domainProfile?.profile;
    if (!domainProfileReferencesEqual(record.domainProfile, activeProfile)) {
      throw this.emitResumeConflict(
        "resume.profile_mismatch",
        "The stored resume profile does not match the configured domain profile.",
        record.id
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

    const sourceIdentity = await this.calculateSelectedSourceIdentity();
    const classification = await classifyPersistentResume(record, this.file, {
      ...this.options.chunking,
      ...(this.options.transport.capabilities
        ? { capabilities: this.options.transport.capabilities }
        : {}),
      sourceIdentity,
      ...(activeProfile ? { domainProfile: activeProfile } : {})
    });
    if (classification.status !== "resumable" && classification.status !== "upgradeable") {
      const code = classification.status === "restart_only"
        ? "resume.restart_required"
        : compatibilityConflictCode(classification.reason);
      throw this.emitResumeConflict(
        code,
        compatibilityConflictMessage(classification.reason),
        record.id
      );
    }

    if (record.schemaVersion === PARALLEL_RESUME_SCHEMA_VERSION) {
      await this.validatePersistedParallelEvidence(record);
    }

    this.currentRecord = record;
    void store;
    return sourceIdentity;
  }

  private async uploadRemainingChunks(
    manifest: IngestManifest,
    session: TransportSession,
    chunkPlan: ChunkPlan,
    record: ResumeRecord | undefined,
    snapshotCreatedAt: string
  ): Promise<ResumeRecord | undefined> {
    if (this.options.parallel) {
      return this.uploadRemainingChunksParallel(manifest, session, chunkPlan, record, snapshotCreatedAt);
    }
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

  private async uploadRemainingChunksParallel(
    manifest: IngestManifest,
    session: TransportSession,
    chunkPlan: ChunkPlan,
    record: ResumeRecord | undefined,
    snapshotCreatedAt: string
  ): Promise<ResumeRecord | undefined> {
    const remaining = chunkPlan.chunks.filter((chunk) => !this.completedReceipts.has(chunk.index));
    let cursor = 0;
    let activeRecord = record;
    let failure: unknown;
    let commitQueue = Promise.resolve();

    const commit = (chunk: ChunkDescriptor, result: NormalizedUploadChunkResult): Promise<void> => {
      const next = commitQueue.then(async () => {
        if (this.completedReceipts.has(chunk.index)) return;
        this.storeReceipt(chunk, result.receipt);
        if (activeRecord) activeRecord = await this.checkpointChunk(activeRecord, chunk, chunkPlan, result.transportResult);
        const uploadedBytes = calculateUploadedBytes(this.sortedReceipts());
        this.emit({
          type: "chunk:completed",
          manifestId: manifest.id,
          chunk,
          uploadedBytes,
          totalBytes: this.file.size,
          ...(result.attemptId && result.attemptNumber !== undefined
            ? { attemptId: result.attemptId, attemptNumber: result.attemptNumber }
            : {})
        });
        this.updateSnapshot({ manifest, chunkPlan, session, status: "uploading", createdAt: snapshotCreatedAt });
      });
      commitQueue = next.catch(() => undefined);
      return next;
    };

    const worker = async (): Promise<void> => {
      while (!failure && cursor < remaining.length) {
        if (this.abortController.signal.aborted) {
          failure ??= this.abortController.signal.reason;
          return;
        }
        const chunk = remaining[cursor++];
        if (!chunk) return;
        try {
          const integrity = await this.createChunkIntegrity(manifest, session, chunk);
          const result = await this.uploadChunkWithRetry(manifest, session, chunk, integrity);
          await commit(chunk, result);
        } catch (error) {
          if (!failure) {
            failure = error;
            if (this.lifecycleAction) this.ambiguousChunks.add(chunk.index);
            else this.failedChunks.add(chunk.index);
            if (!this.abortController.signal.aborted) this.abortController.abort(error);
          } else if (!this.completedReceipts.has(chunk.index)) {
            this.ambiguousChunks.add(chunk.index);
          }
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(this.effectiveConcurrency(chunkPlan), remaining.length) }, () => worker()));
    await commitQueue;
    if (failure) throw failure;
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
    const updatedAt = nowIso();
    let nextRecord: ResumeRecord;
    if (record.schemaVersion === CURRENT_RESUME_SCHEMA_VERSION || record.schemaVersion === PARALLEL_RESUME_SCHEMA_VERSION) {
      nextRecord = ({
        ...record,
        ...(record.schemaVersion === PARALLEL_RESUME_SCHEMA_VERSION
          ? { parallel: { ...record.parallel, ambiguousChunkIndexes: [...this.ambiguousChunks].sort((a, b) => a - b) } }
          : {}),
        transport,
        receipts: this.sortedReceipts().map(cloneReceipt),
        progress,
        updatedAt
      } as ResumeRecord);
    } else if (
      this.resumeSourceIdentity &&
      (record.schemaVersion === "large-image-ingest.resume.v0.2" || record.progress.uploadedBytes === 0)
    ) {
      nextRecord = ({
        ...record,
        schemaVersion: this.options.parallel ? PARALLEL_RESUME_SCHEMA_VERSION : CURRENT_RESUME_SCHEMA_VERSION,
        file: {
          ...record.file,
          contentIdentity: { ...this.resumeSourceIdentity }
        },
        transport,
        receipts: this.sortedReceipts().map(cloneReceipt),
        ...(this.options.parallel ? { parallel: this.parallelState(chunkPlan)! } : {}),
        progress,
        updatedAt
      } as ResumeRecord);
    } else {
      nextRecord = {
        ...record,
        transport,
        progress,
        updatedAt
      };
    }
    const next = await this.putResumeRecord(nextRecord);

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
    chunk: ChunkDescriptor,
    integrity?: ChunkIntegrityEvidence
  ): Promise<NormalizedUploadChunkResult> {
    const retryPolicy = normalizeRetryPolicy(this.options.retryPolicy, this.options.retries);

    for (let attempt = 0; attempt < retryPolicy.maxAttempts; attempt += 1) {
      const attemptNumber = attempt + 1;
      const attemptId = `${manifest.id}:${chunk.index}:${attemptNumber}`;
      try {
        this.throwIfStopped();
        this.retryableChunks.delete(chunk.index);
        this.inFlightChunks.add(chunk.index);
        if (this.options.parallel) {
          this.emit({ type: "chunk:started", manifestId: manifest.id, chunk, attemptId, attemptNumber });
        }
        const result = await this.options.transport.uploadChunk({
          manifest,
          file: this.file,
          signal: this.abortController.signal,
          uploadId: session.uploadId,
          chunk,
          body: this.file.slice(chunk.start, chunk.end),
          session,
          previousReceipts: this.sortedReceipts(),
          ...(this.options.parallel ? { attemptId, attemptNumber } : {}),
          ...(integrity ? { integrity } : {})
        });

        const normalized = normalizeChunkResult(chunk, session, result);
        if (integrity) normalized.receipt.integrity = this.validateChunkIntegrity(integrity, normalized.receipt);
        if (this.options.parallel) {
          normalized.attemptId = attemptId;
          normalized.attemptNumber = attemptNumber;
        }
        this.inFlightChunks.delete(chunk.index);
        return normalized;
      } catch (error) {
        this.inFlightChunks.delete(chunk.index);
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

        this.retryableChunks.add(chunk.index);
        this.emit({ type: "retry", manifestId: manifest.id, chunk, attempt: attemptNumber, attemptId, error });
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
    if (this.completedReceipts.size !== chunkPlan.totalChunks) {
      throw createIngestError(
        "transport.receipt_missing",
        "Upload cannot complete until every planned chunk has one authoritative receipt.",
        false
      );
    }
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

    const completed = this.withStatus(record, "completed");
    this.currentRecord = completed;

    try {
      await store.put(completed);
    } catch (error) {
      this.emit({
        type: "resume:cleanup-failed",
        recordId: record.id,
        code: "resume.store_failed",
        operation: "mark-complete",
        error
      });
    }

    if (this.options.resume?.cleanup === "mark-complete") {
      return;
    }

    try {
      await store.delete(record.id);
    } catch (error) {
      this.emit({
        type: "resume:cleanup-failed",
        recordId: record.id,
        code: "resume.store_failed",
        operation: "delete",
        error
      });
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
    if (
      record.schemaVersion === "large-image-ingest.resume.v0.2" ||
      record.schemaVersion === "large-image-ingest.resume.v0.3" ||
      record.schemaVersion === PARALLEL_RESUME_SCHEMA_VERSION
    ) {
      if (record.schemaVersion === PARALLEL_RESUME_SCHEMA_VERSION) {
        for (const chunkIndex of record.parallel.ambiguousChunkIndexes) {
          this.ambiguousChunks.add(chunkIndex);
        }
      }
      for (const receipt of record.receipts) {
        const chunk = chunkPlan.chunks[receipt.chunkIndex];
        if (!chunk) {
          throw createIngestError(
            "resume.receipt_invalid",
            "Persisted receipt references a chunk outside the active plan.",
            false,
            { chunkIndex: receipt.chunkIndex }
          );
        }

        this.storeReceipt(chunk, receipt);
      }
      return;
    }

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

  private validateParallelAdmission(): void {
    const parallel = this.options.parallel;
    if (!parallel) return;
    if (!Number.isSafeInteger(parallel.concurrency) || parallel.concurrency < 2 || parallel.concurrency > 16) {
      throw createIngestError("session.invalid_state", "parallel.concurrency must be an integer from 2 through 16.", false);
    }
    const capabilities = this.options.transport.capabilities;
    if (!capabilities?.supportsParallelChunks) {
      throw createIngestError("session.invalid_state", "The selected transport does not support parallel chunks.", false);
    }
    if (capabilities.maxParallelChunks !== undefined && (
      !Number.isSafeInteger(capabilities.maxParallelChunks) || capabilities.maxParallelChunks < 1
    )) {
      throw createIngestError("session.invalid_state", "The transport parallel ceiling is invalid.", false);
    }
    if (capabilities.chunkChecksumAlgorithms && !capabilities.chunkChecksumAlgorithms.includes("sha256")) {
      throw new ChunkIntegrityError("checksum.chunk_unsupported", "The selected transport does not support SHA-256 chunk checksums.");
    }
    if (capabilities.chunkChecksumEncodings && !capabilities.chunkChecksumEncodings.includes("base64")) {
      throw new ChunkIntegrityError("checksum.chunk_unsupported", "The selected transport does not support Base64 chunk checksums.");
    }
    if (
      !capabilities.supportsSafeChunkRepeat &&
      !(capabilities.supportsRemoteChunkReconciliation && this.options.transport.reconcileChunks)
    ) {
      throw createIngestError(
        "resume.transport_unsupported",
        "Parallel upload requires sparse resume support or safe chunk repetition.",
        false
      );
    }
  }

  private effectiveConcurrency(chunkPlan: ChunkPlan, remainingChunks = chunkPlan.totalChunks): number {
    const requested = this.options.parallel?.concurrency ?? 1;
    return Math.min(
      requested,
      this.options.transport.capabilities?.maxParallelChunks ?? requested,
      Math.max(0, remainingChunks)
    );
  }

  private parallelState(chunkPlan: ChunkPlan, remainingChunks = chunkPlan.totalChunks) {
    if (!this.options.parallel) return undefined;
    return {
      requestedConcurrency: this.options.parallel.concurrency,
      effectiveConcurrency: this.effectiveConcurrency(chunkPlan, remainingChunks),
      policyId: PARALLEL_POLICY_ID,
      integrityPolicyId: CHUNK_INTEGRITY_POLICY_ID,
      ambiguousChunkIndexes: [...this.ambiguousChunks].sort((a, b) => a - b)
    };
  }

  private validateParallelResume(record: ResumeRecord, chunkPlan: ChunkPlan): void {
    if (!this.options.parallel) {
      if (record.schemaVersion === "large-image-ingest.resume.v0.4") {
        throw this.emitResumeConflict("resume.chunking_mismatch", "Parallel resume requires the original parallel policy.", record.id);
      }
      return;
    }
    if (record.schemaVersion !== "large-image-ingest.resume.v0.4") {
      if (record.progress.uploadedBytes > 0) {
        throw this.emitResumeConflict("resume.chunking_mismatch", "Legacy progress cannot be promoted to parallel resume without integrity evidence.", record.id);
      }
      return;
    }
    const expected = this.parallelState(chunkPlan);
    if (
      !expected ||
      record.parallel.policyId !== expected.policyId ||
      record.parallel.integrityPolicyId !== expected.integrityPolicyId ||
      record.parallel.requestedConcurrency !== expected.requestedConcurrency
    ) {
      throw this.emitResumeConflict("resume.chunking_mismatch", "Parallel resume policy does not match the persisted record.", record.id);
    }
  }

  private async validatePersistedParallelEvidence(
    record: Extract<ResumeRecord, { schemaVersion: "large-image-ingest.resume.v0.4" }>
  ): Promise<void> {
    for (const receipt of record.receipts) {
      const binding = receipt.integrity?.binding;
      if (!receipt.integrity || !binding) {
        throw this.emitResumeConflict("resume.receipt_invalid", "Parallel resume receipt lacks integrity evidence.", record.id);
      }
      const actual = await calculateBlobSha256(this.file.slice(binding.startByte, binding.endByteExclusive), {
        encoding: receipt.integrity.local.encoding,
        signal: this.abortController.signal
      });
      let matches = false;
      try {
        matches = checksumValuesEqual(actual, receipt.integrity.local);
      } catch {
        // Invalid encodings are persisted-record conflicts, not retryable transfer errors.
      }
      if (!matches) {
        throw this.emitResumeConflict("resume.receipt_invalid", "Parallel resume checksum evidence does not match the selected source.", record.id);
      }
      if (this.options.transport.capabilities?.attestsChunkChecksum && !receipt.integrity.remote) {
        throw this.emitResumeConflict("resume.receipt_invalid", "Parallel resume receipt lacks required remote attestation.", record.id);
      }
    }
  }

  private async reconcileParallelResume(
    record: ResumeRecord,
    manifest: IngestManifest,
    session: TransportSession,
    chunkPlan: ChunkPlan
  ): Promise<ResumeRecord> {
    if (record.schemaVersion !== PARALLEL_RESUME_SCHEMA_VERSION) {
      return record;
    }
    this.ambiguousChunks.clear();
    if (
      !this.options.transport.capabilities?.supportsRemoteChunkReconciliation ||
      !this.options.transport.reconcileChunks
    ) {
      return {
        ...record,
        parallel: { ...record.parallel, ambiguousChunkIndexes: [] }
      };
    }
    const remoteReceipts = await this.options.transport.reconcileChunks({
      manifest,
      file: this.file,
      signal: this.abortController.signal,
      uploadId: session.uploadId,
      session,
      chunkPlan,
      localReceipts: this.sortedReceipts()
    });
    const seen = new Set<number>();
    for (const receipt of remoteReceipts) {
      const chunk = chunkPlan.chunks[receipt.chunkIndex];
      if (!chunk || seen.has(receipt.chunkIndex)) {
        throw this.emitResumeConflict("resume.receipt_invalid", "Remote reconciliation returned duplicate or out-of-plan evidence.", record.id);
      }
      seen.add(receipt.chunkIndex);
      const local = await this.createChunkIntegrity(manifest, session, chunk);
      const validated = validateReceipt(chunk, receipt);
      validateReceiptTransport(validated, session.transportName);
      validated.integrity = this.validateChunkIntegrity(local, validated);
      const persisted = this.completedReceipts.get(chunk.index);
      if (persisted && !receiptsDescribeSameRemoteChunk(persisted, validated)) {
        throw this.emitResumeConflict("resume.receipt_invalid", "Local and remote chunk evidence conflict.", record.id);
      }
      this.completedReceipts.set(chunk.index, validated);
    }
    for (const receipt of record.receipts) {
      if (!seen.has(receipt.chunkIndex)) {
        throw this.emitResumeConflict("resume.receipt_invalid", "Remote reconciliation is missing a persisted acknowledged chunk.", record.id);
      }
    }
    const receipts = this.sortedReceipts();
    const completedChunkRanges = receiptsToRanges(receipts);
    return {
      ...record,
      receipts,
      parallel: { ...record.parallel, ambiguousChunkIndexes: [] },
      progress: {
        ...record.progress,
        uploadedBytes: calculateUploadedBytes(receipts),
        completedChunkRanges,
        nextChunkIndex: getNextIncompleteChunkIndex(completedChunkRanges, chunkPlan.totalChunks)
      },
      updatedAt: nowIso()
    };
  }

  private async validateParallelSnapshot(manifest: IngestManifest, chunkPlan: ChunkPlan): Promise<void> {
    const snapshot = this.options.resumeFrom;
    if (!snapshot) return;
    if (!this.options.parallel) {
      if (snapshot.parallel) {
        throw createIngestError("transport.resume_failed", "Parallel snapshot requires the original parallel policy.", false);
      }
      return;
    }
    const expected = this.parallelState(chunkPlan);
    if (
      !snapshot.parallel ||
      !expected ||
      snapshot.parallel.requestedConcurrency !== expected.requestedConcurrency ||
      snapshot.parallel.policyId !== expected.policyId ||
      snapshot.parallel.integrityPolicyId !== expected.integrityPolicyId
    ) {
      throw createIngestError("transport.resume_failed", "Snapshot parallel policy does not match the active policy.", false);
    }
    for (const receipt of snapshot.completedChunks) {
      const chunk = chunkPlan.chunks[receipt.chunkIndex];
      const integrity = receipt.integrity;
      if (!chunk || !integrity || integrity.policyId !== CHUNK_INTEGRITY_POLICY_ID) {
        throw new ChunkIntegrityError("checksum.chunk_missing", "Parallel snapshot receipt lacks required integrity evidence.");
      }
      const binding = integrity.binding;
      if (
        binding.manifestId !== manifest.id ||
        binding.uploadId !== snapshot.transportSession?.uploadId ||
        binding.sourceIdentity !== this.requireParallelSourceIdentity() ||
        binding.chunkIndex !== chunk.index ||
        binding.startByte !== chunk.start ||
        binding.endByteExclusive !== chunk.end ||
        binding.sizeBytes !== chunk.size
      ) {
        throw new ChunkIntegrityError("checksum.chunk_mismatch", "Parallel snapshot integrity scope does not match the active source.");
      }
      const actual = await calculateBlobSha256(this.file.slice(chunk.start, chunk.end), {
        encoding: integrity.local.encoding,
        signal: this.abortController.signal
      });
      try {
        if (!checksumValuesEqual(actual, integrity.local)) {
          throw new ChunkIntegrityError("checksum.chunk_mismatch", "Parallel snapshot checksum does not match the active source.");
        }
      } catch (error) {
        if (isIngestError(error)) throw error;
        throw new ChunkIntegrityError("checksum.chunk_mismatch", "Parallel snapshot checksum evidence is malformed.");
      }
    }
  }

  private async createChunkIntegrity(
    manifest: IngestManifest,
    session: TransportSession,
    chunk: ChunkDescriptor
  ): Promise<ChunkIntegrityEvidence> {
    const checksum = await calculateBlobSha256(this.file.slice(chunk.start, chunk.end), {
      encoding: "base64",
      signal: this.abortController.signal
    });
    return {
      policyId: CHUNK_INTEGRITY_POLICY_ID,
      binding: {
        manifestId: manifest.id,
        uploadId: session.uploadId,
        sourceIdentity: this.requireParallelSourceIdentity(),
        chunkIndex: chunk.index,
        startByte: chunk.start,
        endByteExclusive: chunk.end,
        sizeBytes: chunk.size
      },
      local: { ...checksum, role: "local-calculation" }
    };
  }

  private requireParallelSourceIdentity(): string {
    if (!this.parallelSourceIdentity) {
      throw new ChunkIntegrityError("checksum.chunk_missing", "Parallel upload requires an exact source identity.");
    }
    return this.parallelSourceIdentity.value;
  }

  private validateChunkIntegrity(local: ChunkIntegrityEvidence, receipt: UploadChunkReceipt): ChunkIntegrityEvidence {
    if (receipt.integrity && (
      receipt.integrity.policyId !== local.policyId ||
      JSON.stringify(receipt.integrity.binding) !== JSON.stringify(local.binding)
    )) {
      throw new ChunkIntegrityError("checksum.chunk_mismatch", "Transport chunk checksum scope does not match the requested chunk.");
    }
    const remote = receipt.integrity?.remote ?? (receipt.checksum ? {
      algorithm: receipt.checksum.algorithm,
      encoding: "base64" as const,
      value: receipt.checksum.value,
      role: "remote-attestation" as const
    } : undefined);
    if (this.options.transport.capabilities?.attestsChunkChecksum) {
      if (!remote) throw new ChunkIntegrityError("checksum.chunk_missing", "Transport did not attest the chunk checksum.");
      if (remote.role !== "remote-attestation" || remote.algorithm !== "sha256") {
        throw new ChunkIntegrityError("checksum.chunk_unsupported", "Transport returned unsupported chunk checksum evidence.");
      }
      let matches = false;
      try {
        matches = checksumValuesEqual(local.local, remote);
      } catch {
        throw new ChunkIntegrityError("checksum.chunk_mismatch", "Transport returned malformed chunk checksum evidence.");
      }
      if (!matches) {
        throw new ChunkIntegrityError("checksum.chunk_mismatch", "Transport chunk checksum does not match the local checksum.");
      }
    }
    return { ...local, ...(remote ? { remote } : {}) };
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
    const parallel = this.parallelState(
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

  private async getResumeRecord(store: ResumeStore, recordId: string): Promise<ResumeRecord> {
    let record: ResumeRecord | undefined;
    try {
      const stored = await store.get(recordId);
      record = stored ? parseResumeRecord(stored) : undefined;
    } catch (error) {
      if (error instanceof ResumeConflictError) {
        throw this.emitResumeConflict(error.code, error.message, recordId, error);
      }

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
      ...(record.schemaVersion === PARALLEL_RESUME_SCHEMA_VERSION
        ? { parallel: { ...record.parallel, ambiguousChunkIndexes: [...this.ambiguousChunks].sort((a, b) => a - b) } }
        : {}),
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

  private validateRequestedResumeCapability(): void {
    const recovery = normalizeTransportRecoveryCapabilities(this.options.transport.capabilities);
    if (
      this.options.resume &&
      !recovery.persistentResume
    ) {
      throw this.emitResumeConflict(
        "resume.transport_unsupported",
        "The configured upload transport does not support persistent resume."
      );
    }

    if (
      this.options.resumeFrom &&
      !recovery.snapshotResume
    ) {
      throw createIngestError(
        "transport.resume_failed",
        "The configured upload transport does not support snapshot resume.",
        false
      );
    }
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

  private transportName(fallback?: string): string {
    return fallback ?? this.options.transport.capabilities?.name ?? "custom";
  }

  private emit(event: IngestEvent): void {
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

  private observeSnapshot(snapshot: UploadSessionSnapshot): void {
    try {
      this.options.onSnapshot?.(snapshot);
    } catch (error) {
      this.reportObserverFailure({ observer: "snapshot", error });
    }
  }

  private reportObserverFailure(failure: IngestObserverFailure): void {
    try {
      this.options.onObserverError?.(failure);
    } catch {
      // Observer error reporting is isolated from upload control flow too.
    }
  }
}

function combineAbortSignals(primary: AbortSignal, secondary?: AbortSignal): AbortSignal {
  if (!secondary || secondary === primary) return primary;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([primary, secondary]);
  }
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

function compatibilityConflictCode(
  reason: ResumeCompatibilityResult["reason"]
): ResumeConflictCode {
  switch (reason) {
    case "source_mismatch": return "resume.file_mismatch";
    case "identity_missing": return "resume.identity_missing";
    case "chunking_mismatch": return "resume.chunking_mismatch";
    case "transport_unsupported": return "resume.transport_unsupported";
    case "transport_mismatch": return "resume.transport_mismatch";
    case "profile_mismatch": return "resume.profile_mismatch";
    case "receipt_missing": return "resume.receipt_missing";
    case "expired": return "resume.expired";
    case "terminal": return "resume.record_not_found";
    case "compatible":
    case "legacy_upgrade_available":
      return "resume.record_invalid";
  }
}

function compatibilityConflictMessage(reason: ResumeCompatibilityResult["reason"]): string {
  switch (reason) {
    case "source_mismatch": return "The selected file does not match the stored resume record.";
    case "identity_missing": return "The stored resume record lacks trustworthy whole-file source identity.";
    case "chunking_mismatch": return "The active chunking options do not match the stored resume record.";
    case "transport_unsupported": return "The configured upload transport does not support persistent resume.";
    case "transport_mismatch": return "The stored resume transport does not match the configured transport.";
    case "profile_mismatch": return "The stored resume profile does not match the configured domain profile.";
    case "receipt_missing": return "The stored resume record lacks required durable provider receipts.";
    case "expired": return "The stored remote resume handle has expired.";
    case "terminal": return "The resume record is terminal and cannot be resumed.";
    case "compatible":
    case "legacy_upgrade_available":
      return "The resume record is not compatible.";
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
    const receipt = validateReceipt(chunk, result);
    validateReceiptTransport(receipt, session.transportName);
    return {
      receipt
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

function validateReceiptTransport(receipt: UploadChunkReceipt, expectedTransportName: string): void {
  if (receipt.transport.name !== expectedTransportName) {
    throw createIngestError(
      "transport.receipt_invalid",
      "Transport receipt identity does not match the active upload session.",
      false,
      { chunkIndex: receipt.chunkIndex }
    );
  }
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
    parallel: snapshot.parallel ? {
      ...snapshot.parallel,
      ambiguousChunkIndexes: [...snapshot.parallel.ambiguousChunkIndexes]
    } : undefined,
    chunkOutcomes: snapshot.chunkOutcomes ? { ...snapshot.chunkOutcomes } : undefined,
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

    if (transport.etag !== undefined) {
      delete transport.etag;
      receiptRedactions.push("transport.etag");
    }

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
      integrity: receipt.integrity ? {
        ...receipt.integrity,
        binding: { ...receipt.integrity.binding },
        local: { ...receipt.integrity.local },
      remote: receipt.integrity.remote ? { ...receipt.integrity.remote } : undefined
    } : undefined,
    transport: {
      ...receipt.transport,
      opaque: cloneRecord(receipt.transport.opaque)
    }
  };
}

function receiptsDescribeSameRemoteChunk(
  left: UploadChunkReceipt,
  right: UploadChunkReceipt
): boolean {
  return left.chunkIndex === right.chunkIndex &&
    left.sizeBytes === right.sizeBytes &&
    left.transport.name === right.transport.name &&
    left.transport.partNumber === right.transport.partNumber &&
    left.transport.etag === right.transport.etag &&
    JSON.stringify(left.integrity) === JSON.stringify(right.integrity);
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
  code: IngestErrorCode,
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

function isIngestIssueErrorCode(code: IngestErrorCode): code is IngestIssueCode {
  return code !== "manifest.failed" &&
    code !== "session.failed" &&
    code !== "validation.failed" &&
    code !== "session.aborted" &&
    code !== "session.invalid_state" &&
    code !== "session.snapshot_file_mismatch";
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
