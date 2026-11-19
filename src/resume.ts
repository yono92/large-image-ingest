import { planChunks } from "./chunks.js";
import { calculateChecksum } from "./checksum.js";
import { LargeImageIngestError } from "./errors.js";
import { createFastFingerprint } from "./fingerprint.js";
import { domainProfileReferencesEqual } from "./profiles.js";
import type {
  ChecksumOptions,
  ChunkPlanOptions,
  CompletedChunkRange,
  ContentSourceIdentityV1,
  DomainProfileReference,
  FileChecksum,
  IngestFileLike,
  IngestManifest,
  PersistentResumeClassificationOptions,
  ResumeChunkingIdentity,
  ResumeCompatibilityResult,
  ResumeConflictCode,
  ResumeFileIdentity,
  ResumeRecord,
  ResumeRecordStatus,
  ResumeRecordV0_2,
  ResumeTransportState,
  TransportCapabilities,
  TransportRecoveryCapabilities
} from "./types.js";
import { LEGACY_RESUME_RECORD_SCHEMA_VERSION, RESUME_RECORD_SCHEMA_VERSION, RESUME_RECORD_SCHEMA_VERSION_V0_2, RESUME_RECORD_SCHEMA_VERSION_V0_4 } from "./resume-shared.js";
export { createPersistentResumeRecord, validateResumeRecord, parseResumeRecord, mergeTransportState, createResumeConflict } from "./resume-records.js";

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

export async function createContentSourceIdentity(
  file: IngestFileLike,
  options: ChecksumOptions = {}
): Promise<ContentSourceIdentityV1> {
  const checksum = await calculateChecksum(file, options);
  const expected = options.expected;
  if (expected && checksum.value.toLowerCase() !== expected.toLowerCase()) {
    throw new LargeImageIngestError(
      "checksum.mismatch",
      "File checksum does not match the expected checksum."
    );
  }
  return createContentSourceIdentityFromChecksum(file.size, checksum);
}

export function createContentSourceIdentityFromChecksum(
  sizeBytes: number,
  checksum: FileChecksum
): ContentSourceIdentityV1 {
  if (
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 0 ||
    checksum.algorithm !== "sha256" ||
    checksum.scope !== "whole-file" ||
    !/^[a-fA-F0-9]{64}$/.test(checksum.value)
  ) {
    throw new TypeError("Whole-file SHA-256 evidence is required for persistent source identity.");
  }
  return {
    schemaVersion: "large-image-ingest.source-identity.v1",
    algorithm: "sha256",
    scope: "whole-file",
    sizeBytes,
    value: checksum.value.toLowerCase()
  };
}

export function contentSourceIdentityMatches(
  expected: ContentSourceIdentityV1,
  actual: ContentSourceIdentityV1
): boolean {
  return (
    expected.schemaVersion === actual.schemaVersion &&
    expected.algorithm === actual.algorithm &&
    expected.scope === actual.scope &&
    expected.sizeBytes === actual.sizeBytes &&
    expected.value === actual.value
  );
}

export function normalizeTransportRecoveryCapabilities(
  capabilities?: TransportCapabilities
): TransportRecoveryCapabilities {
  return {
    resumable: capabilities?.resumable ?? false,
    snapshotResume: capabilities?.supportsSnapshotResume === true,
    persistentResume: capabilities?.supportsPersistentResume === true
  };
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
  const result = await classifyPersistentResume(record, file, options);
  if (result.status === "resumable" || result.status === "upgradeable") return "compatible";
  if (result.status === "expired") return "expired";
  if (result.reason === "chunking_mismatch") return "chunking_mismatch";
  if (result.reason === "source_mismatch") return "file_mismatch";
  return "not_recoverable";
}

export async function classifyPersistentResume(
  record: ResumeRecord,
  file: IngestFileLike,
  options: PersistentResumeClassificationOptions = {}
): Promise<ResumeCompatibilityResult> {
  if (isResumeRecordExpired(record)) {
    return compatibility(record, "expired", "expired");
  }
  if (!isRecoverableResumeStatus(record.progress.status)) {
    return compatibility(record, "restart_only", "terminal");
  }
  if (
    options.capabilities &&
    !normalizeTransportRecoveryCapabilities(options.capabilities).persistentResume
  ) {
    return compatibility(record, "incompatible", "transport_unsupported");
  }
  if (
    options.capabilities?.name &&
    record.transport.name &&
    options.capabilities.name !== record.transport.name
  ) {
    return compatibility(record, "incompatible", "transport_mismatch");
  }
  if (!domainProfileReferencesEqual(record.domainProfile, options.domainProfile)) {
    return record.progress.uploadedBytes === 0
      ? compatibility(record, "restart_only", "profile_mismatch")
      : compatibility(record, "incompatible", "profile_mismatch");
  }

  const metadataIdentity = await createResumeFileIdentity(file);
  if (!fileIdentityMatches(record.file, metadataIdentity)) {
    return compatibility(record, "incompatible", "source_mismatch");
  }
  const chunking = createResumeChunkingIdentity(file.size, options);
  if (!chunkingIdentityMatches(record.chunking, chunking)) {
    return compatibility(record, "incompatible", "chunking_mismatch");
  }

  const expectedIdentity = readTrustedContentIdentity(record);
  if (!expectedIdentity) {
    return record.progress.uploadedBytes === 0
      ? compatibility(record, "restart_only", "identity_missing")
      : compatibility(record, "incompatible", "identity_missing");
  }

  const actualIdentity = options.sourceIdentity ?? await createContentSourceIdentity(
    file,
    options.checksum
  );
  if (!contentSourceIdentityMatches(expectedIdentity, actualIdentity)) {
    return compatibility(record, "incompatible", "source_mismatch");
  }
  if (
    record.schemaVersion === LEGACY_RESUME_RECORD_SCHEMA_VERSION &&
    record.progress.uploadedBytes > 0 &&
    record.transport.name?.startsWith("s3") === true
  ) {
    return compatibility(record, "incompatible", "receipt_missing");
  }
  if (record.schemaVersion === RESUME_RECORD_SCHEMA_VERSION || record.schemaVersion === RESUME_RECORD_SCHEMA_VERSION_V0_4) {
    return compatibility(record, "resumable", "compatible");
  }
  if (
    record.schemaVersion === LEGACY_RESUME_RECORD_SCHEMA_VERSION &&
    record.progress.uploadedBytes > 0
  ) {
    return compatibility(record, "resumable", "compatible");
  }
  return compatibility(record, "upgradeable", "legacy_upgrade_available");
}

function compatibility(
  record: ResumeRecord,
  status: ResumeCompatibilityResult["status"],
  reason: ResumeCompatibilityResult["reason"]
): ResumeCompatibilityResult {
  return { status, reason, recordId: record.id };
}

function readTrustedContentIdentity(record: ResumeRecord): ContentSourceIdentityV1 | undefined {
  if (record.schemaVersion === RESUME_RECORD_SCHEMA_VERSION || record.schemaVersion === RESUME_RECORD_SCHEMA_VERSION_V0_4) {
    return record.file.contentIdentity;
  }
  const checksum = record.manifest.original.checksum;
  if (!checksum) return undefined;
  try {
    return createContentSourceIdentityFromChecksum(record.file.sizeBytes, checksum);
  } catch {
    return undefined;
  }
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
  domainProfile?: DomainProfileReference;
  now?: Date;
}): ResumeRecordV0_2 {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();

  return {
    schemaVersion: RESUME_RECORD_SCHEMA_VERSION_V0_2,
    id: input.id ?? `resume_${input.manifest.id}`,
    manifest: input.manifest,
    file: input.file,
    chunking: input.chunking,
    transport: input.transport,
    ...(input.domainProfile ? { domainProfile: structuredClone(input.domainProfile) } : {}),
    receipts: [],
    progress: {
      status: "active" as const,
      uploadedBytes: 0,
      completedChunkRanges: [],
      nextChunkIndex: 0
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
