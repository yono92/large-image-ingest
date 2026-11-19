import { calculateBlobSha256, checksumValuesEqual } from "./checksum.js";
import { ChunkIntegrityError } from "./errors.js";
import { getNextIncompleteChunkIndex } from "./resume.js";
import type {
  ChunkDescriptor,
  ChunkIntegrityEvidence,
  ChunkPlan,
  IngestManifest,
  ResumeRecord,
  TransportSession,
  UploadChunkReceipt
} from "./types.js";
import {
  NormalizedUploadChunkResult,
  validateReceipt,
  validateReceiptTransport,
  receiptsToRanges,
  calculateUploadedBytes,
  receiptsDescribeSameRemoteChunk
} from "./session-receipts.js";
import {
  createIngestError,
  isIngestError,
  nowIso,
  PARALLEL_RESUME_SCHEMA_VERSION,
  PARALLEL_POLICY_ID,
  CHUNK_INTEGRITY_POLICY_ID
} from "./session-state.js";
import type { SessionRuntime } from "./session-runtime.js";
import type { TransferEngine } from "./session-transfer.js";
import {
  checkpointChunk,
  uploadChunkWithRetry,
  storeReceipt,
  sortedReceipts
} from "./session-transfer.js";
import { emitResumeConflict } from "./session-resume-store.js";

export const parallelEngine: TransferEngine = {
  name: "parallel",
  uploadRemaining: uploadRemainingChunksParallel
};

async function uploadRemainingChunksParallel(
  rt: SessionRuntime,
  manifest: IngestManifest,
  session: TransportSession,
  chunkPlan: ChunkPlan,
  record: ResumeRecord | undefined,
  snapshotCreatedAt: string
): Promise<ResumeRecord | undefined> {
  const remaining = chunkPlan.chunks.filter((chunk) => !rt.completedReceipts.has(chunk.index));
  let cursor = 0;
  let activeRecord = record;
  let failure: unknown;
  let commitQueue = Promise.resolve();

  const commit = (chunk: ChunkDescriptor, result: NormalizedUploadChunkResult): Promise<void> => {
    const next = commitQueue.then(async () => {
      if (rt.completedReceipts.has(chunk.index)) return;
      storeReceipt(rt, chunk, result.receipt);
      if (activeRecord) activeRecord = await checkpointChunk(rt, activeRecord, chunk, chunkPlan, result.transportResult);
      const uploadedBytes = calculateUploadedBytes(sortedReceipts(rt));
      rt.emit({
        type: "chunk:completed",
        manifestId: manifest.id,
        chunk,
        uploadedBytes,
        totalBytes: rt.file.size,
        ...(result.attemptId && result.attemptNumber !== undefined
          ? { attemptId: result.attemptId, attemptNumber: result.attemptNumber }
          : {})
      });
      rt.updateSnapshot({ manifest, chunkPlan, session, status: "uploading", createdAt: snapshotCreatedAt });
    });
    commitQueue = next.catch(() => undefined);
    return next;
  };

  const worker = async (): Promise<void> => {
    while (!failure && cursor < remaining.length) {
      if (rt.abortController.signal.aborted) {
        failure ??= rt.abortController.signal.reason;
        return;
      }
      const chunk = remaining[cursor++];
      if (!chunk) return;
      try {
        const integrity = await createChunkIntegrity(rt, manifest, session, chunk);
        const result = await uploadChunkWithRetry(rt, manifest, session, chunk, integrity);
        await commit(chunk, result);
      } catch (error) {
        if (!failure) {
          failure = error;
          if (rt.lifecycleAction) rt.ambiguousChunks.add(chunk.index);
          else rt.failedChunks.add(chunk.index);
          if (!rt.abortController.signal.aborted) rt.abortController.abort(error);
        } else if (!rt.completedReceipts.has(chunk.index)) {
          rt.ambiguousChunks.add(chunk.index);
        }
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(effectiveConcurrency(rt, chunkPlan), remaining.length) }, () => worker()));
  await commitQueue;
  if (failure) throw failure;
  return activeRecord;
}

export function validateParallelAdmission(rt: SessionRuntime): void {
  const parallel = rt.options.parallel;
  if (!parallel) return;
  if (!Number.isSafeInteger(parallel.concurrency) || parallel.concurrency < 2 || parallel.concurrency > 16) {
    throw createIngestError("session.invalid_state", "parallel.concurrency must be an integer from 2 through 16.", false);
  }
  const capabilities = rt.options.transport.capabilities;
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
    !(capabilities.supportsRemoteChunkReconciliation && rt.options.transport.reconcileChunks)
  ) {
    throw createIngestError(
      "resume.transport_unsupported",
      "Parallel upload requires sparse resume support or safe chunk repetition.",
      false
    );
  }
}

export function effectiveConcurrency(rt: SessionRuntime, chunkPlan: ChunkPlan, remainingChunks = chunkPlan.totalChunks): number {
  const requested = rt.options.parallel?.concurrency ?? 1;
  return Math.min(
    requested,
    rt.options.transport.capabilities?.maxParallelChunks ?? requested,
    Math.max(0, remainingChunks)
  );
}

export function parallelState(rt: SessionRuntime, chunkPlan: ChunkPlan, remainingChunks = chunkPlan.totalChunks) {
  if (!rt.options.parallel) return undefined;
  return {
    requestedConcurrency: rt.options.parallel.concurrency,
    effectiveConcurrency: effectiveConcurrency(rt, chunkPlan, remainingChunks),
    policyId: PARALLEL_POLICY_ID,
    integrityPolicyId: CHUNK_INTEGRITY_POLICY_ID,
    ambiguousChunkIndexes: [...rt.ambiguousChunks].sort((a, b) => a - b)
  };
}

export function validateParallelResume(rt: SessionRuntime, record: ResumeRecord, chunkPlan: ChunkPlan): void {
  if (!rt.options.parallel) {
    if (record.schemaVersion === "large-image-ingest.resume.v0.4") {
      throw emitResumeConflict(rt, "resume.chunking_mismatch", "Parallel resume requires the original parallel policy.", record.id);
    }
    return;
  }
  if (record.schemaVersion !== "large-image-ingest.resume.v0.4") {
    if (record.progress.uploadedBytes > 0) {
      throw emitResumeConflict(rt, "resume.chunking_mismatch", "Legacy progress cannot be promoted to parallel resume without integrity evidence.", record.id);
    }
    return;
  }
  const expected = parallelState(rt, chunkPlan);
  if (
    !expected ||
    record.parallel.policyId !== expected.policyId ||
    record.parallel.integrityPolicyId !== expected.integrityPolicyId ||
    record.parallel.requestedConcurrency !== expected.requestedConcurrency
  ) {
    throw emitResumeConflict(rt, "resume.chunking_mismatch", "Parallel resume policy does not match the persisted record.", record.id);
  }
}

export async function validatePersistedParallelEvidence(
  rt: SessionRuntime,
  record: Extract<ResumeRecord, { schemaVersion: "large-image-ingest.resume.v0.4" }>
): Promise<void> {
  for (const receipt of record.receipts) {
    const binding = receipt.integrity?.binding;
    if (!receipt.integrity || !binding) {
      throw emitResumeConflict(rt, "resume.receipt_invalid", "Parallel resume receipt lacks integrity evidence.", record.id);
    }
    const actual = await calculateBlobSha256(rt.file.slice(binding.startByte, binding.endByteExclusive), {
      encoding: receipt.integrity.local.encoding,
      signal: rt.abortController.signal
    });
    let matches = false;
    try {
      matches = checksumValuesEqual(actual, receipt.integrity.local);
    } catch {
      // Invalid encodings are persisted-record conflicts, not retryable transfer errors.
    }
    if (!matches) {
      throw emitResumeConflict(rt, "resume.receipt_invalid", "Parallel resume checksum evidence does not match the selected source.", record.id);
    }
    if (rt.options.transport.capabilities?.attestsChunkChecksum && !receipt.integrity.remote) {
      throw emitResumeConflict(rt, "resume.receipt_invalid", "Parallel resume receipt lacks required remote attestation.", record.id);
    }
  }
}

export async function reconcileParallelResume(
  rt: SessionRuntime,
  record: ResumeRecord,
  manifest: IngestManifest,
  session: TransportSession,
  chunkPlan: ChunkPlan
): Promise<ResumeRecord> {
  if (record.schemaVersion !== PARALLEL_RESUME_SCHEMA_VERSION) {
    return record;
  }
  rt.ambiguousChunks.clear();
  if (
    !rt.options.transport.capabilities?.supportsRemoteChunkReconciliation ||
    !rt.options.transport.reconcileChunks
  ) {
    return {
      ...record,
      parallel: { ...record.parallel, ambiguousChunkIndexes: [] }
    };
  }
  const remoteReceipts = await rt.options.transport.reconcileChunks({
    manifest,
    file: rt.file,
    signal: rt.abortController.signal,
    uploadId: session.uploadId,
    session,
    chunkPlan,
    localReceipts: sortedReceipts(rt)
  });
  const seen = new Set<number>();
  for (const receipt of remoteReceipts) {
    const chunk = chunkPlan.chunks[receipt.chunkIndex];
    if (!chunk || seen.has(receipt.chunkIndex)) {
      throw emitResumeConflict(rt, "resume.receipt_invalid", "Remote reconciliation returned duplicate or out-of-plan evidence.", record.id);
    }
    seen.add(receipt.chunkIndex);
    const local = await createChunkIntegrity(rt, manifest, session, chunk);
    const validated = validateReceipt(chunk, receipt);
    validateReceiptTransport(validated, session.transportName);
    validated.integrity = validateChunkIntegrity(rt, local, validated);
    const persisted = rt.completedReceipts.get(chunk.index);
    if (persisted && !receiptsDescribeSameRemoteChunk(persisted, validated)) {
      throw emitResumeConflict(rt, "resume.receipt_invalid", "Local and remote chunk evidence conflict.", record.id);
    }
    rt.completedReceipts.set(chunk.index, validated);
  }
  for (const receipt of record.receipts) {
    if (!seen.has(receipt.chunkIndex)) {
      throw emitResumeConflict(rt, "resume.receipt_invalid", "Remote reconciliation is missing a persisted acknowledged chunk.", record.id);
    }
  }
  const receipts = sortedReceipts(rt);
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

export async function validateParallelSnapshot(rt: SessionRuntime, manifest: IngestManifest, chunkPlan: ChunkPlan): Promise<void> {
  const snapshot = rt.options.resumeFrom;
  if (!snapshot) return;
  if (!rt.options.parallel) {
    if (snapshot.parallel) {
      throw createIngestError("transport.resume_failed", "Parallel snapshot requires the original parallel policy.", false);
    }
    return;
  }
  const expected = parallelState(rt, chunkPlan);
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
      binding.sourceIdentity !== requireParallelSourceIdentity(rt) ||
      binding.chunkIndex !== chunk.index ||
      binding.startByte !== chunk.start ||
      binding.endByteExclusive !== chunk.end ||
      binding.sizeBytes !== chunk.size
    ) {
      throw new ChunkIntegrityError("checksum.chunk_mismatch", "Parallel snapshot integrity scope does not match the active source.");
    }
    const actual = await calculateBlobSha256(rt.file.slice(chunk.start, chunk.end), {
      encoding: integrity.local.encoding,
      signal: rt.abortController.signal
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

export async function createChunkIntegrity(
  rt: SessionRuntime,
  manifest: IngestManifest,
  session: TransportSession,
  chunk: ChunkDescriptor
): Promise<ChunkIntegrityEvidence> {
  const checksum = await calculateBlobSha256(rt.file.slice(chunk.start, chunk.end), {
    encoding: "base64",
    signal: rt.abortController.signal
  });
  return {
    policyId: CHUNK_INTEGRITY_POLICY_ID,
    binding: {
      manifestId: manifest.id,
      uploadId: session.uploadId,
      sourceIdentity: requireParallelSourceIdentity(rt),
      chunkIndex: chunk.index,
      startByte: chunk.start,
      endByteExclusive: chunk.end,
      sizeBytes: chunk.size
    },
    local: { ...checksum, role: "local-calculation" }
  };
}

export function requireParallelSourceIdentity(rt: SessionRuntime): string {
  if (!rt.parallelSourceIdentity) {
    throw new ChunkIntegrityError("checksum.chunk_missing", "Parallel upload requires an exact source identity.");
  }
  return rt.parallelSourceIdentity.value;
}

export function validateChunkIntegrity(rt: SessionRuntime, local: ChunkIntegrityEvidence, receipt: UploadChunkReceipt): ChunkIntegrityEvidence {
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
  if (rt.options.transport.capabilities?.attestsChunkChecksum) {
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
