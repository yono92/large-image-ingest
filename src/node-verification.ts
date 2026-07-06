import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { PathLike } from "node:fs";
import { verifyManifest } from "./verification.js";
import type {
  ChecksumOptions,
  FileChecksum,
  IngestIssue,
  IngestIssueCode,
  IngestManifest,
  VerificationChecksumPolicy,
  VerificationResult
} from "./types.js";

const DEFAULT_NODE_CHECKSUM_CHUNK_SIZE = 4 * 1024 * 1024;
const MIN_NODE_CHECKSUM_CHUNK_SIZE = 64 * 1024;
const DEFAULT_CHECKSUM_POLICY: VerificationChecksumPolicy = "when-present";

export type NodeChecksumOptions = Pick<
  ChecksumOptions,
  "algorithm" | "chunkSize" | "onProgress"
>;

export interface VerifyNodeFileManifestOptions {
  checksum?: VerificationChecksumPolicy;
  checksumChunkSize?: number;
}

export async function calculateNodeFileChecksum(
  filePath: PathLike,
  options: NodeChecksumOptions = {}
): Promise<FileChecksum> {
  const algorithm = options.algorithm ?? "sha256";
  if (algorithm !== "sha256") {
    throw new RangeError(`Unsupported checksum algorithm: ${algorithm}`);
  }

  const chunkSize = options.chunkSize ?? DEFAULT_NODE_CHECKSUM_CHUNK_SIZE;
  if (!Number.isSafeInteger(chunkSize) || chunkSize < MIN_NODE_CHECKSUM_CHUNK_SIZE) {
    throw new RangeError(`checksum chunkSize must be at least ${MIN_NODE_CHECKSUM_CHUNK_SIZE} bytes.`);
  }

  const info = await stat(filePath);
  const totalBytes = info.size;
  const totalChunks = totalBytes === 0 ? 0 : Math.ceil(totalBytes / chunkSize);
  const hash = createHash("sha256");
  let loadedBytes = 0;
  let chunkIndex = 0;

  for await (const chunk of createReadStream(filePath, { highWaterMark: chunkSize })) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    hash.update(bytes);
    loadedBytes += bytes.byteLength;
    options.onProgress?.({
      loadedBytes,
      totalBytes,
      chunkIndex,
      totalChunks
    });
    chunkIndex += 1;
  }

  return {
    algorithm,
    calculatedAt: new Date().toISOString(),
    chunkSizeBytes: chunkSize,
    scope: "whole-file",
    value: hash.digest("hex")
  };
}

export async function verifyNodeFileManifest(
  filePath: PathLike,
  manifest: IngestManifest,
  options: VerifyNodeFileManifestOptions = {}
): Promise<VerificationResult> {
  const issues: IngestIssue[] = [];
  const manifestResult = await verifyManifest(manifest, { checksum: false });
  issues.push(...manifestResult.issues);

  let fileSize: number;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      pushIssue(
        issues,
        "verification.file_unreadable",
        "Verification target is not a regular file.",
        "file"
      );
      return toResult(issues);
    }

    fileSize = info.size;
  } catch (error) {
    pushIssue(
      issues,
      isNodeError(error, "ENOENT") ? "verification.file_not_found" : "verification.file_unreadable",
      isNodeError(error, "ENOENT")
        ? "Verification target file was not found."
        : "Verification target file could not be read.",
      "file"
    );
    return toResult(issues);
  }

  if (!isRecord(manifest) || !isRecord(manifest.original)) {
    return toResult(issues);
  }

  if (fileSize !== manifest.original.sizeBytes) {
    pushIssue(
      issues,
      "verification.original_mismatch",
      "Stored file size does not match the manifest original size.",
      "original.sizeBytes",
      { expectedSizeBytes: manifest.original.sizeBytes, actualSizeBytes: fileSize }
    );
    return toResult(issues);
  }

  const policy = options.checksum ?? DEFAULT_CHECKSUM_POLICY;
  if (policy === false) {
    return toResult(issues);
  }

  const expectedChecksum = manifest.original.checksum;
  if (!expectedChecksum) {
    if (policy === "required") {
      pushIssue(
        issues,
        "verification.checksum_missing",
        "Manifest original checksum is required for stored-file verification.",
        "original.checksum"
      );
    }

    return toResult(issues);
  }

  if (expectedChecksum.algorithm !== "sha256") {
    pushIssue(
      issues,
      "verification.checksum_unsupported",
      "Only SHA-256 whole-file checksums are supported for stored-file verification.",
      "original.checksum.algorithm",
      { algorithm: expectedChecksum.algorithm }
    );
    return toResult(issues);
  }

  try {
    const checksumOptions: NodeChecksumOptions = options.checksumChunkSize === undefined
      ? { algorithm: "sha256" }
      : { algorithm: "sha256", chunkSize: options.checksumChunkSize };
    const actualChecksum = await calculateNodeFileChecksum(filePath, checksumOptions);

    if (actualChecksum.value.toLowerCase() !== expectedChecksum.value.toLowerCase()) {
      pushIssue(
        issues,
        "verification.checksum_mismatch",
        "Stored file checksum does not match the manifest original checksum.",
        "original.checksum.value",
        {
          algorithm: expectedChecksum.algorithm,
          expected: expectedChecksum.value,
          actual: actualChecksum.value
        }
      );
    }
  } catch (error) {
    pushIssue(
      issues,
      "verification.file_unreadable",
      error instanceof Error ? error.message : "Verification target file could not be read.",
      "file"
    );
  }

  return toResult(issues);
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

function isNodeError(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === code);
}
