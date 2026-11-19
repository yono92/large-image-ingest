import { calculateChecksum } from "./checksum.js";
import { createContentSourceIdentityFromChecksum, getNextIncompleteChunkIndex } from "./resume.js";
import type {
  ChunkPlan,
  FileChecksum,
  IngestManifest,
  ResumeRecord,
  TransportSession
} from "./types.js";
import { calculateUploadedBytes, cloneReceipt, receiptsToRanges } from "./session-receipts.js";
import { createIngestError, nowIso } from "./session-state.js";
import type { SessionRuntime } from "./session-runtime.js";
import { createInitialResumeRecord, withSessionChecksumAuthority } from "./session-resume.js";
import { putResumeRecord } from "./session-resume-store.js";
import { sortedReceipts } from "./session-transfer.js";

/** Whole-file checksum running while chunks upload (`overlapChecksum`). */
export interface PendingChecksum {
  readonly promise: Promise<FileChecksum>;
  result?: FileChecksum;
  failed?: boolean;
}

export function validateOverlapAdmission(rt: SessionRuntime): void {
  const options = rt.options;
  if (!options.overlapChecksum) return;
  if (options.checksum === false || options.manifest || options.resumeFrom || options.parallel) {
    throw createIngestError(
      "session.invalid_state",
      "overlapChecksum requires a new sequential upload that calculates its own checksum.",
      false
    );
  }
}

export function startOverlapChecksum(rt: SessionRuntime): PendingChecksum {
  const options = withSessionChecksumAuthority(rt, rt.options.checksum || {});
  const pending: PendingChecksum = { promise: calculateChecksum(rt.file, options) };
  pending.promise.then((result) => { pending.result = result; }, () => { pending.failed = true; });
  return pending;
}

/** Waits for the checksum, records it in the manifest and enforces `checksum.expected`. */
export async function settleOverlapChecksum(
  rt: SessionRuntime,
  manifest: IngestManifest,
  pending: PendingChecksum
): Promise<FileChecksum> {
  const checksum = await pending.promise;
  if (manifest.original.checksum) return checksum;
  Object.assign(manifest.original, { checksum });
  const expected = rt.options.checksum ? rt.options.checksum.expected : undefined;
  if (expected && checksum.value.toLowerCase() !== expected.toLowerCase()) {
    manifest.validation.issues.push({
      code: "checksum.mismatch",
      message: "File checksum does not match the expected checksum.",
      path: "original.checksum.value",
      severity: "error",
      details: { expected, actual: checksum.value, algorithm: checksum.algorithm }
    });
    manifest.validation.ok = false;
    throw createIngestError("validation.failed", "The file checksum does not match the expected checksum.", false);
  }
  return checksum;
}

/**
 * Creates the persistent resume record once the overlapped checksum is known,
 * carrying every chunk already uploaded in one store write.
 */
export async function promoteOverlapRecord(
  rt: SessionRuntime,
  manifest: IngestManifest,
  session: TransportSession,
  chunkPlan: ChunkPlan,
  pending: PendingChecksum
): Promise<ResumeRecord | undefined> {
  const checksum = await settleOverlapChecksum(rt, manifest, pending);
  const contentIdentity = createContentSourceIdentityFromChecksum(rt.file.size, checksum);
  const record = await createInitialResumeRecord(rt, manifest, session, contentIdentity);
  if (!record) return undefined;
  const receipts = sortedReceipts(rt);
  if (receipts.length === 0) return record;
  const completedChunkRanges = receiptsToRanges(receipts);
  const next = await putResumeRecord(rt, {
    ...record,
    receipts: receipts.map(cloneReceipt),
    progress: {
      ...record.progress,
      status: "active",
      uploadedBytes: calculateUploadedBytes(receipts),
      completedChunkRanges,
      nextChunkIndex: getNextIncompleteChunkIndex(completedChunkRanges, chunkPlan.totalChunks)
    },
    updatedAt: nowIso()
  } as ResumeRecord);
  rt.emit({ type: "resume:checkpoint", recordId: next.id, completedChunkRanges: next.progress.completedChunkRanges });
  return next;
}
