import { planChunks } from "./chunks.js";
import { domainProfileReferencesEqual } from "./profiles.js";
import {
  ResumeConflictError,
  chunkingIdentityMatches,
  classifyPersistentResume,
  createContentSourceIdentity,
  createContentSourceIdentityFromChecksum,
  createResumeChunkingIdentity,
  createResumeConflict,
  createResumeFileIdentity,
  createPersistentResumeRecord,
  fileIdentityMatches,
  getNextIncompleteChunkIndex,
  isResumeRecordExpired,
  normalizeTransportRecoveryCapabilities,
  parseResumeRecord
} from "./resume.js";
import type {
  ChunkPlan,
  ContentSourceIdentityV1,
  CreateIngestSessionOptions,
  IngestEvent,
  IngestIssueCode,
  IngestManifest,
  ResumeRecord,
  ResumeRecordStatus,
  ResumeStore,
  ResumeTransportState,
  TransportSession,
  UploadSessionResult,
  UploadSessionSnapshot
} from "./types.js";
import { validateResumeChunkPlan, receiptsToRanges, cloneReceipt } from "./session-receipts.js";
import {
  combineAbortSignals,
  compatibilityConflictCode,
  compatibilityConflictMessage,
  createIngestError,
  nowIso,
  PARALLEL_RESUME_SCHEMA_VERSION
} from "./session-state.js";
import type { SessionRuntime } from "./session-runtime.js";
import { parallelState, validatePersistedParallelEvidence } from "./session-parallel.js";
import { storeReceipt } from "./session-transfer.js";

export async function prepareContentSourceIdentity(
  rt: SessionRuntime,
  manifest: IngestManifest
): Promise<ContentSourceIdentityV1> {
  if (manifest.original.checksum) {
    return createContentSourceIdentityFromChecksum(
      manifest.original.sizeBytes,
      manifest.original.checksum
    );
  }
  return calculateSelectedSourceIdentity(rt);
}

export function calculateSelectedSourceIdentity(rt: SessionRuntime): Promise<ContentSourceIdentityV1> {
  const configured = rt.options.sourceIdentity ?? (
    rt.options.checksum === false ? {} : rt.options.checksum ?? {}
  );
  return createContentSourceIdentity(
    rt.file,
    withSessionChecksumAuthority(rt, configured)
  );
}

export function withSessionChecksumAuthority(
  rt: SessionRuntime,
  options: NonNullable<CreateIngestSessionOptions["sourceIdentity"]>
): NonNullable<CreateIngestSessionOptions["sourceIdentity"]> {
  const userObserver = options.onObserverError;
  return {
    ...options,
    signal: combineAbortSignals(rt.abortController.signal, options.signal),
    onObserverError: (failure) => {
      rt.reportObserverFailure({ observer: "checksum", error: failure.error });
      try {
        userObserver?.(failure);
      } catch {
        // Checksum observer reporting is isolated from ingest authority.
      }
    }
  };
}

export async function createInitialResumeRecord(
  rt: SessionRuntime,
  manifest: IngestManifest,
  session: TransportSession,
  contentIdentity: ContentSourceIdentityV1 | undefined
): Promise<ResumeRecord | undefined> {
  const store = rt.options.resume?.store;
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
    file: await createResumeFileIdentity(rt.file),
    contentIdentity,
    chunking: createResumeChunkingIdentity(rt.file.size, rt.options.chunking),
    transport: createTransportState(rt, session),
    ...(rt.options.parallel
      ? { parallel: parallelState(rt, planChunks(rt.file.size, rt.options.chunking))! }
      : {}),
    ...(rt.options.domainProfile
      ? { domainProfile: rt.options.domainProfile.profile }
      : {})
  });

  const persisted = await putResumeRecord(rt, record);
  rt.emit({
    type: "resume:available",
    recordId: persisted.id,
    manifestId: manifest.id,
    status: persisted.progress.status
  });

  return persisted;
}

export async function createRecordFromSnapshot(
  rt: SessionRuntime,
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
    file: await createResumeFileIdentity(rt.file),
    chunking: {
      strategy: "fixed-size",
      chunkSizeBytes: chunkPlan.chunkSize,
      totalBytes: chunkPlan.totalBytes,
      totalChunks: chunkPlan.totalChunks
    },
    transport: snapshot.transportSession
      ? createTransportState(rt, snapshot.transportSession)
      : { uploadId: `snapshot_${snapshot.manifestId}` },
    ...(rt.options.domainProfile
      ? { domainProfile: rt.options.domainProfile.profile }
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

export async function validateResumeRecord(
  rt: SessionRuntime,
  record: ResumeRecord,
  store: ResumeStore
): Promise<ContentSourceIdentityV1> {
  if (isResumeRecordExpired(record)) {
    const expired = await putResumeRecord(rt, withStatus(rt, record, "expired", "resume.expired"));
    rt.emit({ type: "resume:expired", recordId: expired.id });
    throw emitResumeConflict(
      rt,
      "resume.expired",
      "The stored remote resume handle has expired.",
      expired.id
    );
  }

  if (record.progress.status === "completed" || record.progress.status === "canceled") {
    throw emitResumeConflict(
      rt,
      "resume.record_not_found",
      "The resume record is terminal and cannot be resumed.",
      record.id
    );
  }

  if (!normalizeTransportRecoveryCapabilities(rt.options.transport.capabilities).persistentResume) {
    throw emitResumeConflict(
      rt,
      "resume.transport_unsupported",
      "The configured upload transport does not support persistent resume.",
      record.id
    );
  }

  const activeTransportName = rt.options.transport.capabilities?.name;
  if (activeTransportName && record.transport.name && activeTransportName !== record.transport.name) {
    throw emitResumeConflict(
      rt,
      "resume.transport_mismatch",
      "The stored resume transport does not match the configured transport.",
      record.id
    );
  }

  const activeProfile = rt.options.domainProfile?.profile;
  if (!domainProfileReferencesEqual(record.domainProfile, activeProfile)) {
    throw emitResumeConflict(
      rt,
      "resume.profile_mismatch",
      "The stored resume profile does not match the configured domain profile.",
      record.id
    );
  }

  const fileIdentity = await createResumeFileIdentity(rt.file);
  if (!fileIdentityMatches(record.file, fileIdentity)) {
    throw emitResumeConflict(
      rt,
      "resume.file_mismatch",
      "The selected file does not match the stored resume record.",
      record.id
    );
  }

  const chunking = createResumeChunkingIdentity(rt.file.size, rt.options.chunking);
  if (!chunkingIdentityMatches(record.chunking, chunking)) {
    throw emitResumeConflict(
      rt,
      "resume.chunking_mismatch",
      "The active chunking options do not match the stored resume record.",
      record.id
    );
  }

  const sourceIdentity = await calculateSelectedSourceIdentity(rt);
  const classification = await classifyPersistentResume(record, rt.file, {
    ...rt.options.chunking,
    ...(rt.options.transport.capabilities
      ? { capabilities: rt.options.transport.capabilities }
      : {}),
    sourceIdentity,
    ...(activeProfile ? { domainProfile: activeProfile } : {})
  });
  if (classification.status !== "resumable" && classification.status !== "upgradeable") {
    const code = classification.status === "restart_only"
      ? "resume.restart_required"
      : compatibilityConflictCode(classification.reason);
    throw emitResumeConflict(
      rt,
      code,
      compatibilityConflictMessage(classification.reason),
      record.id
    );
  }

  if (record.schemaVersion === PARALLEL_RESUME_SCHEMA_VERSION) {
    await validatePersistedParallelEvidence(rt, record);
  }

  rt.currentRecord = record;
  void store;
  return sourceIdentity;
}

export async function completeResumeRecord(rt: SessionRuntime, record: ResumeRecord): Promise<void> {
  const store = rt.options.resume?.store;
  if (!store) {
    return;
  }

  const completed = withStatus(rt, record, "completed");
  rt.currentRecord = completed;

  try {
    await store.put(completed);
  } catch (error) {
    rt.emit({
      type: "resume:cleanup-failed",
      recordId: record.id,
      code: "resume.store_failed",
      operation: "mark-complete",
      error
    });
  }

  if (rt.options.resume?.cleanup === "mark-complete") {
    return;
  }

  try {
    await store.delete(record.id);
  } catch (error) {
    rt.emit({
      type: "resume:cleanup-failed",
      recordId: record.id,
      code: "resume.store_failed",
      operation: "delete",
      error
    });
  }
}

export function hydrateResumeSnapshot(rt: SessionRuntime, manifest: IngestManifest, chunkPlan: ChunkPlan): void {
  const snapshot = rt.options.resumeFrom;

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

    storeReceipt(rt, chunk, receipt);
  }
}

export function hydrateResumeRecord(
  rt: SessionRuntime,
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
        rt.ambiguousChunks.add(chunkIndex);
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

      storeReceipt(rt, chunk, receipt);
    }
    return;
  }

  for (const range of record.progress.completedChunkRanges) {
    for (let index = range.startIndex; index <= range.endIndexInclusive; index += 1) {
      const chunk = chunkPlan.chunks[index];

      if (!chunk) {
        continue;
      }

      rt.completedReceipts.set(index, {
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

export async function getResumeRecord(rt: SessionRuntime, store: ResumeStore, recordId: string): Promise<ResumeRecord> {
  let record: ResumeRecord | undefined;
  try {
    const stored = await store.get(recordId);
    record = stored ? parseResumeRecord(stored) : undefined;
  } catch (error) {
    if (error instanceof ResumeConflictError) {
      throw emitResumeConflict(rt, error.code, error.message, recordId, error);
    }

    throw emitResumeConflict(
      rt,
      "resume.store_failed",
      "The resume store could not read the record.",
      recordId,
      error
    );
  }

  if (!record) {
    throw emitResumeConflict(
      rt,
      "resume.record_not_found",
      "The requested resume record does not exist.",
      recordId
    );
  }

  return record;
}

export async function putResumeRecord(rt: SessionRuntime, record: ResumeRecord): Promise<ResumeRecord> {
  const store = requireResumeStore(rt);
  rt.currentRecord = record;

  try {
    await store.put(record);
  } catch (error) {
    throw emitResumeConflict(
      rt,
      "resume.store_failed",
      "The resume store could not persist the record.",
      record.id,
      error
    );
  }

  return record;
}

export async function markRecordPaused(rt: SessionRuntime, record: ResumeRecord): Promise<ResumeRecord> {
  return putResumeRecord(rt, withStatus(rt, record, "paused"));
}

export async function markRecordCanceled(rt: SessionRuntime, record: ResumeRecord): Promise<ResumeRecord> {
  const canceled = await putResumeRecord(rt, withStatus(rt, record, "canceled"));
  rt.emitCancel(canceled.id);
  return canceled;
}

export async function markCurrentRecordFailed(rt: SessionRuntime, error: unknown): Promise<void> {
  if (!rt.currentRecord) {
    return;
  }

  if (rt.isTerminalOrControlledStatus(rt.currentRecord.progress.status)) {
    return;
  }

  const issueCode = rt.toIssueCode(error);
  rt.currentRecord = await putResumeRecord(
    rt,
    withStatus(rt, rt.currentRecord, "failed", issueCode)
  );
}

export function withStatus(
  rt: SessionRuntime,
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
      ? { parallel: { ...record.parallel, ambiguousChunkIndexes: [...rt.ambiguousChunks].sort((a, b) => a - b) } }
      : {}),
    progress,
    updatedAt: nowIso()
  };
}

export function withTransport(rt: SessionRuntime, record: ResumeRecord, transport: ResumeTransportState): ResumeRecord {
  return {
    ...record,
    transport,
    updatedAt: nowIso()
  };
}

export function createTransportState(rt: SessionRuntime, session: TransportSession | UploadSessionResult): ResumeTransportState {
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

export function validateRequestedResumeCapability(rt: SessionRuntime): void {
  const recovery = normalizeTransportRecoveryCapabilities(rt.options.transport.capabilities);
  if (
    rt.options.resume &&
    !recovery.persistentResume
  ) {
    throw emitResumeConflict(
      rt,
      "resume.transport_unsupported",
      "The configured upload transport does not support persistent resume."
    );
  }

  if (
    rt.options.resumeFrom &&
    !recovery.snapshotResume
  ) {
    throw createIngestError(
      "transport.resume_failed",
      "The configured upload transport does not support snapshot resume.",
      false
    );
  }
}

export function requireResumeStore(rt: SessionRuntime): ResumeStore {
  const store = rt.options.resume?.store;
  if (!store) {
    throw emitResumeConflict(
      rt,
      "resume.store_failed",
      "A resume store is required for persistent resume operations."
    );
  }

  return store;
}

export function emitResumeConflict(
  rt: SessionRuntime,
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
  rt.emit(event);
  return conflict;
}
