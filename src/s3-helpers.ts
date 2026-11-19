// Part of s3.ts, split out to keep modules under 500 lines; public exports stay on s3.ts.
import type {
  ChunkDescriptor,
  ChecksumReceipt,
  IngestError,
  IngestIssueCode,
  UploadChunkReceipt
} from "./types.js";
import type { S3CompletedPart, S3CompletedPartChecksum } from "./s3.js";
import { DEFAULT_MAX_PART_COUNT } from "./s3-shared.js";

export function getPersistedRemoteState(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value || typeof value.key !== "string" || value.key.length === 0) {
    throw createS3Error(
      "transport.resume_failed",
      "Persisted S3 multipart state is missing a trusted object key.",
      false
    );
  }

  const remote: Record<string, unknown> = { key: value.key };
  if (typeof value.bucket === "string") {
    remote.bucket = value.bucket;
  }
  if (isRecord(value.metadata)) {
    remote.metadata = value.metadata;
  }
  return remote;
}

export function partNumberForChunk(chunk: ChunkDescriptor): number {
  const partNumber = chunk.index + 1;

  if (partNumber < 1 || partNumber > DEFAULT_MAX_PART_COUNT) {
    throw createS3Error(
      "transport.part_rejected",
      "S3 multipart part number is outside the allowed 1 to 10000 range.",
      false,
      {
        chunkIndex: chunk.index,
        partNumber
      }
    );
  }

  return partNumber;
}

export function receiptToCompletedPart(receipt: UploadChunkReceipt): S3CompletedPart {
  const { partNumber, etag } = receipt.transport;

  if (!partNumber || !etag) {
    throw createS3Error(
      "transport.receipt_invalid",
      "S3 multipart completion requires each receipt to include partNumber and ETag.",
      false,
      {
        chunkIndex: receipt.chunkIndex
      }
    );
  }

  const completedPart: S3CompletedPart = {
    partNumber,
    etag
  };
  const checksum = toS3CompletedChecksum(receipt.checksum);

  if (checksum) {
    completedPart.checksum = checksum;
  }

  return completedPart;
}

export function validateCompletedParts(parts: readonly S3CompletedPart[]): void {
  if (parts.length === 0) {
    throw createS3Error(
      "transport.receipt_missing",
      "Cannot complete S3 multipart upload without uploaded part receipts.",
      false
    );
  }

  for (let index = 0; index < parts.length; index += 1) {
    const expectedPartNumber = index + 1;
    const part = parts[index];

    if (!part || part.partNumber !== expectedPartNumber) {
      throw createS3Error(
        "transport.receipt_invalid",
        "S3 multipart completion requires consecutive part numbers beginning with 1.",
        false,
        {
          expectedPartNumber,
          actualPartNumber: part?.partNumber
        }
      );
    }
  }
}

export function readChecksum(response: Response): UploadChunkReceipt["checksum"] {
  const checksumHeaders = [
    ["sha256", "x-amz-checksum-sha256"],
    ["crc64nvme", "x-amz-checksum-crc64nvme"],
    ["crc32c", "x-amz-checksum-crc32c"],
    ["crc32", "x-amz-checksum-crc32"]
  ] as const;

  for (const [algorithm, header] of checksumHeaders) {
    const value = response.headers.get(header);

    if (value) {
      return { algorithm, value };
    }
  }

  return undefined;
}

function toS3CompletedChecksum(checksum: UploadChunkReceipt["checksum"]): S3CompletedPartChecksum | undefined {
  if (!checksum || !isS3CompletedPartChecksum(checksum)) {
    return undefined;
  }

  return checksum;
}

function isS3CompletedPartChecksum(checksum: ChecksumReceipt): checksum is S3CompletedPartChecksum {
  return ["sha256", "crc64nvme", "crc32c", "crc32"].includes(checksum.algorithm);
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function createS3Error(
  code: IngestIssueCode,
  message: string,
  retryable: boolean,
  details?: Record<string, unknown>
): IngestError {
  const error = new Error(message) as IngestError;
  error.code = code;
  error.retryable = retryable;

  if (details) {
    error.details = details;
  }

  return error;
}

export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return fallback;
}

export function nowIso(): string {
  return new Date().toISOString();
}
