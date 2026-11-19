import {
  UploadCanceledError,
  UploadPausedError,
  getNextIncompleteChunkIndex,
  mergeCompletedChunkRange,
  mergeTransportState
} from "./resume.js";
import type {
  ChunkDescriptor,
  ChunkIntegrityEvidence,
  ChunkPlan,
  IngestManifest,
  ResumeRecord,
  TransportSession,
  UploadChunkReceipt,
  UploadChunkResult
} from "./types.js";
import { normalizeRetryPolicy, shouldRetry, calculateRetryDelay } from "./session-retry.js";
import {
  NormalizedUploadChunkResult,
  normalizeChunkResult,
  validateReceipt,
  calculateUploadedBytes,
  cloneReceipt
} from "./session-receipts.js";
import {
  createIngestError,
  isNonRetryableIngestError,
  nowIso,
  CURRENT_RESUME_SCHEMA_VERSION,
  PARALLEL_RESUME_SCHEMA_VERSION
} from "./session-state.js";
import type { SessionRuntime } from "./session-runtime.js";
import { promoteOverlapRecord } from "./session-overlap.js";
import { parallelEngine, parallelState, validateChunkIntegrity } from "./session-parallel.js";
import { completeResumeRecord } from "./session-resume.js";
import { putResumeRecord } from "./session-resume-store.js";

/** Uploads every chunk without a receipt and returns the latest resume record. */
export interface TransferEngine {
  readonly name: "sequential" | "parallel";
  uploadRemaining(
    rt: SessionRuntime,
    manifest: IngestManifest,
    session: TransportSession,
    chunkPlan: ChunkPlan,
    record: ResumeRecord | undefined,
    snapshotCreatedAt: string
  ): Promise<ResumeRecord | undefined>;
}

export const sequentialEngine: TransferEngine = {
  name: "sequential",
  uploadRemaining: uploadRemainingChunksSequential
};

export function selectTransferEngine(rt: SessionRuntime): TransferEngine {
  return rt.options.parallel ? parallelEngine : sequentialEngine;
}

async function uploadRemainingChunksSequential(
  rt: SessionRuntime,
  manifest: IngestManifest,
  session: TransportSession,
  chunkPlan: ChunkPlan,
  record: ResumeRecord | undefined,
  snapshotCreatedAt: string
): Promise<ResumeRecord | undefined> {
  let activeRecord = record;

  for (const chunk of chunkPlan.chunks) {
    if (rt.completedReceipts.has(chunk.index)) {
      continue;
    }

    rt.throwIfStopped();
    rt.emit({ type: "chunk:started", manifestId: manifest.id, chunk });
    const result = await uploadChunkWithRetry(rt, manifest, session, chunk);
    storeReceipt(rt, chunk, result.receipt);

    if (activeRecord) {
      activeRecord = await checkpointChunk(rt, activeRecord, chunk, chunkPlan, result.transportResult);
    } else if (rt.pendingChecksum?.result && rt.options.resume?.store) {
      activeRecord = await promoteOverlapRecord(rt, manifest, session, chunkPlan, rt.pendingChecksum);
    }
    if (rt.pendingChecksum?.failed) {
      await rt.pendingChecksum.promise;
    }

    const uploadedBytes = calculateUploadedBytes(sortedReceipts(rt));
    rt.emit({
      type: "chunk:completed",
      manifestId: manifest.id,
      chunk,
      uploadedBytes,
      totalBytes: rt.file.size
    });
    rt.updateSnapshot({
      manifest,
      chunkPlan,
      session,
      status: "uploading",
      createdAt: snapshotCreatedAt
    });

    rt.throwIfStopped();
  }

  return activeRecord;
}

export async function checkpointChunk(
  rt: SessionRuntime,
  record: ResumeRecord,
  chunk: ChunkDescriptor,
  chunkPlan: ChunkPlan,
  result: UploadChunkResult | undefined
): Promise<ResumeRecord> {
  const completedChunkRanges = mergeCompletedChunkRange(
    record.progress.completedChunkRanges,
    chunk.index
  );
  const uploadedBytes = sumCompletedBytes(rt, completedChunkRanges, chunkPlan.chunks);
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
        ? { parallel: { ...record.parallel, ambiguousChunkIndexes: [...rt.ambiguousChunks].sort((a, b) => a - b) } }
        : {}),
      transport,
      receipts: sortedReceipts(rt).map(cloneReceipt),
      progress,
      updatedAt
    } as ResumeRecord);
  } else if (
    rt.resumeSourceIdentity &&
    (record.schemaVersion === "large-image-ingest.resume.v0.2" || record.progress.uploadedBytes === 0)
  ) {
    nextRecord = ({
      ...record,
      schemaVersion: rt.options.parallel ? PARALLEL_RESUME_SCHEMA_VERSION : CURRENT_RESUME_SCHEMA_VERSION,
      file: {
        ...record.file,
        contentIdentity: { ...rt.resumeSourceIdentity }
      },
      transport,
      receipts: sortedReceipts(rt).map(cloneReceipt),
      ...(rt.options.parallel ? { parallel: parallelState(rt, chunkPlan)! } : {}),
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
  const next = await putResumeRecord(rt, nextRecord);

  rt.emit({
    type: "resume:checkpoint",
    recordId: next.id,
    completedChunkRanges: next.progress.completedChunkRanges
  });

  return next;
}

export async function uploadChunkWithRetry(
  rt: SessionRuntime,
  manifest: IngestManifest,
  session: TransportSession,
  chunk: ChunkDescriptor,
  integrity?: ChunkIntegrityEvidence
): Promise<NormalizedUploadChunkResult> {
  const retryPolicy = normalizeRetryPolicy(rt.options.retryPolicy, rt.options.retries);

  for (let attempt = 0; attempt < retryPolicy.maxAttempts; attempt += 1) {
    const attemptNumber = attempt + 1;
    const attemptId = `${manifest.id}:${chunk.index}:${attemptNumber}`;
    try {
      rt.throwIfStopped();
      rt.retryableChunks.delete(chunk.index);
      rt.inFlightChunks.add(chunk.index);
      if (rt.options.parallel) {
        rt.emit({ type: "chunk:started", manifestId: manifest.id, chunk, attemptId, attemptNumber });
      }
      const result = await rt.options.transport.uploadChunk({
        manifest,
        file: rt.file,
        signal: rt.abortController.signal,
        uploadId: session.uploadId,
        chunk,
        body: rt.file.slice(chunk.start, chunk.end),
        session,
        previousReceipts: sortedReceipts(rt),
        ...(rt.options.parallel ? { attemptId, attemptNumber } : {}),
        ...(integrity ? { integrity } : {})
      });

      const normalized = normalizeChunkResult(chunk, session, result);
      if (integrity) normalized.receipt.integrity = validateChunkIntegrity(rt, integrity, normalized.receipt);
      if (rt.options.parallel) {
        normalized.attemptId = attemptId;
        normalized.attemptNumber = attemptNumber;
      }
      rt.inFlightChunks.delete(chunk.index);
      return normalized;
    } catch (error) {
      rt.inFlightChunks.delete(chunk.index);
      if (rt.lifecycleAction === "cancel") {
        throw new UploadCanceledError(rt.currentRecord?.id);
      }

      if (rt.lifecycleAction === "pause") {
        throw new UploadPausedError(rt.currentRecord?.id);
      }

      if (rt.abortController.signal.aborted) {
        throw rt.abortController.signal.reason ?? error;
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

      rt.retryableChunks.add(chunk.index);
      rt.emit({ type: "retry", manifestId: manifest.id, chunk, attempt: attemptNumber, attemptId, error });
      await waitForRetryDelay(rt, calculateRetryDelay(retryPolicy, attempt + 1));
    }
  }

  throw createIngestError("transport.failed", "Chunk upload failed.", true);
}

export async function waitForRetryDelay(rt: SessionRuntime, delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    if (rt.abortController.signal.aborted) {
      reject(rt.abortController.signal.reason);
      return;
    }

    const cleanup = (): void => {
      rt.abortController.signal.removeEventListener("abort", abort);
    };
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    const abort = (): void => {
      clearTimeout(timeout);
      cleanup();
      reject(rt.abortController.signal.reason);
    };

    rt.abortController.signal.addEventListener("abort", abort, { once: true });
  });
}

export async function completeUpload(
  rt: SessionRuntime,
  manifest: IngestManifest,
  session: TransportSession,
  record: ResumeRecord | undefined,
  chunkPlan: ChunkPlan,
  snapshotCreatedAt: string
): Promise<void> {
  rt.throwIfStopped();
  if (rt.completedReceipts.size !== chunkPlan.totalChunks) {
    throw createIngestError(
      "transport.receipt_missing",
      "Upload cannot complete until every planned chunk has one authoritative receipt.",
      false
    );
  }
  rt.updateSnapshot({
    manifest,
    chunkPlan,
    session,
    status: "completing",
    createdAt: snapshotCreatedAt
  });

  await rt.options.transport.completeSession({
    manifest,
    file: rt.file,
    signal: rt.abortController.signal,
    uploadId: session.uploadId,
    session,
    receipts: sortedReceipts(rt)
  });

  if (record) {
    await completeResumeRecord(rt, record);
  }

  rt.updateSnapshot({
    manifest,
    chunkPlan,
    session,
    status: "completed",
    createdAt: snapshotCreatedAt
  });
  rt.emit({ type: "completed", manifest, uploadId: session.uploadId });
}

export function storeReceipt(rt: SessionRuntime, chunk: ChunkDescriptor, receipt: UploadChunkReceipt): void {
  rt.completedReceipts.set(chunk.index, validateReceipt(chunk, receipt));
}

export function sortedReceipts(rt: SessionRuntime): UploadChunkReceipt[] {
  return Array.from(rt.completedReceipts.values()).sort(
    (left, right) => left.chunkIndex - right.chunkIndex
  );
}

export function sumCompletedBytes(
  rt: SessionRuntime,
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
