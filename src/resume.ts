import { planChunks } from "./chunks.js";
import { createFastFingerprint } from "./fingerprint.js";
import type {
  ChunkPlanOptions,
  CompletedChunkRange,
  IngestFileLike,
  IngestManifest,
  ResumeChunkingIdentity,
  ResumeConflictCode,
  ResumeFileIdentity,
  ResumeRecord,
  ResumeRecordStatus,
  ResumeTransportState,
  UploadChunkResult,
  UploadSessionResult
} from "./types.js";

const RESUME_RECORD_SCHEMA_VERSION = "large-image-ingest.resume.v0.1" as const;

export class ResumeConflictError extends Error {
  readonly retryable = false;

  constructor(
    readonly code: ResumeConflictCode,
    message: string,
    readonly recordId?: string
  ) {
    super(message);
    this.name = "ResumeConflictError";
  }
}

export class UploadPausedError extends Error {
  readonly code = "transport.paused" as const;
  readonly retryable = false;

  constructor(readonly recordId?: string) {
    super("Upload paused.");
    this.name = "UploadPausedError";
  }
}

export class UploadCanceledError extends Error {
  readonly code = "transport.canceled" as const;
  readonly retryable = false;

  constructor(readonly recordId?: string) {
    super("Upload canceled.");
    this.name = "UploadCanceledError";
  }
}

export async function createResumeFileIdentity(file: IngestFileLike): Promise<ResumeFileIdentity> {
  const fingerprintValue = await createFastFingerprint(file);

  const identity: ResumeFileIdentity = {
    name: file.name,
    sizeBytes: file.size,
    mediaType: file.type || "application/octet-stream",
    fingerprint: {
      algorithm: fingerprintValue.startsWith("fast-") ? "metadata-fallback" : "metadata-sha256",
      scope: "file-metadata",
      value: fingerprintValue
    }
  };

  if (file.lastModified !== undefined) {
    identity.lastModified = file.lastModified;
  }

  return identity;
}

export function createResumeChunkingIdentity(
  totalBytes: number,
  options: ChunkPlanOptions = {}
): ResumeChunkingIdentity {
  const chunkPlan = planChunks(totalBytes, options);

  return {
    strategy: "fixed-size",
    chunkSizeBytes: chunkPlan.chunkSize,
    totalBytes: chunkPlan.totalBytes,
    totalChunks: chunkPlan.totalChunks
  };
}

export function fileIdentityMatches(expected: ResumeFileIdentity, actual: ResumeFileIdentity): boolean {
  return (
    expected.name === actual.name &&
    expected.sizeBytes === actual.sizeBytes &&
    expected.mediaType === actual.mediaType &&
    expected.fingerprint.value === actual.fingerprint.value &&
    (expected.lastModified === undefined ||
      actual.lastModified === undefined ||
      expected.lastModified === actual.lastModified)
  );
}

export function chunkingIdentityMatches(
  expected: ResumeChunkingIdentity,
  actual: ResumeChunkingIdentity
): boolean {
  return (
    expected.strategy === actual.strategy &&
    expected.chunkSizeBytes === actual.chunkSizeBytes &&
    expected.totalBytes === actual.totalBytes &&
    expected.totalChunks === actual.totalChunks
  );
}

export function mergeCompletedChunkRange(
  ranges: readonly CompletedChunkRange[],
  chunkIndex: number
): CompletedChunkRange[] {
  return normalizeCompletedChunkRanges([
    ...ranges,
    { startIndex: chunkIndex, endIndexInclusive: chunkIndex }
  ]);
}

export function normalizeCompletedChunkRanges(
  ranges: readonly CompletedChunkRange[]
): CompletedChunkRange[] {
  const sorted = ranges
    .filter((range) => range.startIndex <= range.endIndexInclusive)
    .slice()
    .sort((left, right) => left.startIndex - right.startIndex);

  const merged: CompletedChunkRange[] = [];

  for (const range of sorted) {
    const previous = merged[merged.length - 1];

    if (!previous || range.startIndex > previous.endIndexInclusive + 1) {
      merged.push({ ...range });
      continue;
    }

    previous.endIndexInclusive = Math.max(previous.endIndexInclusive, range.endIndexInclusive);
  }

  return merged;
}

export function isChunkCompleted(
  ranges: readonly CompletedChunkRange[],
  chunkIndex: number
): boolean {
  return ranges.some(
    (range) => chunkIndex >= range.startIndex && chunkIndex <= range.endIndexInclusive
  );
}

export function getNextIncompleteChunkIndex(
  ranges: readonly CompletedChunkRange[],
  totalChunks: number
): number {
  for (let index = 0; index < totalChunks; index += 1) {
    if (!isChunkCompleted(ranges, index)) {
      return index;
    }
  }

  return totalChunks;
}

export function isRecoverableResumeStatus(status: ResumeRecordStatus): boolean {
  return status === "active" || status === "paused" || status === "failed";
}

export function isResumeRecordExpired(record: ResumeRecord, now = new Date()): boolean {
  if (record.progress.status === "expired") {
    return true;
  }

  if (!record.transport.expiresAt) {
    return false;
  }

  return Date.parse(record.transport.expiresAt) <= now.getTime();
}

export function isRecoverableResumeRecord(record: ResumeRecord, now = new Date()): boolean {
  return isRecoverableResumeStatus(record.progress.status) && !isResumeRecordExpired(record, now);
}

export async function classifyResumeRecordForFile(
  record: ResumeRecord,
  file: IngestFileLike,
  options: ChunkPlanOptions = {}
): Promise<"compatible" | "file_mismatch" | "chunking_mismatch" | "not_recoverable" | "expired"> {
  if (isResumeRecordExpired(record)) {
    return "expired";
  }

  if (!isRecoverableResumeStatus(record.progress.status)) {
    return "not_recoverable";
  }

  const fileIdentity = await createResumeFileIdentity(file);
  if (!fileIdentityMatches(record.file, fileIdentity)) {
    return "file_mismatch";
  }

  const chunking = createResumeChunkingIdentity(file.size, options);
  if (!chunkingIdentityMatches(record.chunking, chunking)) {
    return "chunking_mismatch";
  }

  return "compatible";
}

export function listRecoverableResumeRecords(
  records: readonly ResumeRecord[],
  now = new Date()
): ResumeRecord[] {
  return records.filter((record) => isRecoverableResumeRecord(record, now));
}

export function createResumeRecord(input: {
  id?: string;
  manifest: IngestManifest;
  file: ResumeFileIdentity;
  chunking: ResumeChunkingIdentity;
  transport: ResumeTransportState;
  now?: Date;
}): ResumeRecord {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();

  return {
    schemaVersion: RESUME_RECORD_SCHEMA_VERSION,
    id: input.id ?? `resume_${input.manifest.id}`,
    manifest: input.manifest,
    file: input.file,
    chunking: input.chunking,
    transport: input.transport,
    progress: {
      status: "active",
      uploadedBytes: 0,
      completedChunkRanges: [],
      nextChunkIndex: 0
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function mergeTransportState(
  current: ResumeTransportState,
  result: UploadSessionResult | UploadChunkResult
): ResumeTransportState {
  const next: ResumeTransportState = {
    uploadId: "uploadId" in result ? result.uploadId : current.uploadId
  };

  if (current.name !== undefined) {
    next.name = current.name;
  }

  const resumeToken = result.resumeToken ?? current.resumeToken;
  if (resumeToken !== undefined) {
    next.resumeToken = resumeToken;
  }

  const expiresAt = result.expiresAt ?? current.expiresAt;
  if (expiresAt !== undefined) {
    next.expiresAt = expiresAt;
  }

  const data = result.data ?? current.data;
  if (data !== undefined) {
    next.data = data;
  }

  return next;
}

export function createResumeConflict(
  code: ResumeConflictCode,
  message: string,
  recordId?: string
): ResumeConflictError {
  return new ResumeConflictError(code, message, recordId);
}
