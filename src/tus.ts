import type {
  IngestError,
  IngestIssueCode,
  TransportSession,
  UploadChunkContext,
  UploadChunkReceipt,
  UploadSessionContext,
  UploadTransport
} from "./types.js";

const TUS_VERSION = "1.0.0";
const TUS_TRANSPORT_NAME = "tus";
const TUS_PATCH_CONTENT_TYPE = "application/offset+octet-stream";

export type TusFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type TusMetadataValue = string | number | boolean | null | undefined;

export interface TusTransportOptions {
  endpoint: string | URL;
  detectExtensions?: boolean;
  fetch?: TusFetch;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  metadata?: Record<string, TusMetadataValue>;
  requiredExtensions?: readonly string[];
  terminateOnAbort?: boolean;
  uploadIdPrefix?: string;
}

export function createTusTransport(options: TusTransportOptions): UploadTransport {
  const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);

  if (!fetchImpl) {
    throw createTusError("transport.failed", "A fetch implementation is required for tus upload.", false);
  }

  const endpoint = String(options.endpoint);
  const uploadIdPrefix = options.uploadIdPrefix ?? "tus";

  return {
    capabilities: {
      name: TUS_TRANSPORT_NAME,
      resumable: true,
      abortable: Boolean(options.terminateOnAbort),
      expires: true,
      supportsParallelChunks: false,
      supportsChunkChecksum: false
    },
    async createSession(context) {
      await detectServerCapabilities(fetchImpl, endpoint, options);

      const headers = await createHeaders(options, {
        "Tus-Resumable": TUS_VERSION,
        "Upload-Length": String(context.file.size)
      });
      const metadata = createUploadMetadata(options.metadata);

      if (metadata) {
        headers.set("Upload-Metadata", metadata);
      }

      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers,
        body: new Blob([]),
        signal: context.signal
      });

      if (response.status !== 201) {
        throw createTusError(
          "transport.failed",
          `tus upload creation failed with HTTP ${response.status}.`,
          isRetryableStatus(response.status),
          { status: response.status }
        );
      }

      const location = response.headers.get("Location");

      if (!location) {
        throw createTusError("transport.failed", "tus upload creation response did not include Location.", false);
      }

      const uploadUrl = new URL(location, endpoint).toString();

      return {
        uploadId: `${uploadIdPrefix}-${context.manifest.id}`,
        transportName: TUS_TRANSPORT_NAME,
        createdAt: nowIso(),
        expiresAt: readUploadExpires(response),
        resumeToken: uploadUrl
      };
    },
    async resumeSession({ snapshot }) {
      if (!snapshot) {
        throw createTusError(
          "transport.resume_failed",
          "tus transport requires a session snapshot to resume.",
          false
        );
      }

      const session = snapshot.transportSession;

      if (!session?.resumeToken) {
        throw createTusError(
          "transport.resume_failed",
          "Cannot resume tus upload because the snapshot does not include a resume token.",
          false
        );
      }

      return session;
    },
    async uploadChunk(context) {
      const uploadUrl = getUploadUrl(context.session);
      const remote = await readRemoteOffset(fetchImpl, uploadUrl, options, context.signal);

      if (remote.offset === context.chunk.end) {
        return createReceipt(context, remote.offset);
      }

      if (remote.offset !== context.chunk.start) {
        throw createTusError(
          "transport.offset_mismatch",
          `tus remote offset ${remote.offset} does not match expected chunk start ${context.chunk.start}.`,
          false,
          {
            chunkIndex: context.chunk.index,
            remoteOffset: remote.offset,
            expectedOffset: context.chunk.start
          }
        );
      }

      const response = await fetchImpl(uploadUrl, {
        method: "PATCH",
        headers: await createHeaders(options, {
          "Tus-Resumable": TUS_VERSION,
          "Upload-Offset": String(remote.offset),
          "Content-Type": TUS_PATCH_CONTENT_TYPE
        }),
        body: context.body,
        signal: context.signal
      });

      if (response.status === 409) {
        throw createTusError("transport.offset_mismatch", "tus server rejected the chunk offset.", false, {
          chunkIndex: context.chunk.index,
          expectedOffset: remote.offset
        });
      }

      assertUploadStillExists(response);

      if (response.status !== 204) {
        throw createTusError(
          "transport.part_rejected",
          `tus chunk upload failed with HTTP ${response.status}.`,
          isRetryableStatus(response.status),
          { status: response.status, chunkIndex: context.chunk.index }
        );
      }

      const nextOffset = readRequiredOffset(response);

      if (nextOffset !== context.chunk.end) {
        throw createTusError(
          "transport.offset_mismatch",
          `tus server returned offset ${nextOffset}, expected ${context.chunk.end}.`,
          false,
          {
            chunkIndex: context.chunk.index,
            remoteOffset: nextOffset,
            expectedOffset: context.chunk.end
          }
        );
      }

      return createReceipt(context, nextOffset);
    },
    async completeSession(context) {
      const uploadUrl = getUploadUrl(context.session);
      const remote = await readRemoteOffset(fetchImpl, uploadUrl, options, context.signal);

      if (remote.offset !== context.file.size) {
        throw createTusError(
          "transport.complete_failed",
          `tus upload is not complete. Remote offset is ${remote.offset}, expected ${context.file.size}.`,
          false,
          {
            remoteOffset: remote.offset,
            expectedOffset: context.file.size
          }
        );
      }
    },
    async abortSession(context) {
      if (!options.terminateOnAbort) {
        return;
      }

      const uploadUrl = getUploadUrl(context.session);
      const response = await fetchImpl(uploadUrl, {
        method: "DELETE",
        headers: await createHeaders(options, {
          "Tus-Resumable": TUS_VERSION
        })
      });

      if (![200, 202, 204].includes(response.status)) {
        throw createTusError(
          "transport.abort_failed",
          `tus termination failed with HTTP ${response.status}.`,
          false,
          { status: response.status }
        );
      }
    }
  };
}

async function detectServerCapabilities(
  fetchImpl: TusFetch,
  endpoint: string,
  options: TusTransportOptions
): Promise<void> {
  const requiredExtensions = new Set(options.requiredExtensions ?? []);

  if (options.detectExtensions || options.terminateOnAbort || requiredExtensions.size > 0) {
    requiredExtensions.add("creation");
  }

  if (options.terminateOnAbort) {
    requiredExtensions.add("termination");
  }

  if (!options.detectExtensions && requiredExtensions.size === 0) {
    return;
  }

  const response = await fetchImpl(endpoint, {
    method: "OPTIONS",
    headers: await resolveHeaders(options.headers)
  });

  if (![200, 204].includes(response.status)) {
    throw createTusError(
      "transport.failed",
      `tus OPTIONS request failed with HTTP ${response.status}.`,
      isRetryableStatus(response.status),
      { status: response.status }
    );
  }

  const versions = parseHeaderList(response.headers.get("Tus-Version"));

  if (!versions.includes(TUS_VERSION)) {
    throw createTusError("transport.failed", "tus server does not advertise protocol version 1.0.0.", false);
  }

  const extensions = parseHeaderList(response.headers.get("Tus-Extension"));
  const missingExtensions = Array.from(requiredExtensions).filter(
    (extension) => !extensions.includes(extension)
  );

  if (missingExtensions.length > 0) {
    throw createTusError("transport.failed", "tus server is missing required extensions.", false, {
      missingExtensions
    });
  }
}

async function readRemoteOffset(
  fetchImpl: TusFetch,
  uploadUrl: string,
  options: TusTransportOptions,
  signal: AbortSignal
): Promise<{ offset: number; expiresAt?: string | undefined }> {
  const response = await fetchImpl(uploadUrl, {
    method: "HEAD",
    headers: await createHeaders(options, {
      "Tus-Resumable": TUS_VERSION
    }),
    signal
  });

  assertUploadStillExists(response);

  if (![200, 204].includes(response.status)) {
    throw createTusError(
      "transport.failed",
      `tus offset check failed with HTTP ${response.status}.`,
      isRetryableStatus(response.status),
      { status: response.status }
    );
  }

  return {
    offset: readRequiredOffset(response),
    expiresAt: readUploadExpires(response)
  };
}

async function createHeaders(
  options: TusTransportOptions,
  headers: Record<string, string>
): Promise<Headers> {
  const result = await resolveHeaders(options.headers);

  for (const [name, value] of Object.entries(headers)) {
    result.set(name, value);
  }

  return result;
}

async function resolveHeaders(
  headers: TusTransportOptions["headers"]
): Promise<Headers> {
  const value = typeof headers === "function" ? await headers() : headers;
  return new Headers(value);
}

function createUploadMetadata(metadata: TusTransportOptions["metadata"]): string | undefined {
  if (!metadata) {
    return undefined;
  }

  const entries = Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      validateMetadataKey(key);
      return `${key} ${encodeBase64(String(value))}`;
    });

  return entries.length > 0 ? entries.join(",") : undefined;
}

function validateMetadataKey(key: string): void {
  if (!/^[A-Za-z0-9_.-]+$/.test(key)) {
    throw createTusError("transport.failed", "tus metadata keys must be ASCII tokens.", false, { key });
  }
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function getUploadUrl(session: TransportSession): string {
  if (!session.resumeToken) {
    throw createTusError("transport.resume_failed", "tus transport session is missing a resume token.", false);
  }

  return session.resumeToken;
}

function createReceipt(
  context: UploadChunkContext,
  offset: number
): UploadChunkReceipt {
  return {
    chunkIndex: context.chunk.index,
    sizeBytes: context.chunk.size,
    completedAt: nowIso(),
    transport: {
      name: TUS_TRANSPORT_NAME,
      offset
    }
  };
}

function readRequiredOffset(response: Response): number {
  const rawOffset = response.headers.get("Upload-Offset");

  if (!rawOffset) {
    throw createTusError("transport.offset_mismatch", "tus response did not include Upload-Offset.", false);
  }

  const offset = Number(rawOffset);

  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw createTusError("transport.offset_mismatch", "tus response included an invalid Upload-Offset.", false, {
      offset: rawOffset
    });
  }

  return offset;
}

function readUploadExpires(response: Response): string | undefined {
  return response.headers.get("Upload-Expires") ?? undefined;
}

function assertUploadStillExists(response: Response): void {
  if ([403, 404, 410].includes(response.status)) {
    throw createTusError("transport.session_expired", "tus upload session is unavailable or expired.", false, {
      status: response.status
    });
  }
}

function parseHeaderList(value: string | null): string[] {
  return value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function createTusError(
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

function nowIso(): string {
  return new Date().toISOString();
}
