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
  ResumeRecordV0_2,
  ResumeRecordValidationIssue,
  ResumeRecordValidationResult,
  ResumeTransportState,
  UploadChunkReceipt,
  UploadChunkResult,
  UploadSessionResult
} from "./types.js";

const LEGACY_RESUME_RECORD_SCHEMA_VERSION = "large-image-ingest.resume.v0.1" as const;
const RESUME_RECORD_SCHEMA_VERSION = "large-image-ingest.resume.v0.2" as const;
const RESUME_RECORD_STATUSES = new Set<ResumeRecordStatus>([
  "active",
  "paused",
  "failed",
  "completed",
  "canceled",
  "expired"
]);

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
}): ResumeRecordV0_2 {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();

  return {
    schemaVersion: RESUME_RECORD_SCHEMA_VERSION,
    id: input.id ?? `resume_${input.manifest.id}`,
    manifest: input.manifest,
    file: input.file,
    chunking: input.chunking,
    transport: input.transport,
    receipts: [],
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

export function validateResumeRecord(value: unknown): ResumeRecordValidationResult {
  const issue = findResumeRecordIssue(value);
  if (issue) {
    return { ok: false, issues: [issue] };
  }

  try {
    const record = structuredClone(value) as ResumeRecord;
    if (record.schemaVersion === RESUME_RECORD_SCHEMA_VERSION) {
      record.receipts.sort((left, right) => left.chunkIndex - right.chunkIndex);
    }
    return { ok: true, issues: [], record };
  } catch {
    return {
      ok: false,
      issues: [{
        code: "resume.record_invalid",
        message: "Resume record must contain cloneable persisted data.",
        path: "record"
      }]
    };
  }
}

export function parseResumeRecord(value: unknown): ResumeRecord {
  const result = validateResumeRecord(value);
  if (result.ok) {
    return result.record;
  }

  const issue = result.issues[0] ?? {
    code: "resume.record_invalid" as const,
    message: "Resume record is invalid."
  };
  const recordId = isRecord(value) && typeof value.id === "string" ? value.id : undefined;
  throw new ResumeConflictError(issue.code, issue.message, recordId);
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

function findResumeRecordIssue(value: unknown): ResumeRecordValidationIssue | undefined {
  if (!isRecord(value)) {
    return invalidRecord("Resume record must be an object.", "record");
  }

  if (containsBinaryPayload(value)) {
    return invalidRecord("Resume record must not contain binary payloads.", "record");
  }

  if (
    value.schemaVersion !== LEGACY_RESUME_RECORD_SCHEMA_VERSION &&
    value.schemaVersion !== RESUME_RECORD_SCHEMA_VERSION
  ) {
    return {
      code: "resume.schema_unsupported",
      message: "Resume record schema version is not supported.",
      path: "schemaVersion"
    };
  }

  if (!isNonEmptyString(value.id)) {
    return invalidRecord("Resume record id is required.", "id");
  }

  if (!isIsoTimestamp(value.createdAt) || !isIsoTimestamp(value.updatedAt)) {
    return invalidRecord("Resume record timestamps must be valid ISO timestamps.", "createdAt");
  }

  const manifestIssue = validatePersistedManifest(value.manifest);
  if (manifestIssue) {
    return manifestIssue;
  }

  const fileIssue = validatePersistedFileIdentity(value.file);
  if (fileIssue) {
    return fileIssue;
  }

  const chunkingIssue = validatePersistedChunking(value.chunking);
  if (chunkingIssue) {
    return chunkingIssue;
  }

  const chunking = value.chunking as unknown as ResumeChunkingIdentity;
  const file = value.file as unknown as ResumeFileIdentity;
  const manifest = value.manifest as unknown as IngestManifest;
  if (
    file.sizeBytes !== chunking.totalBytes ||
    manifest.original.sizeBytes !== chunking.totalBytes ||
    manifest.chunking.totalBytes !== chunking.totalBytes ||
    manifest.chunking.chunkSizeBytes !== chunking.chunkSizeBytes ||
    manifest.chunking.totalChunks !== chunking.totalChunks
  ) {
    return invalidRecord("Resume record file, manifest, and chunking totals must agree.", "chunking");
  }

  const transportIssue = validatePersistedTransport(value.transport);
  if (transportIssue) {
    return transportIssue;
  }

  const progressIssue = validatePersistedProgress(value.progress, chunking);
  if (progressIssue) {
    return progressIssue;
  }

  const progress = value.progress as ResumeRecord["progress"];
  if (value.schemaVersion === LEGACY_RESUME_RECORD_SCHEMA_VERSION) {
    const expectedBytes = completedBytesForRanges(
      progress.completedChunkRanges,
      chunking
    );
    if (progress.uploadedBytes !== expectedBytes) {
      return invalidRecord("Resume progress bytes do not match completed ranges.", "progress.uploadedBytes");
    }
    return undefined;
  }

  if (!Array.isArray(value.receipts)) {
    return invalidReceipt("Resume record receipts must be an array.", "receipts");
  }

  if (value.receipts.length > chunking.totalChunks) {
    return invalidReceipt("Resume record contains more receipts than planned chunks.", "receipts");
  }

  const recordTransportName = isRecord(value.transport) && typeof value.transport.name === "string"
    ? value.transport.name
    : undefined;
  const receiptIndexes = new Set<number>();
  const receipts: UploadChunkReceipt[] = [];

  for (let index = 0; index < value.receipts.length; index += 1) {
    const receipt = value.receipts[index];
    const receiptIssue = validatePersistedReceipt(
      receipt,
      index,
      chunking,
      recordTransportName
    );
    if (receiptIssue) {
      return receiptIssue;
    }

    const typedReceipt = receipt as UploadChunkReceipt;
    if (receiptIndexes.has(typedReceipt.chunkIndex)) {
      return invalidReceipt("Resume record contains duplicate chunk receipts.", `receipts[${index}].chunkIndex`);
    }
    receiptIndexes.add(typedReceipt.chunkIndex);
    receipts.push(typedReceipt);
  }

  receipts.sort((left, right) => left.chunkIndex - right.chunkIndex);
  const expectedRanges = rangesForReceiptIndexes(receipts.map((receipt) => receipt.chunkIndex));
  if (!rangesEqual(progress.completedChunkRanges, expectedRanges)) {
    return invalidReceipt("Resume receipt indexes do not match completed ranges.", "progress.completedChunkRanges");
  }

  const expectedBytes = receipts.reduce((total, receipt) => total + receipt.sizeBytes, 0);
  if (progress.uploadedBytes !== expectedBytes) {
    return invalidReceipt("Resume progress bytes do not match persisted receipts.", "progress.uploadedBytes");
  }

  return undefined;
}

function validatePersistedManifest(value: unknown): ResumeRecordValidationIssue | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isRecord(value.original) || !isRecord(value.chunking)) {
    return invalidRecord("Resume record manifest is invalid.", "manifest");
  }

  if (
    value.schemaVersion !== "large-image-ingest.manifest.v1" ||
    !isNonNegativeSafeInteger(value.original.sizeBytes) ||
    !isPositiveSafeInteger(value.chunking.chunkSizeBytes) ||
    !isNonNegativeSafeInteger(value.chunking.totalBytes) ||
    !isNonNegativeSafeInteger(value.chunking.totalChunks)
  ) {
    return invalidRecord("Resume record manifest identity is invalid.", "manifest");
  }

  return undefined;
}

function validatePersistedFileIdentity(value: unknown): ResumeRecordValidationIssue | undefined {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.name) ||
    !isNonNegativeSafeInteger(value.sizeBytes) ||
    !isNonEmptyString(value.mediaType) ||
    !isRecord(value.fingerprint) ||
    !isNonEmptyString(value.fingerprint.value)
  ) {
    return invalidRecord("Resume file identity is invalid.", "file");
  }

  if (value.lastModified !== undefined && !isNonNegativeSafeInteger(value.lastModified)) {
    return invalidRecord("Resume file lastModified must be a non-negative safe integer.", "file.lastModified");
  }

  return undefined;
}

function validatePersistedChunking(value: unknown): ResumeRecordValidationIssue | undefined {
  if (
    !isRecord(value) ||
    value.strategy !== "fixed-size" ||
    !isPositiveSafeInteger(value.chunkSizeBytes) ||
    !isNonNegativeSafeInteger(value.totalBytes) ||
    !isNonNegativeSafeInteger(value.totalChunks)
  ) {
    return invalidRecord("Resume chunking identity is invalid.", "chunking");
  }

  const expectedChunks = value.totalBytes === 0 ? 0 : Math.ceil(value.totalBytes / value.chunkSizeBytes);
  if (value.totalChunks !== expectedChunks) {
    return invalidRecord("Resume chunk count does not match total bytes and chunk size.", "chunking.totalChunks");
  }

  return undefined;
}

function validatePersistedTransport(value: unknown): ResumeRecordValidationIssue | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.uploadId)) {
    return invalidRecord("Resume transport upload id is required.", "transport.uploadId");
  }

  for (const key of ["name", "resumeToken", "expiresAt"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") {
      return invalidRecord(`Resume transport ${key} must be a string.`, `transport.${key}`);
    }
  }

  if (value.expiresAt !== undefined && !isIsoTimestamp(value.expiresAt)) {
    return invalidRecord("Resume transport expiration must be an ISO timestamp.", "transport.expiresAt");
  }

  if (value.data !== undefined && !isRecord(value.data)) {
    return invalidRecord("Resume transport data must be an object.", "transport.data");
  }

  return undefined;
}

function validatePersistedProgress(
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

function validatePersistedReceipt(
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

function completedBytesForRanges(
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

function rangesForReceiptIndexes(indexes: readonly number[]): CompletedChunkRange[] {
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

function rangesEqual(
  left: readonly CompletedChunkRange[],
  right: readonly CompletedChunkRange[]
): boolean {
  return left.length === right.length && left.every((range, index) => (
    range.startIndex === right[index]?.startIndex &&
    range.endIndexInclusive === right[index]?.endIndexInclusive
  ));
}

function invalidRecord(message: string, path: string): ResumeRecordValidationIssue {
  return { code: "resume.record_invalid", message, path };
}

function invalidReceipt(message: string, path: string): ResumeRecordValidationIssue {
  return { code: "resume.receipt_invalid", message, path };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    return false;
  }

  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function containsBinaryPayload(value: unknown, seen = new WeakSet<object>()): boolean {
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
