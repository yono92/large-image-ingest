import type {
  ChunkDescriptor,
  ChecksumReceipt,
  TransportSession,
  UploadChunkContext,
  UploadChunkReceipt,
  UploadSessionContext,
  UploadTransport
} from "./types.js";
import { createS3Error, getPersistedRemoteState, isRecord, isRetryableStatus, nowIso, partNumberForChunk, readChecksum, receiptToCompletedPart, toErrorMessage, validateCompletedParts } from "./s3-helpers.js";
import { DEFAULT_MAX_PART_COUNT } from "./s3-shared.js";

const S3_TRANSPORT_NAME = "s3-multipart";
const DEFAULT_MIN_PART_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_PART_SIZE_BYTES = 5 * 1024 * 1024 * 1024;

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

export interface S3MultipartCreateContext extends UploadSessionContext {
  checksum?: {
    algorithm: "sha256";
    mode: "composite";
  } | undefined;
}

export interface S3MultipartPartContext extends UploadSessionContext {
  bucket?: string | undefined;
  chunk: ChunkDescriptor;
  key: string;
  partNumber: number;
  previousReceipts: readonly UploadChunkReceipt[];
  session: TransportSession;
  uploadId: string;
  integrity?: UploadChunkContext["integrity"];
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

export type S3MultipartReconciliationResult = "completed" | "not_completed" | "unknown";

export interface S3MultipartReconcileContext extends S3MultipartCompleteContext {
  completionError: unknown;
}

export interface S3MultipartBroker {
  createMultipartUpload(context: S3MultipartCreateContext): Promise<S3MultipartUploadHandle>;
  getUploadPartUrl(context: S3MultipartPartContext): Promise<S3MultipartUploadTarget>;
  completeMultipartUpload(context: S3MultipartCompleteContext): Promise<void>;
  reconcileMultipartUpload?(
    context: S3MultipartReconcileContext
  ): Promise<S3MultipartReconciliationResult>;
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
      supportsParallelChunks: true,
      supportsChunkChecksum: true,
      maxParallelChunks: 16,
      supportsSparseResume: true,
      supportsSafeChunkRepeat: true,
      chunkChecksumAlgorithms: ["sha256"],
      chunkChecksumEncodings: ["base64"],
      attestsChunkChecksum: true,
      supportsCompletionReconciliation: Boolean(options.broker.reconcileMultipartUpload),
      supportsSnapshotResume: true,
      supportsPersistentResume: true,
      minChunkSizeBytes: minPartSizeBytes,
      minFinalChunkSizeBytes: 0,
      maxChunkSizeBytes: maxPartSizeBytes,
      maxChunkCount: maxPartCount,
      partNumberBase: 1
    },
    async createSession(context) {
      const handle = await options.broker.createMultipartUpload({
        ...context,
        ...(context.parallel ? { checksum: { algorithm: "sha256", mode: "composite" } as const } : {})
      });
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
        previousReceipts: context.previousReceipts,
        ...(context.integrity ? { integrity: context.integrity } : {})
      });

      validateUploadTarget(target);

      const response = await fetchImpl(target.url, {
        method: target.method ?? "PUT",
        headers: await createUploadHeaders(options, target.headers, context.integrity),
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

      const checksum = readChecksum(response);
      return {
        chunkIndex: context.chunk.index,
        sizeBytes: context.chunk.size,
        completedAt: nowIso(),
        checksum,
        ...(context.integrity ? {
          integrity: {
            ...context.integrity,
            ...(checksum ? {
              remote: {
                ...checksum,
                encoding: "base64" as const,
                role: "remote-attestation" as const
              }
            } : {})
          }
        } : {}),
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

      const completionContext: S3MultipartCompleteContext = {
        manifest: context.manifest,
        file: context.file,
        signal: context.signal,
        bucket: remote.bucket,
        key: remote.key,
        uploadId: context.session.uploadId,
        session: context.session,
        receipts: context.receipts,
        parts
      };

      try {
        await options.broker.completeMultipartUpload(completionContext);
      } catch (completionError) {
        if (!options.broker.reconcileMultipartUpload) {
          throw completionError;
        }

        let reconciliation: S3MultipartReconciliationResult;
        try {
          reconciliation = await options.broker.reconcileMultipartUpload({
            ...completionContext,
            completionError
          });
        } catch {
          throw completionError;
        }

        if (reconciliation !== "completed") {
          throw completionError;
        }
      }
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
  targetHeaders: HeadersInit | undefined,
  integrity: UploadChunkContext["integrity"]
): Promise<Headers> {
  const result = await resolveHeaders(options.headers);
  const target = new Headers(targetHeaders);

  target.forEach((value, name) => {
    result.set(name, value);
  });

  if (integrity?.local.algorithm === "sha256") {
    result.set("x-amz-checksum-sha256", integrity.local.value);
  }

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
