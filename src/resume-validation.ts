// Part of resume.ts, split out to keep modules under 500 lines; public exports stay on resume.ts.
import type {
  CompletedChunkRange,
  ResumeChunkingIdentity,
  ResumeRecordStatus,
  ResumeRecordValidationIssue
} from "./types.js";
import { RESUME_RECORD_STATUSES } from "./resume-shared.js";

export function validatePersistedProgress(
  value: unknown,
  chunking: ResumeChunkingIdentity
): ResumeRecordValidationIssue | undefined {
  if (
    !isRecord(value) ||
    typeof value.status !== "string" ||
    !RESUME_RECORD_STATUSES.has(value.status as ResumeRecordStatus) ||
    !isNonNegativeSafeInteger(value.uploadedBytes) ||
    !isNonNegativeSafeInteger(value.nextChunkIndex) ||
    !Array.isArray(value.completedChunkRanges)
  ) {
    return invalidRecord("Resume progress is invalid.", "progress");
  }

  if (value.uploadedBytes > chunking.totalBytes || value.nextChunkIndex > chunking.totalChunks) {
    return invalidRecord("Resume progress exceeds the active chunk plan.", "progress");
  }

  if (value.completedChunkRanges.length > chunking.totalChunks) {
    return invalidRecord("Resume progress contains too many completed ranges.", "progress.completedChunkRanges");
  }

  let previousEnd = -2;
  for (let index = 0; index < value.completedChunkRanges.length; index += 1) {
    const range = value.completedChunkRanges[index];
    if (
      !isRecord(range) ||
      !isNonNegativeSafeInteger(range.startIndex) ||
      !isNonNegativeSafeInteger(range.endIndexInclusive) ||
      range.startIndex > range.endIndexInclusive ||
      range.endIndexInclusive >= chunking.totalChunks ||
      range.startIndex <= previousEnd + 1
    ) {
      return invalidRecord("Completed chunk ranges must be bounded, sorted, and normalized.", `progress.completedChunkRanges[${index}]`);
    }
    previousEnd = range.endIndexInclusive;
  }

  const ranges = value.completedChunkRanges as unknown as CompletedChunkRange[];
  if (value.nextChunkIndex !== nextIncompleteIndexFromRanges(ranges, chunking.totalChunks)) {
    return invalidRecord("Resume next chunk index does not match completed ranges.", "progress.nextChunkIndex");
  }

  return undefined;
}

export function validatePersistedReceipt(
  value: unknown,
  position: number,
  chunking: ResumeChunkingIdentity,
  recordTransportName: string | undefined
): ResumeRecordValidationIssue | undefined {
  const path = `receipts[${position}]`;
  if (
    !isRecord(value) ||
    !isNonNegativeSafeInteger(value.chunkIndex) ||
    value.chunkIndex >= chunking.totalChunks ||
    !isNonNegativeSafeInteger(value.sizeBytes) ||
    !isIsoTimestamp(value.completedAt) ||
    !isRecord(value.transport) ||
    !isNonEmptyString(value.transport.name)
  ) {
    return invalidReceipt("Persisted chunk receipt is invalid.", path);
  }

  if (value.sizeBytes !== expectedChunkSize(chunking, value.chunkIndex)) {
    return invalidReceipt("Persisted chunk receipt size does not match the chunk plan.", `${path}.sizeBytes`);
  }

  if (recordTransportName && value.transport.name !== recordTransportName) {
    return invalidReceipt("Persisted receipt transport does not match the resume transport.", `${path}.transport.name`);
  }

  if (value.checksum !== undefined && (
    !isRecord(value.checksum) ||
    !isNonEmptyString(value.checksum.algorithm) ||
    !isNonEmptyString(value.checksum.value)
  )) {
    return invalidReceipt("Persisted receipt checksum is invalid.", `${path}.checksum`);
  }

  if (value.integrity !== undefined) {
    if (
      !isRecord(value.integrity) ||
      !isNonEmptyString(value.integrity.policyId) ||
      !isValidChunkIntegrityBinding(value.integrity.binding, value.chunkIndex, value.sizeBytes) ||
      !isValidChunkChecksumValue(value.integrity.local) ||
      (value.integrity.remote !== undefined && !isValidChunkChecksumValue(value.integrity.remote))
    ) {
      return invalidReceipt("Persisted receipt integrity evidence is invalid.", `${path}.integrity`);
    }
  }

  if (value.transport.partNumber !== undefined && !isNonNegativeSafeInteger(value.transport.partNumber)) {
    return invalidReceipt("Persisted receipt part number is invalid.", `${path}.transport.partNumber`);
  }

  if (value.transport.offset !== undefined && !isNonNegativeSafeInteger(value.transport.offset)) {
    return invalidReceipt("Persisted receipt offset is invalid.", `${path}.transport.offset`);
  }

  for (const key of ["etag", "location"] as const) {
    if (value.transport[key] !== undefined && typeof value.transport[key] !== "string") {
      return invalidReceipt(`Persisted receipt ${key} must be a string.`, `${path}.transport.${key}`);
    }
  }

  if (value.transport.opaque !== undefined && !isRecord(value.transport.opaque)) {
    return invalidReceipt("Persisted receipt opaque data must be an object.", `${path}.transport.opaque`);
  }

  return undefined;
}

function isValidChunkChecksumValue(value: unknown): boolean {
  return isRecord(value) &&
    isNonEmptyString(value.algorithm) &&
    (value.encoding === "hex" || value.encoding === "base64") &&
    isNonEmptyString(value.value) &&
    (value.role === "local-calculation" || value.role === "remote-attestation");
}

function isValidChunkIntegrityBinding(value: unknown, chunkIndex: unknown, sizeBytes: unknown): boolean {
  return isRecord(value) &&
    isNonEmptyString(value.manifestId) &&
    isNonEmptyString(value.uploadId) &&
    isNonEmptyString(value.sourceIdentity) &&
    value.chunkIndex === chunkIndex &&
    isNonNegativeSafeInteger(value.startByte) &&
    isNonNegativeSafeInteger(value.endByteExclusive) &&
    value.endByteExclusive >= value.startByte &&
    value.endByteExclusive - value.startByte === sizeBytes &&
    value.sizeBytes === sizeBytes;
}

export function completedBytesForRanges(
  ranges: readonly CompletedChunkRange[],
  chunking: ResumeChunkingIdentity
): number {
  let total = 0;
  for (const range of ranges) {
    const count = range.endIndexInclusive - range.startIndex + 1;
    total += count * chunking.chunkSizeBytes;
    if (range.endIndexInclusive === chunking.totalChunks - 1) {
      total -= chunking.chunkSizeBytes - expectedChunkSize(chunking, range.endIndexInclusive);
    }
  }
  return total;
}

function expectedChunkSize(chunking: ResumeChunkingIdentity, chunkIndex: number): number {
  const start = chunkIndex * chunking.chunkSizeBytes;
  return Math.min(chunking.chunkSizeBytes, chunking.totalBytes - start);
}

function nextIncompleteIndexFromRanges(
  ranges: readonly CompletedChunkRange[],
  totalChunks: number
): number {
  let next = 0;
  for (const range of ranges) {
    if (range.startIndex > next) {
      break;
    }
    next = Math.max(next, range.endIndexInclusive + 1);
  }
  return Math.min(next, totalChunks);
}

export function rangesForReceiptIndexes(indexes: readonly number[]): CompletedChunkRange[] {
  return indexes.reduce<CompletedChunkRange[]>((ranges, chunkIndex) => {
    const previous = ranges[ranges.length - 1];
    if (!previous || chunkIndex > previous.endIndexInclusive + 1) {
      ranges.push({ startIndex: chunkIndex, endIndexInclusive: chunkIndex });
    } else {
      previous.endIndexInclusive = chunkIndex;
    }
    return ranges;
  }, []);
}

export function rangesEqual(
  left: readonly CompletedChunkRange[],
  right: readonly CompletedChunkRange[]
): boolean {
  return left.length === right.length && left.every((range, index) => (
    range.startIndex === right[index]?.startIndex &&
    range.endIndexInclusive === right[index]?.endIndexInclusive
  ));
}

export function invalidRecord(message: string, path: string): ResumeRecordValidationIssue {
  return { code: "resume.record_invalid", message, path };
}

export function invalidReceipt(message: string, path: string): ResumeRecordValidationIssue {
  return { code: "resume.receipt_invalid", message, path };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value > 0;
}

export function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    return false;
  }

  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

export function containsBinaryPayload(value: unknown, seen = new WeakSet<object>()): boolean {
  if (
    value instanceof Blob ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  ) {
    return true;
  }

  if (!value || typeof value !== "object" || seen.has(value)) {
    return false;
  }

  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => containsBinaryPayload(item, seen));
  }

  return Object.values(value).some((item) => containsBinaryPayload(item, seen));
}
