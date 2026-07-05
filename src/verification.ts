import { calculateChecksum } from "./checksum.js";
import { planChunks } from "./chunks.js";
import type {
  FileChecksum,
  IngestFileLike,
  IngestIssue,
  IngestIssueCode,
  IngestManifest,
  UploadChunkReceipt,
  VerificationChecksumPolicy,
  VerificationResult,
  VerifyIngestIntegrityOptions,
  VerifyManifestOptions,
  VerifyUploadReceiptsOptions
} from "./types.js";

const SUPPORTED_MANIFEST_SCHEMA_VERSION = "large-image-ingest.manifest.v1";
const DEFAULT_CHECKSUM_POLICY: VerificationChecksumPolicy = "when-present";

export async function verifyManifest(
  manifest: IngestManifest,
  options: VerifyManifestOptions = {}
): Promise<VerificationResult> {
  const issues: IngestIssue[] = [];
  const manifestIssues = verifyManifestStructure(manifest);
  issues.push(...manifestIssues);

  if (!isRecord(manifest)) {
    return toResult(issues);
  }

  const original = isRecord(manifest.original) ? manifest.original : undefined;
  const file = options.file;

  if (original && file) {
    verifyFileIdentity(issues, original, file);
  }

  await verifyManifestChecksum(issues, original, file, options);
  return toResult(issues);
}

export function verifyUploadReceipts(
  manifest: IngestManifest,
  receipts: readonly UploadChunkReceipt[],
  options: VerifyUploadReceiptsOptions = {}
): VerificationResult {
  const issues: IngestIssue[] = [];

  if (!isRecord(manifest) || !isRecord(manifest.original) || !isRecord(manifest.chunking)) {
    pushIssue(
      issues,
      "verification.manifest_invalid",
      "Manifest is missing original or chunking information required for receipt verification.",
      "manifest"
    );
    return toResult(issues);
  }

  const totalBytes = manifest.original.sizeBytes;
  const chunkSizeBytes = manifest.chunking.chunkSizeBytes;
  const totalChunks = manifest.chunking.totalChunks;

  if (!isNonNegativeSafeInteger(totalBytes) || !isPositiveSafeInteger(chunkSizeBytes) || !isNonNegativeSafeInteger(totalChunks)) {
    pushIssue(
      issues,
      "verification.manifest_invalid",
      "Manifest chunking fields must be safe non-negative integers.",
      "chunking"
    );
    return toResult(issues);
  }

  const expectedTransportName = options.expectedTransportName ?? (
    isRecord(manifest.upload) && isRecord(manifest.upload.transport)
      ? typeof manifest.upload.transport.name === "string" ? manifest.upload.transport.name : undefined
      : undefined
  );
  const seen = new Map<number, UploadChunkReceipt>();
  let uploadedBytes = 0;

  for (let receiptPosition = 0; receiptPosition < receipts.length; receiptPosition += 1) {
    const receipt = receipts[receiptPosition];
    const path = `receipts[${receiptPosition}]`;

    if (!receipt || !isNonNegativeSafeInteger(receipt.chunkIndex)) {
      pushIssue(
        issues,
        "verification.receipt_invalid",
        "Receipt chunk index must be a non-negative safe integer.",
        `${path}.chunkIndex`
      );
      continue;
    }

    if (receipt.chunkIndex >= totalChunks) {
      pushIssue(
        issues,
        "verification.receipt_invalid",
        "Receipt references a chunk outside the manifest chunk plan.",
        `${path}.chunkIndex`,
        { chunkIndex: receipt.chunkIndex, totalChunks }
      );
      continue;
    }

    if (seen.has(receipt.chunkIndex)) {
      pushIssue(
        issues,
        "verification.receipt_duplicate",
        "Receipt set contains more than one successful receipt for a chunk.",
        `${path}.chunkIndex`,
        { chunkIndex: receipt.chunkIndex }
      );
      continue;
    }

    if (!isNonNegativeSafeInteger(receipt.sizeBytes)) {
      pushIssue(
        issues,
        "verification.receipt_invalid",
        "Receipt size must be a non-negative safe integer.",
        `${path}.sizeBytes`,
        { chunkIndex: receipt.chunkIndex }
      );
      continue;
    }

    const expectedSize = expectedChunkSize(totalBytes, chunkSizeBytes, receipt.chunkIndex);
    if (receipt.sizeBytes !== expectedSize) {
      pushIssue(
        issues,
        "verification.receipt_invalid",
        "Receipt size does not match the manifest chunk plan.",
        `${path}.sizeBytes`,
        { chunkIndex: receipt.chunkIndex, expectedSizeBytes: expectedSize, actualSizeBytes: receipt.sizeBytes }
      );
    }

    const actualTransportName = isRecord(receipt.transport) && typeof receipt.transport.name === "string"
      ? receipt.transport.name
      : undefined;

    if (!actualTransportName) {
      pushIssue(
        issues,
        "verification.receipt_invalid",
        "Receipt transport name is required.",
        `${path}.transport.name`,
        { chunkIndex: receipt.chunkIndex }
      );
    } else if (expectedTransportName && actualTransportName !== expectedTransportName) {
      pushIssue(
        issues,
        "verification.transport_mismatch",
        "Receipt transport name does not match the expected transport.",
        `${path}.transport.name`,
        { chunkIndex: receipt.chunkIndex, expectedTransportName, actualTransportName }
      );
    }

    if (options.requireChunkChecksums && !receipt.checksum) {
      pushIssue(
        issues,
        "verification.checksum_missing",
        "Receipt is missing a required chunk checksum.",
        `${path}.checksum`,
        { chunkIndex: receipt.chunkIndex }
      );
    }

    seen.set(receipt.chunkIndex, receipt);
    uploadedBytes += receipt.sizeBytes;
  }

  if (!options.allowPartial) {
    const missingChunkIndexes: number[] = [];

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      if (!seen.has(chunkIndex)) {
        missingChunkIndexes.push(chunkIndex);
      }
    }

    if (missingChunkIndexes.length > 0) {
      pushIssue(
        issues,
        "verification.receipt_missing",
        "Receipt set is missing one or more expected chunks.",
        "receipts",
        {
          missingCount: missingChunkIndexes.length,
          missingChunkIndexes: missingChunkIndexes.slice(0, 10)
        }
      );
    }

    if (uploadedBytes !== totalBytes) {
      pushIssue(
        issues,
        "verification.receipt_incomplete",
        "Receipt byte total does not match the manifest original size.",
        "receipts",
        { expectedTotalBytes: totalBytes, actualTotalBytes: uploadedBytes }
      );
    }
  }

  return toResult(issues);
}

export async function verifyIngestIntegrity(
  options: VerifyIngestIntegrityOptions
): Promise<VerificationResult> {
  const issues: IngestIssue[] = [];
  const manifestOptions: VerifyManifestOptions = {};

  if (options.checksum !== undefined) {
    manifestOptions.checksum = options.checksum;
  }

  if (options.checksumChunkSize !== undefined) {
    manifestOptions.checksumChunkSize = options.checksumChunkSize;
  }

  if (options.file !== undefined) {
    manifestOptions.file = options.file;
  }

  const manifestResult = await verifyManifest(options.manifest, manifestOptions);
  issues.push(...manifestResult.issues);

  if (options.receipts !== undefined && options.receiptVerification !== false) {
    const receiptResult = verifyUploadReceipts(
      options.manifest,
      options.receipts,
      options.receiptVerification ?? {}
    );
    issues.push(...receiptResult.issues);
  }

  return toResult(issues);
}

function verifyManifestStructure(manifest: IngestManifest): IngestIssue[] {
  const issues: IngestIssue[] = [];

  if (!isRecord(manifest)) {
    pushIssue(
      issues,
      "verification.manifest_invalid",
      "Manifest must be an object.",
      "manifest"
    );
    return issues;
  }

  if (manifest.schemaVersion !== SUPPORTED_MANIFEST_SCHEMA_VERSION) {
    pushIssue(
      issues,
      "verification.manifest_schema_unsupported",
      "Manifest schema version is not supported.",
      "schemaVersion",
      { schemaVersion: manifest.schemaVersion }
    );
  }

  if (!isRecord(manifest.original)) {
    pushIssue(
      issues,
      "verification.manifest_invalid",
      "Manifest original entry is required.",
      "original"
    );
    return issues;
  }

  const original = manifest.original;
  if (original.kind !== "original") {
    pushIssue(
      issues,
      "verification.manifest_invalid",
      "Manifest original entry must have kind 'original'.",
      "original.kind"
    );
  }

  if (!isNonEmptyString(original.name)) {
    pushIssue(
      issues,
      "verification.manifest_invalid",
      "Manifest original name is required.",
      "original.name"
    );
  }

  if (!isNonNegativeSafeInteger(original.sizeBytes)) {
    pushIssue(
      issues,
      "verification.manifest_invalid",
      "Manifest original size must be a non-negative safe integer.",
      "original.sizeBytes"
    );
  }

  if (!isNonEmptyString(original.mediaType)) {
    pushIssue(
      issues,
      "verification.manifest_invalid",
      "Manifest original media type is required.",
      "original.mediaType"
    );
  }

  if (original.preservation?.required !== true || !Array.isArray(original.preservation.allowedMutations) || original.preservation.allowedMutations.length > 0) {
    pushIssue(
      issues,
      "verification.manifest_invalid",
      "Manifest original preservation policy must require no mutations.",
      "original.preservation"
    );
  }

  if (original.checksum !== undefined && !isFileChecksum(original.checksum)) {
    pushIssue(
      issues,
      "verification.manifest_invalid",
      "Manifest original checksum must be a whole-file checksum with string algorithm and value.",
      "original.checksum"
    );
  }

  if (!isRecord(manifest.chunking)) {
    pushIssue(
      issues,
      "verification.manifest_invalid",
      "Manifest chunking entry is required.",
      "chunking"
    );
    return issues;
  }

  const chunking = manifest.chunking;
  if (chunking.strategy !== "fixed-size") {
    pushIssue(
      issues,
      "verification.manifest_invalid",
      "Manifest chunking strategy must be fixed-size.",
      "chunking.strategy"
    );
  }

  if (chunking.chunkRangesIncluded !== false) {
    pushIssue(
      issues,
      "verification.manifest_invalid",
      "Manifest must not inline chunk ranges.",
      "chunking.chunkRangesIncluded"
    );
  }

  if (chunking.totalBytes !== original.sizeBytes) {
    pushIssue(
      issues,
      "verification.manifest_invalid",
      "Manifest chunking total bytes must match original size.",
      "chunking.totalBytes",
      { originalSizeBytes: original.sizeBytes, chunkingTotalBytes: chunking.totalBytes }
    );
  }

  if (isNonNegativeSafeInteger(original.sizeBytes) && isPositiveSafeInteger(chunking.chunkSizeBytes)) {
    try {
      const chunkPlan = planChunks(original.sizeBytes, { chunkSize: chunking.chunkSizeBytes });
      if (chunking.totalChunks !== chunkPlan.totalChunks) {
        pushIssue(
          issues,
          "verification.manifest_invalid",
          "Manifest total chunk count does not match the chunk size and original size.",
          "chunking.totalChunks",
          { expectedTotalChunks: chunkPlan.totalChunks, actualTotalChunks: chunking.totalChunks }
        );
      }
    } catch (error) {
      pushIssue(
        issues,
        "verification.manifest_invalid",
        error instanceof Error ? error.message : "Manifest chunking configuration is invalid.",
        "chunking"
      );
    }
  }

  if (!manifest.validation?.ok) {
    pushIssue(
      issues,
      "verification.manifest_invalid",
      "Manifest validation state is not ok.",
      "validation.ok"
    );
  }

  return issues;
}

function verifyFileIdentity(
  issues: IngestIssue[],
  original: Record<string, unknown>,
  file: IngestFileLike
): void {
  if (original.name !== file.name) {
    pushIssue(
      issues,
      "verification.original_mismatch",
      "File name does not match the manifest original name.",
      "original.name",
      { expectedName: original.name, actualName: file.name }
    );
  }

  if (original.sizeBytes !== file.size) {
    pushIssue(
      issues,
      "verification.original_mismatch",
      "File size does not match the manifest original size.",
      "original.sizeBytes",
      { expectedSizeBytes: original.sizeBytes, actualSizeBytes: file.size }
    );
  }

  const expectedMediaType = original.mediaType === "" ? "application/octet-stream" : original.mediaType;
  const actualMediaType = file.type || "application/octet-stream";
  if (expectedMediaType !== actualMediaType) {
    pushIssue(
      issues,
      "verification.original_mismatch",
      "File media type does not match the manifest original media type.",
      "original.mediaType",
      { expectedMediaType, actualMediaType }
    );
  }

  if (typeof original.lastModifiedAt === "string" && file.lastModified !== undefined) {
    const actualLastModifiedAt = new Date(file.lastModified).toISOString();

    if (original.lastModifiedAt !== actualLastModifiedAt) {
      pushIssue(
        issues,
        "verification.original_mismatch",
        "File last modified timestamp does not match the manifest original timestamp.",
        "original.lastModifiedAt",
        { expectedLastModifiedAt: original.lastModifiedAt, actualLastModifiedAt }
      );
    }
  }
}

async function verifyManifestChecksum(
  issues: IngestIssue[],
  original: Record<string, unknown> | undefined,
  file: IngestFileLike | undefined,
  options: VerifyManifestOptions
): Promise<void> {
  const policy = options.checksum ?? DEFAULT_CHECKSUM_POLICY;

  if (policy === false || !original) {
    return;
  }

  const expectedChecksum = isFileChecksum(original.checksum) ? original.checksum : undefined;

  if (!expectedChecksum) {
    if (policy === "required") {
      pushIssue(
        issues,
        "verification.checksum_missing",
        "Manifest original checksum is required for verification.",
        "original.checksum"
      );
    }

    return;
  }

  if (expectedChecksum.algorithm !== "sha256") {
    pushIssue(
      issues,
      "verification.checksum_unsupported",
      "Only SHA-256 whole-file checksums are supported for verification.",
      "original.checksum.algorithm",
      { algorithm: expectedChecksum.algorithm }
    );
    return;
  }

  if (!file) {
    return;
  }

  const checksumOptions = options.checksumChunkSize === undefined
    ? { algorithm: "sha256" as const }
    : { algorithm: "sha256" as const, chunkSize: options.checksumChunkSize };
  const actualChecksum = await calculateChecksum(file, checksumOptions);

  if (!checksumsEqual(expectedChecksum, actualChecksum)) {
    pushIssue(
      issues,
      "verification.checksum_mismatch",
      "File checksum does not match the manifest original checksum.",
      "original.checksum.value",
      {
        algorithm: expectedChecksum.algorithm,
        expected: expectedChecksum.value,
        actual: actualChecksum.value
      }
    );
  }
}

function expectedChunkSize(totalBytes: number, chunkSizeBytes: number, chunkIndex: number): number {
  const start = chunkIndex * chunkSizeBytes;
  const end = Math.min(start + chunkSizeBytes, totalBytes);
  return end - start;
}

function isFileChecksum(value: unknown): value is FileChecksum {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Partial<FileChecksum>).algorithm === "string" &&
      typeof (value as Partial<FileChecksum>).value === "string" &&
      (value as Partial<FileChecksum>).scope === "whole-file"
  );
}

function checksumsEqual(left: FileChecksum, right: FileChecksum): boolean {
  return left.algorithm === right.algorithm && left.value.toLowerCase() === right.value.toLowerCase();
}

function toResult(issues: IngestIssue[]): VerificationResult {
  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}

function pushIssue(
  issues: IngestIssue[],
  code: IngestIssueCode,
  message: string,
  path?: string,
  details?: Record<string, unknown>
): void {
  const issue: IngestIssue = {
    code,
    message,
    severity: "error"
  };

  if (path !== undefined) {
    issue.path = path;
  }

  if (details !== undefined) {
    issue.details = details;
  }

  issues.push(issue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value > 0;
}
