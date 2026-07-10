import type {
  ChunkDescriptor,
  ChecksumReceipt,
  IngestError,
  IngestIssueCode,
  TransportSession,
  UploadChunkContext,
  UploadChunkReceipt,
  UploadSessionContext,
  UploadTransport
} from "./types.js";

const S3_TRANSPORT_NAME = "s3-multipart";
const DEFAULT_MIN_PART_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_PART_SIZE_BYTES = 5 * 1024 * 1024 * 1024;
const DEFAULT_MAX_PART_COUNT = 10_000;

export type S3MultipartFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface S3MultipartUploadHandle {
  uploadId: string;
  key: string;
  bucket?: string;
  createdAt?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface S3MultipartUploadTarget {
  url: string;
  headers?: HeadersInit;
  method?: "PUT";
}

export interface S3CompletedPart {
  partNumber: number;
  etag: string;
  checksum?: S3CompletedPartChecksum | undefined;
}

export type S3CompletedPartChecksum = ChecksumReceipt & {
  algorithm: "sha256" | "crc64nvme" | "crc32c" | "crc32";
};

export interface S3MultipartCreateContext extends UploadSessionContext {}

export interface S3MultipartPartContext extends UploadSessionContext {
  bucket?: string | undefined;
  chunk: ChunkDescriptor;
  key: string;
  partNumber: number;
  previousReceipts: readonly UploadChunkReceipt[];
  session: TransportSession;
  uploadId: string;
}

export interface S3MultipartCompleteContext extends UploadSessionContext {
  bucket?: string | undefined;
  key: string;
  parts: readonly S3CompletedPart[];
  receipts: readonly UploadChunkReceipt[];
  session: TransportSession;
  uploadId: string;
}

export interface S3MultipartAbortContext extends UploadSessionContext {
  bucket?: string | undefined;
  key: string;
  receipts: readonly UploadChunkReceipt[];
  session: TransportSession;
  uploadId: string;
}

export interface S3MultipartBroker {
  createMultipartUpload(context: S3MultipartCreateContext): Promise<S3MultipartUploadHandle>;
  getUploadPartUrl(context: S3MultipartPartContext): Promise<S3MultipartUploadTarget>;
  completeMultipartUpload(context: S3MultipartCompleteContext): Promise<void>;
  abortMultipartUpload?(context: S3MultipartAbortContext): Promise<void>;
}

export interface S3MultipartTransportOptions {
  broker: S3MultipartBroker;
  fetch?: S3MultipartFetch;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  maxPartCount?: number;
  maxPartSizeBytes?: number;
  minPartSizeBytes?: number;
  uploadIdPrefix?: string;
}

interface S3MultipartRemoteState {
  bucket?: string | undefined;
  key: string;
  metadata?: Record<string, unknown> | undefined;
}

export function createS3MultipartTransport(options: S3MultipartTransportOptions): UploadTransport {
  const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);

  if (!fetchImpl) {
    throw createS3Error(
      "transport.failed",
      "A fetch implementation is required for S3 multipart upload.",
      false
    );
  }

  const minPartSizeBytes = options.minPartSizeBytes ?? DEFAULT_MIN_PART_SIZE_BYTES;
  const maxPartSizeBytes = options.maxPartSizeBytes ?? DEFAULT_MAX_PART_SIZE_BYTES;
  const maxPartCount = options.maxPartCount ?? DEFAULT_MAX_PART_COUNT;
  const uploadIdPrefix = options.uploadIdPrefix ?? "s3";

  return {
    capabilities: {
      name: S3_TRANSPORT_NAME,
      resumable: true,
      abortable: Boolean(options.broker.abortMultipartUpload),
      expires: false,
      supportsParallelChunks: false,
      supportsChunkChecksum: true,
      supportsSnapshotResume: true,
      supportsPersistentResume: true,
      minChunkSizeBytes: minPartSizeBytes,
      minFinalChunkSizeBytes: 0,
      maxChunkSizeBytes: maxPartSizeBytes,
      maxChunkCount: maxPartCount,
      partNumberBase: 1
    },
    async createSession(context) {
      const handle = await options.broker.createMultipartUpload(context);
      validateUploadHandle(handle);

      return {
        uploadId: handle.uploadId || `${uploadIdPrefix}-${context.manifest.id}`,
        transportName: S3_TRANSPORT_NAME,
        createdAt: handle.createdAt ?? nowIso(),
        expiresAt: handle.expiresAt,
        remote: {
          bucket: handle.bucket,
          key: handle.key,
          metadata: handle.metadata
        }
      };
    },
    async resumeSession({ record, snapshot }) {
      if (snapshot) {
        const session = snapshot.transportSession;

        if (!session) {
          throw createS3Error(
            "transport.resume_failed",
            "Cannot resume S3 multipart upload because the snapshot has no transport session.",
            false
          );
        }

        getRemoteState(session);
        return session;
      }

      if (
        record.schemaVersion === "large-image-ingest.resume.v0.1" &&
        record.progress.completedChunkRanges.length > 0
      ) {
        throw createS3Error(
          "resume.receipt_missing",
          "Cannot resume progressed legacy S3 state without durable part receipts.",
          false
        );
      }

      const session: TransportSession = {
        uploadId: record.transport.uploadId,
        transportName: S3_TRANSPORT_NAME,
        createdAt: record.createdAt,
        remote: getPersistedRemoteState(record.transport.data)
      };
      if (record.transport.expiresAt !== undefined) {
        session.expiresAt = record.transport.expiresAt;
      }
      return session;
    },
    async uploadChunk(context) {
      const remote = getRemoteState(context.session);
      const partNumber = partNumberForChunk(context.chunk);
      const target = await options.broker.getUploadPartUrl({
        manifest: context.manifest,
        file: context.file,
        signal: context.signal,
        bucket: remote.bucket,
        key: remote.key,
        uploadId: context.session.uploadId,
        session: context.session,
        chunk: context.chunk,
        partNumber,
        previousReceipts: context.previousReceipts
      });

      validateUploadTarget(target);

      const response = await fetchImpl(target.url, {
        method: target.method ?? "PUT",
        headers: await createUploadHeaders(options, target.headers),
        body: context.body,
        signal: context.signal
      });

      if (![200, 201].includes(response.status)) {
        throw createS3Error(
          "transport.part_rejected",
          `S3 multipart part upload failed with HTTP ${response.status}.`,
          isRetryableStatus(response.status),
          {
            chunkIndex: context.chunk.index,
            partNumber,
            status: response.status
          }
        );
      }

      const etag = response.headers.get("ETag");

      if (!etag) {
        throw createS3Error(
          "transport.receipt_missing",
          "S3 multipart part upload response did not include an ETag header.",
          false,
          {
            chunkIndex: context.chunk.index,
            partNumber
          }
        );
      }

      return {
        chunkIndex: context.chunk.index,
        sizeBytes: context.chunk.size,
        completedAt: nowIso(),
        checksum: readChecksum(response),
        transport: {
          name: S3_TRANSPORT_NAME,
          partNumber,
          etag
        }
      };
    },
    async completeSession(context) {
      const remote = getRemoteState(context.session);
      const parts = context.receipts.map(receiptToCompletedPart);

      validateCompletedParts(parts);

      await options.broker.completeMultipartUpload({
        manifest: context.manifest,
        file: context.file,
        signal: context.signal,
        bucket: remote.bucket,
        key: remote.key,
        uploadId: context.session.uploadId,
        session: context.session,
        receipts: context.receipts,
        parts
      });
    },
    async abortSession(context) {
      if (!options.broker.abortMultipartUpload) {
        return;
      }

      const remote = getRemoteState(context.session);

      try {
        await options.broker.abortMultipartUpload({
          manifest: context.manifest,
          file: context.file,
          signal: context.signal,
          bucket: remote.bucket,
          key: remote.key,
          uploadId: context.session.uploadId,
          session: context.session,
          receipts: context.receipts
        });
      } catch (error) {
        throw createS3Error(
          "transport.abort_failed",
          toErrorMessage(error, "S3 multipart abort failed."),
          false
        );
      }
    }
  };
}

function validateUploadHandle(handle: S3MultipartUploadHandle): void {
  if (!handle.uploadId) {
    throw createS3Error(
      "transport.failed",
      "S3 multipart broker did not return an uploadId.",
      false
    );
  }

  if (!handle.key) {
    throw createS3Error(
      "transport.failed",
      "S3 multipart broker did not return a trusted object key.",
      false
    );
  }
}

function validateUploadTarget(target: S3MultipartUploadTarget): void {
  if (!target.url) {
    throw createS3Error(
      "transport.failed",
      "S3 multipart broker did not return a part upload URL.",
      false
    );
  }

  if (target.method && target.method !== "PUT") {
    throw createS3Error(
      "transport.failed",
      "S3 multipart part upload targets must use PUT.",
      false
    );
  }
}

async function createUploadHeaders(
  options: S3MultipartTransportOptions,
  targetHeaders: HeadersInit | undefined
): Promise<Headers> {
  const result = await resolveHeaders(options.headers);
  const target = new Headers(targetHeaders);

  target.forEach((value, name) => {
    result.set(name, value);
  });

  return result;
}

async function resolveHeaders(
  headers: S3MultipartTransportOptions["headers"]
): Promise<Headers> {
  const value = typeof headers === "function" ? await headers() : headers;
  return new Headers(value);
}

function getRemoteState(session: TransportSession): S3MultipartRemoteState {
  if (!session.remote || typeof session.remote.key !== "string" || session.remote.key.length === 0) {
    throw createS3Error(
      "transport.resume_failed",
      "S3 multipart transport session is missing trusted object key state.",
      false
    );
  }

  return {
    bucket: typeof session.remote.bucket === "string" ? session.remote.bucket : undefined,
    key: session.remote.key,
    metadata: isRecord(session.remote.metadata) ? session.remote.metadata : undefined
  };
}

function getPersistedRemoteState(value: Record<string, unknown> | undefined): Record<string, unknown> {
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

function partNumberForChunk(chunk: ChunkDescriptor): number {
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

function receiptToCompletedPart(receipt: UploadChunkReceipt): S3CompletedPart {
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

function validateCompletedParts(parts: readonly S3CompletedPart[]): void {
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

function readChecksum(response: Response): UploadChunkReceipt["checksum"] {
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

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function createS3Error(
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

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return fallback;
}

function nowIso(): string {
  return new Date().toISOString();
}
