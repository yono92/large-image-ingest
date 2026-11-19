import { checksumValuesEqual } from "./checksum.js";
import type {
  IngestIssue,
  IngestManifest,
  UploadChunkReceipt,
  VerificationResult,
  VerifyIngestIntegrityOptions,
  VerifyManifestOptions,
  VerifyUploadReceiptsOptions
} from "./types.js";
import { expectedChunkSize, isNonEmptyString, isNonNegativeSafeInteger, isPositiveSafeInteger, isRecord, pushIssue, toResult, verifyFileIdentity, verifyManifestChecksum, verifyManifestStructure } from "./verification-checks.js";

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

    if (receipt.integrity) {
      verifyChunkIntegrityEvidence(issues, manifest, receipt, path, expectedSize);
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

function verifyChunkIntegrityEvidence(
  issues: IngestIssue[],
  manifest: IngestManifest,
  receipt: UploadChunkReceipt,
  path: string,
  expectedSize: number
): void {
  const integrity = receipt.integrity;
  if (!integrity) return;
  const binding = integrity.binding;
  const expectedStart = receipt.chunkIndex * manifest.chunking.chunkSizeBytes;
  if (
    !isNonEmptyString(integrity.policyId) ||
    !isNonEmptyString(binding.uploadId) ||
    !isNonEmptyString(binding.sourceIdentity) ||
    binding.manifestId !== manifest.id ||
    (manifest.original.checksum !== undefined && binding.sourceIdentity !== manifest.original.checksum.value) ||
    binding.chunkIndex !== receipt.chunkIndex ||
    binding.startByte !== expectedStart ||
    binding.endByteExclusive !== expectedStart + expectedSize ||
    binding.sizeBytes !== expectedSize
  ) {
    pushIssue(
      issues,
      "verification.receipt_invalid",
      "Chunk integrity evidence is bound to a different source or byte range.",
      `${path}.integrity.binding`,
      { chunkIndex: receipt.chunkIndex }
    );
  }
  if (
    integrity.local.role !== "local-calculation" ||
    integrity.local.algorithm !== "sha256" ||
    !isSupportedChecksumEncoding(integrity.local.encoding)
  ) {
    pushIssue(
      issues,
      "verification.checksum_unsupported",
      "Chunk local checksum evidence uses an unsupported algorithm, encoding, or role.",
      `${path}.integrity.local`,
      { chunkIndex: receipt.chunkIndex }
    );
    return;
  }
  if (integrity.remote) {
    if (
      integrity.remote.role !== "remote-attestation" ||
      integrity.remote.algorithm !== "sha256" ||
      !isSupportedChecksumEncoding(integrity.remote.encoding)
    ) {
      pushIssue(
        issues,
        "verification.checksum_unsupported",
        "Chunk remote checksum evidence uses an unsupported algorithm, encoding, or role.",
        `${path}.integrity.remote`,
        { chunkIndex: receipt.chunkIndex }
      );
      return;
    }
    try {
      if (!checksumValuesEqual(integrity.local, integrity.remote)) {
        pushIssue(
          issues,
          "verification.checksum_mismatch",
          "Chunk local checksum and remote attestation do not match.",
          `${path}.integrity.remote.value`,
          { chunkIndex: receipt.chunkIndex }
        );
      }
    } catch {
      pushIssue(
        issues,
        "verification.checksum_mismatch",
        "Chunk checksum evidence is malformed.",
        `${path}.integrity`,
        { chunkIndex: receipt.chunkIndex }
      );
    }
  }
}

function isSupportedChecksumEncoding(value: unknown): value is "hex" | "base64" {
  return value === "hex" || value === "base64";
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
