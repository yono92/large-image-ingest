// Part of resume.ts, split out to keep modules under 500 lines; public exports stay on resume.ts.
import { validateDomainProfileReference } from "./profiles.js";
import type {
  ContentSourceIdentityV1,
  DomainProfileReference,
  IngestManifest,
  ResumeChunkingIdentity,
  ResumeConflictCode,
  ResumeFileIdentity,
  ResumeRecord,
  ResumeRecordV0_3,
  ResumeRecordV0_4,
  ParallelUploadState,
  ResumeRecordValidationIssue,
  ResumeRecordValidationResult,
  ResumeTransportState,
  UploadChunkReceipt,
  UploadChunkResult,
  UploadSessionResult
} from "./types.js";
import { ResumeConflictError } from "./resume.js";
import { completedBytesForRanges, containsBinaryPayload, invalidReceipt, invalidRecord, isIsoTimestamp, isNonEmptyString, isNonNegativeSafeInteger, isPositiveSafeInteger, isRecord, rangesEqual, rangesForReceiptIndexes, validatePersistedProgress, validatePersistedReceipt } from "./resume-validation.js";
import { LEGACY_RESUME_RECORD_SCHEMA_VERSION, RESUME_RECORD_SCHEMA_VERSION, RESUME_RECORD_SCHEMA_VERSION_V0_2, RESUME_RECORD_SCHEMA_VERSION_V0_4 } from "./resume-shared.js";

export function createPersistentResumeRecord(input: {
  id?: string;
  manifest: IngestManifest;
  file: ResumeFileIdentity;
  contentIdentity: ContentSourceIdentityV1;
  chunking: ResumeChunkingIdentity;
  transport: ResumeTransportState;
  domainProfile?: DomainProfileReference;
  parallel?: ParallelUploadState;
  now?: Date;
}): ResumeRecordV0_3 | ResumeRecordV0_4 {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  if (input.file.sizeBytes !== input.contentIdentity.sizeBytes) {
    throw new TypeError("Resume file size and content identity size must match.");
  }

  const base = {
    id: input.id ?? `resume_${input.manifest.id}`,
    manifest: input.manifest,
    file: {
      ...input.file,
      contentIdentity: { ...input.contentIdentity }
    },
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
  if (input.parallel) {
    return {
      schemaVersion: RESUME_RECORD_SCHEMA_VERSION_V0_4,
      ...base,
      parallel: structuredClone(input.parallel)
    };
  }
  return { schemaVersion: RESUME_RECORD_SCHEMA_VERSION, ...base };
}

export function validateResumeRecord(value: unknown): ResumeRecordValidationResult {
  const issue = findResumeRecordIssue(value);
  if (issue) {
    return { ok: false, issues: [issue] };
  }

  try {
    const record = structuredClone(value) as ResumeRecord;
    if (
      record.schemaVersion === RESUME_RECORD_SCHEMA_VERSION_V0_2 ||
      record.schemaVersion === RESUME_RECORD_SCHEMA_VERSION ||
      record.schemaVersion === RESUME_RECORD_SCHEMA_VERSION_V0_4
    ) {
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
    value.schemaVersion !== RESUME_RECORD_SCHEMA_VERSION_V0_2 &&
    value.schemaVersion !== RESUME_RECORD_SCHEMA_VERSION &&
    value.schemaVersion !== RESUME_RECORD_SCHEMA_VERSION_V0_4
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

  if (value.domainProfile !== undefined && !validateDomainProfileReference(value.domainProfile)) {
    return invalidRecord("Resume domain profile reference is invalid.", "domainProfile");
  }

  const manifestIssue = validatePersistedManifest(value.manifest);
  if (manifestIssue) {
    return manifestIssue;
  }

  const fileIssue = validatePersistedFileIdentity(value.file, value.schemaVersion);
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

  if (value.schemaVersion === RESUME_RECORD_SCHEMA_VERSION_V0_4) {
    if (
      !isRecord(value.parallel) ||
      !isPositiveSafeInteger(value.parallel.requestedConcurrency) ||
      value.parallel.requestedConcurrency < 2 ||
      value.parallel.requestedConcurrency > 16 ||
      !isPositiveSafeInteger(value.parallel.effectiveConcurrency) ||
      value.parallel.effectiveConcurrency > value.parallel.requestedConcurrency ||
      !isNonEmptyString(value.parallel.policyId) ||
      !isNonEmptyString(value.parallel.integrityPolicyId) ||
      !Array.isArray(value.parallel.ambiguousChunkIndexes) ||
      value.parallel.ambiguousChunkIndexes.some((index) =>
        !isNonNegativeSafeInteger(index) || index >= chunking.totalChunks
      ) ||
      new Set(value.parallel.ambiguousChunkIndexes).size !== value.parallel.ambiguousChunkIndexes.length
    ) {
      return invalidRecord("Resume parallel policy is invalid.", "parallel");
    }
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
    if (
      value.schemaVersion === RESUME_RECORD_SCHEMA_VERSION_V0_4 &&
      (!typedReceipt.integrity || typedReceipt.integrity.policyId !== (value.parallel as ParallelUploadState).integrityPolicyId)
    ) {
      return invalidReceipt("Parallel resume receipt lacks matching integrity evidence.", `receipts[${index}].integrity`);
    }
    if (value.schemaVersion === RESUME_RECORD_SCHEMA_VERSION_V0_4 && typedReceipt.integrity) {
      const binding = typedReceipt.integrity.binding;
      const expectedStart = typedReceipt.chunkIndex * chunking.chunkSizeBytes;
      if (
        binding.manifestId !== manifest.id ||
        binding.uploadId !== (value.transport as ResumeTransportState).uploadId ||
        binding.sourceIdentity !== (file as ResumeFileIdentity & { contentIdentity: ContentSourceIdentityV1 }).contentIdentity.value ||
        binding.startByte !== expectedStart ||
        binding.endByteExclusive !== expectedStart + typedReceipt.sizeBytes
      ) {
        return invalidReceipt("Parallel resume receipt integrity scope does not match the record.", `receipts[${index}].integrity.binding`);
      }
    }
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

function validatePersistedFileIdentity(
  value: unknown,
  schemaVersion: unknown
): ResumeRecordValidationIssue | undefined {
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

  if (schemaVersion === RESUME_RECORD_SCHEMA_VERSION || schemaVersion === RESUME_RECORD_SCHEMA_VERSION_V0_4) {
    const contentIssue = validatePersistedContentIdentity(value.contentIdentity, value.sizeBytes);
    if (contentIssue) return contentIssue;
  }

  return undefined;
}

function validatePersistedContentIdentity(
  value: unknown,
  sizeBytes: unknown
): ResumeRecordValidationIssue | undefined {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "large-image-ingest.source-identity.v1" ||
    value.algorithm !== "sha256" ||
    value.scope !== "whole-file" ||
    value.sizeBytes !== sizeBytes ||
    typeof value.value !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.value)
  ) {
    return invalidRecord("Resume content identity is invalid.", "file.contentIdentity");
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
