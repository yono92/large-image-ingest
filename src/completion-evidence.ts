import { calculateChecksum } from "./checksum.js";
import { LARGE_IMAGE_INGEST_VERSION } from "./version.js";
import type {
  ChecksumReceipt,
  CompletionEvidenceValidationIssue,
  CompletionEvidenceValidationResult,
  CompletionIssueCode,
  CreateCompletionEvidenceInput,
  FileChecksum,
  IngestCompletionEvidence,
  ReceiptSetDigest,
  StorageTargetManifest,
  UploadChunkReceipt,
  UploadCompletionResult
} from "./types.js";

const COMPLETION_SCHEMA_VERSION = "large-image-ingest.completion.v1" as const;
const SHA256_HEX = /^[a-f0-9]{64}$/i;

export class CompletionEvidenceError extends Error {
  readonly retryable = false;

  constructor(readonly code: CompletionIssueCode, message: string) {
    super(message);
    this.name = "CompletionEvidenceError";
  }
}

export async function createCompletionEvidence(
  input: CreateCompletionEvidenceInput
): Promise<IngestCompletionEvidence> {
  const createdAt = (input.now ?? new Date()).toISOString();
  const completionResult = normalizeCompletionResult(input.completionResult);
  const sourceChecksum = input.manifest.original.checksum;
  const storedObject = completionResult?.storedObject;

  if (storedObject && storedObject.sizeBytes !== input.manifest.original.sizeBytes) {
    throw integrityMismatch("Stored object size does not match the source size.");
  }

  if (
    sourceChecksum &&
    storedObject?.checksum &&
    storedObject.checksum.algorithm === sourceChecksum.algorithm &&
    storedObject.checksum.value.toLowerCase() !== sourceChecksum.value.toLowerCase()
  ) {
    throw integrityMismatch("Stored object checksum does not match the source checksum.");
  }

  const verified = Boolean(
    sourceChecksum &&
    storedObject?.checksum &&
    storedObject.sizeBytes === input.manifest.original.sizeBytes &&
    storedObject.checksum.algorithm === sourceChecksum.algorithm &&
    storedObject.checksum.value.toLowerCase() === sourceChecksum.value.toLowerCase()
  );
  const receiptDigest = await createReceiptSetDigest(input.receipts);
  const evidence: IngestCompletionEvidence = {
    schemaVersion: COMPLETION_SCHEMA_VERSION,
    id: input.id ?? `completion_${input.manifest.id}`,
    createdAt,
    completedAt: completionResult?.completedAt ?? createdAt,
    producer: {
      name: "large-image-ingest",
      version: LARGE_IMAGE_INGEST_VERSION
    },
    manifest: {
      id: input.manifest.id,
      schemaVersion: input.manifest.schemaVersion
    },
    source: {
      sizeBytes: input.manifest.original.sizeBytes
    },
    status: verified ? "verified" : "completed-unverified",
    upload: {
      transportName: input.transportName,
      totalBytes: input.manifest.original.sizeBytes,
      totalChunks: input.manifest.chunking.totalChunks,
      acknowledgedChunks: input.receipts.length,
      receiptDigest
    }
  };

  if (sourceChecksum) {
    evidence.source.checksum = cloneFileChecksum(sourceChecksum);
  }

  const storage = completionResult?.storage ?? input.manifest.storage;
  if (storage) {
    evidence.storage = structuredClone(storage);
  }

  if (verified && sourceChecksum && storedObject?.checksum) {
    evidence.verification = {
      verifiedAt: createdAt,
      sourceChecksum: cloneFileChecksum(sourceChecksum),
      storedChecksum: { ...storedObject.checksum },
      storedSizeBytes: storedObject.sizeBytes
    };
  }

  const validation = validateCompletionEvidence(evidence);
  if (!validation.ok) {
    throw new CompletionEvidenceError(
      validation.issues[0]?.code ?? "completion.evidence_invalid",
      validation.issues[0]?.message ?? "Completion evidence is invalid."
    );
  }

  return validation.evidence;
}

export async function createReceiptSetDigest(
  receipts: readonly UploadChunkReceipt[]
): Promise<ReceiptSetDigest> {
  const normalized = receipts
    .slice()
    .sort((left, right) => left.chunkIndex - right.chunkIndex)
    .map((receipt) => [
      receipt.chunkIndex,
      receipt.sizeBytes,
      receipt.checksum?.algorithm ?? null,
      receipt.checksum?.value.toLowerCase() ?? null,
      receipt.transport.name,
      receipt.transport.partNumber ?? null,
      receipt.transport.etag ?? null,
      receipt.transport.offset ?? null
    ]);
  const blob = new Blob([JSON.stringify(normalized)], { type: "application/json" }) as Blob & {
    name: string;
  };
  Object.defineProperty(blob, "name", { value: "receipt-set.json" });
  const checksum = await calculateChecksum(blob);
  return { algorithm: "sha256", value: checksum.value };
}

export function validateCompletionEvidence(value: unknown): CompletionEvidenceValidationResult {
  const issue = findCompletionEvidenceIssue(value);
  if (issue) {
    return { ok: false, issues: [issue] };
  }

  try {
    return {
      ok: true,
      issues: [],
      evidence: deepFreeze(structuredClone(value) as IngestCompletionEvidence)
    };
  } catch {
    return {
      ok: false,
      issues: [invalidEvidence("Completion evidence must contain cloneable data.", "evidence")]
    };
  }
}

export function parseCompletionEvidence(value: unknown): IngestCompletionEvidence {
  const result = validateCompletionEvidence(value);
  if (result.ok) {
    return result.evidence;
  }

  const issue = result.issues[0] ?? invalidEvidence("Completion evidence is invalid.", "evidence");
  throw new CompletionEvidenceError(issue.code, issue.message);
}

export function cloneCompletionEvidence(
  evidence: IngestCompletionEvidence
): IngestCompletionEvidence {
  return parseCompletionEvidence(evidence);
}

function normalizeCompletionResult(
  value: UploadCompletionResult | undefined
): UploadCompletionResult | undefined {
  if (!value) {
    return undefined;
  }

  if (value.completedAt !== undefined && !isIsoTimestamp(value.completedAt)) {
    throw new CompletionEvidenceError(
      "completion.evidence_invalid",
      "Transport completion time must be an ISO timestamp."
    );
  }

  if (value.storage !== undefined && !isStorageTarget(value.storage)) {
    throw new CompletionEvidenceError(
      "completion.evidence_invalid",
      "Transport completion storage reference is invalid."
    );
  }

  if (value.storedObject !== undefined) {
    if (!isNonNegativeSafeInteger(value.storedObject.sizeBytes)) {
      throw new CompletionEvidenceError(
        "completion.evidence_invalid",
        "Stored object size must be a non-negative safe integer."
      );
    }
    if (value.storedObject.checksum !== undefined && !isChecksumReceipt(value.storedObject.checksum)) {
      throw new CompletionEvidenceError(
        "completion.evidence_invalid",
        "Stored object checksum is invalid."
      );
    }
  }

  return structuredClone(value);
}

function findCompletionEvidenceIssue(
  value: unknown
): CompletionEvidenceValidationIssue | undefined {
  if (!isRecord(value)) {
    return invalidEvidence("Completion evidence must be an object.", "evidence");
  }
  if (value.schemaVersion !== COMPLETION_SCHEMA_VERSION) {
    return {
      code: "completion.schema_unsupported",
      message: "Completion evidence schema version is not supported.",
      path: "schemaVersion"
    };
  }
  if (!isNonEmptyString(value.id)) return invalidEvidence("Completion evidence id is required.", "id");
  if (!isIsoTimestamp(value.createdAt)) return invalidEvidence("Completion evidence creation time is invalid.", "createdAt");
  if (!isIsoTimestamp(value.completedAt)) return invalidEvidence("Completion time is invalid.", "completedAt");
  if (
    !isRecord(value.producer) ||
    value.producer.name !== "large-image-ingest" ||
    !isNonEmptyString(value.producer.version)
  ) return invalidEvidence("Completion evidence producer is invalid.", "producer");
  if (
    !isRecord(value.manifest) ||
    !isNonEmptyString(value.manifest.id) ||
    value.manifest.schemaVersion !== "large-image-ingest.manifest.v1"
  ) return invalidEvidence("Completion evidence manifest identity is invalid.", "manifest");
  if (!isRecord(value.source) || !isNonNegativeSafeInteger(value.source.sizeBytes)) {
    return invalidEvidence("Completion evidence source identity is invalid.", "source");
  }
  if (value.source.checksum !== undefined && !isFileChecksum(value.source.checksum)) {
    return invalidEvidence("Completion evidence source checksum is invalid.", "source.checksum");
  }
  if (value.status !== "verified" && value.status !== "completed-unverified") {
    return invalidEvidence("Completion evidence status is invalid.", "status");
  }
  if (!isRecord(value.upload)) return invalidEvidence("Completion upload summary is invalid.", "upload");
  if (!isNonEmptyString(value.upload.transportName)) {
    return invalidEvidence("Completion transport name is required.", "upload.transportName");
  }
  const totalBytes = value.upload.totalBytes;
  const totalChunks = value.upload.totalChunks;
  const acknowledgedChunks = value.upload.acknowledgedChunks;
  if (!isNonNegativeSafeInteger(totalBytes)) {
    return invalidEvidence("Completion upload totalBytes is invalid.", "upload.totalBytes");
  }
  if (!isNonNegativeSafeInteger(totalChunks)) {
    return invalidEvidence("Completion upload totalChunks is invalid.", "upload.totalChunks");
  }
  if (!isNonNegativeSafeInteger(acknowledgedChunks)) {
    return invalidEvidence("Completion upload acknowledgedChunks is invalid.", "upload.acknowledgedChunks");
  }
  if (
    totalBytes !== value.source.sizeBytes ||
    acknowledgedChunks > totalChunks
  ) return invalidEvidence("Completion upload counts are inconsistent.", "upload");
  if (
    !isRecord(value.upload.receiptDigest) ||
    value.upload.receiptDigest.algorithm !== "sha256" ||
    !isSha256Hex(value.upload.receiptDigest.value)
  ) return invalidEvidence("Completion receipt digest is invalid.", "upload.receiptDigest");
  if (value.storage !== undefined && !isStorageTarget(value.storage)) {
    return invalidEvidence("Completion storage reference is invalid.", "storage");
  }

  if (value.status === "verified") {
    if (!isRecord(value.verification)) {
      return invalidEvidence("Verified completion requires verification details.", "verification");
    }
    if (
      !isIsoTimestamp(value.verification.verifiedAt) ||
      !isFileChecksum(value.verification.sourceChecksum) ||
      !isChecksumReceipt(value.verification.storedChecksum) ||
      !isNonNegativeSafeInteger(value.verification.storedSizeBytes) ||
      !isFileChecksum(value.source.checksum)
    ) return invalidEvidence("Verified completion details are invalid.", "verification");
    if (
      value.verification.storedSizeBytes !== value.source.sizeBytes ||
      value.verification.sourceChecksum.value.toLowerCase() !== value.source.checksum.value.toLowerCase() ||
      value.verification.storedChecksum.algorithm !== value.source.checksum.algorithm ||
      value.verification.storedChecksum.value.toLowerCase() !== value.source.checksum.value.toLowerCase()
    ) return invalidEvidence("Verified completion identities are inconsistent.", "verification");
  } else if (value.verification !== undefined) {
    return invalidEvidence("Unverified completion must not include verification details.", "verification");
  }

  return undefined;
}

function integrityMismatch(message: string): CompletionEvidenceError {
  return new CompletionEvidenceError("completion.integrity_mismatch", message);
}

function invalidEvidence(message: string, path: string): CompletionEvidenceValidationIssue {
  return { code: "completion.evidence_invalid", message, path };
}

function cloneFileChecksum(checksum: FileChecksum): FileChecksum {
  return { ...checksum };
}

function isFileChecksum(value: unknown): value is FileChecksum {
  return Boolean(
    isRecord(value) &&
    value.algorithm === "sha256" &&
    value.scope === "whole-file" &&
    isSha256Hex(value.value) &&
    isIsoTimestamp(value.calculatedAt) &&
    isPositiveSafeInteger(value.chunkSizeBytes)
  );
}

function isChecksumReceipt(value: unknown): value is ChecksumReceipt {
  if (!isRecord(value) || !isNonEmptyString(value.algorithm) || !isNonEmptyString(value.value)) {
    return false;
  }
  return value.algorithm !== "sha256" || isSha256Hex(value.value);
}

function isStorageTarget(value: unknown): value is StorageTargetManifest {
  return Boolean(
    isRecord(value) &&
    ["s3", "tus", "nas", "filesystem", "custom"].includes(String(value.kind)) &&
    (value.label === undefined || typeof value.label === "string") &&
    (value.locationHint === undefined || typeof value.locationHint === "string")
  );
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

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}
