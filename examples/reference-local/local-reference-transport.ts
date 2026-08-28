import type {
  IngestIssueCode,
  ResumeSessionContext,
  TransportSession,
  UploadChunkContext,
  UploadChunkReceipt,
  UploadSessionContext,
  UploadTransport
} from "large-image-ingest/core";

const TRANSPORT_NAME = "local-http-reference";

export interface LocalReferenceStatus {
  uploadId: string;
  status: "open" | "completed" | "canceled";
  totalBytes: number;
  acknowledgedChunks: number[];
  acknowledgedBytes: number;
  receivedBytes: number;
  duplicateBytes: number;
  verification: "pending" | "verified" | "failed";
}

export interface LocalReferenceTransport extends UploadTransport {
  readStatus(uploadId: string): Promise<LocalReferenceStatus>;
}

export interface LocalReferenceTransportOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createLocalReferenceTransport(
  options: LocalReferenceTransportOptions = {}
): LocalReferenceTransport {
  const baseUrl = (options.baseUrl ?? "/api").replace(/\/$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) {
    throw new TypeError("A fetch implementation is required by the local reference transport.");
  }

  const readStatus = async (uploadId: string): Promise<LocalReferenceStatus> => {
    const response = await fetchImpl(`${baseUrl}/uploads/${encodeURIComponent(uploadId)}`);
    return requireStatus(response, "read upload status");
  };

  return {
    capabilities: {
      name: TRANSPORT_NAME,
      resumable: true,
      abortable: true,
      expires: false,
      supportsParallelChunks: false,
      supportsChunkChecksum: false,
      supportsSnapshotResume: true,
      supportsPersistentResume: true
    },
    async createSession({ manifest }: UploadSessionContext) {
      const response = await fetchImpl(`${baseUrl}/uploads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manifest, totalBytes: manifest.original.sizeBytes })
      });
      const body = await requireJson<{ uploadId: string }>(response, "create upload");
      if (!body.uploadId) {
        throw transportError("transport.failed", "Local target returned an invalid upload identity.", false);
      }
      return {
        uploadId: body.uploadId,
        transportName: TRANSPORT_NAME,
        createdAt: new Date().toISOString()
      };
    },
    async resumeSession({ record }: ResumeSessionContext): Promise<TransportSession> {
      const status = await readStatus(record.transport.uploadId);
      if (status.status !== "open") {
        throw transportError("transport.resume_failed", "Local upload is not open for recovery.", false);
      }
      if (status.acknowledgedBytes !== record.progress.uploadedBytes) {
        throw transportError(
          "transport.offset_mismatch",
          "Local acknowledged bytes do not match the durable checkpoint.",
          false
        );
      }
      return {
        uploadId: record.transport.uploadId,
        transportName: TRANSPORT_NAME,
        createdAt: record.createdAt,
        remote: { acknowledgedBytes: status.acknowledgedBytes }
      };
    },
    async uploadChunk({ body, chunk, session }: UploadChunkContext): Promise<UploadChunkReceipt> {
      const response = await fetchImpl(
        `${baseUrl}/uploads/${encodeURIComponent(session.uploadId)}/chunks/${chunk.index}`,
        {
          method: "PUT",
          headers: {
            "x-chunk-start": String(chunk.start),
            "x-chunk-size": String(chunk.size)
          },
          body
        }
      );
      const result = await requireJson<{ chunkIndex: number; sizeBytes: number }>(response, "upload chunk");
      if (result.chunkIndex !== chunk.index || result.sizeBytes !== chunk.size) {
        throw transportError("transport.receipt_invalid", "Local target returned an invalid chunk receipt.", false);
      }
      return {
        chunkIndex: chunk.index,
        sizeBytes: chunk.size,
        completedAt: new Date().toISOString(),
        transport: {
          name: TRANSPORT_NAME,
          etag: response.headers.get("etag") ?? undefined,
          offset: chunk.end
        }
      };
    },
    async completeSession({ session }: UploadSessionContext & { session: TransportSession }) {
      const response = await fetchImpl(
        `${baseUrl}/uploads/${encodeURIComponent(session.uploadId)}/complete`,
        { method: "POST" }
      );
      const result = await requireJson<{ completed: boolean; verification: string }>(response, "complete upload");
      if (!result.completed || result.verification !== "verified") {
        throw transportError("transport.complete_failed", "Local stored-file verification did not succeed.", false);
      }
    },
    async abortSession({ session }: UploadSessionContext & { session: TransportSession }) {
      const response = await fetchImpl(
        `${baseUrl}/uploads/${encodeURIComponent(session.uploadId)}`,
        { method: "DELETE" }
      );
      if (!response.ok && response.status !== 204) {
        throw await responseError(response, "transport.abort_failed", "cancel upload");
      }
    },
    readStatus
  };
}

class LocalReferenceTransportError extends Error {
  constructor(
    readonly code: IngestIssueCode,
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "LocalReferenceTransportError";
  }
}

function transportError(
  code: IngestIssueCode,
  message: string,
  retryable: boolean
): LocalReferenceTransportError {
  return new LocalReferenceTransportError(code, message, retryable);
}

async function requireJson<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) {
    throw await responseError(response, "transport.failed", action);
  }
  try {
    return await response.json() as T;
  } catch {
    throw transportError("transport.failed", `Local target returned invalid JSON while trying to ${action}.`, false);
  }
}

async function requireStatus(response: Response, action: string): Promise<LocalReferenceStatus> {
  const value = await requireJson<LocalReferenceStatus>(response, action);
  if (
    !value ||
    typeof value.uploadId !== "string" ||
    !Number.isSafeInteger(value.acknowledgedBytes) ||
    !Array.isArray(value.acknowledgedChunks)
  ) {
    throw transportError("transport.resume_failed", "Local target returned an invalid safe status.", false);
  }
  return value;
}

async function responseError(
  response: Response,
  code: IngestIssueCode,
  action: string
): Promise<LocalReferenceTransportError> {
  let message = `Local target could not ${action}.`;
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === "string" && !/https?:\/\//i.test(body.error)) {
      message = body.error;
    }
  } catch {
    // Use the generic safe message.
  }
  return transportError(code, message, response.status >= 500);
}
