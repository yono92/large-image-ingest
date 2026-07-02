import { describe, expect, it } from "vitest";
import { createManifest } from "../src/manifest";
import { createIngestSession } from "../src/session";
import { createTusTransport } from "../src/tus";
import type {
  IngestEvent,
  TusFetch,
  UploadSessionSnapshot
} from "../src";

const endpoint = "https://tus.example/uploads";
const uploadUrl = "https://tus.example/uploads/upload-1";
const chunkSize = 256 * 1024;

interface TusRequest {
  bodySize: number;
  headers: Headers;
  input: string;
  method: string;
}

interface FakeTusServerOptions {
  extensions?: string;
  initialOffset?: number;
  onPatchComplete?: () => void;
}

describe("createTusTransport", () => {
  it("uploads chunks through the tus creation, offset, and patch flow", async () => {
    const server = createFakeTusServer({
      extensions: "creation,expiration,termination"
    });
    const file = new File([new Uint8Array(600 * 1024)], "wafer.tif", {
      type: "image/tiff"
    });
    const eventSnapshots: UploadSessionSnapshot[] = [];
    const fullSnapshots: UploadSessionSnapshot[] = [];
    const session = createIngestSession(file, {
      chunking: { chunkSize },
      onEvent(event: IngestEvent) {
        if (event.type === "snapshot") {
          eventSnapshots.push(event.snapshot);
        }
      },
      onSnapshot(snapshot) {
        fullSnapshots.push(snapshot);
      },
      transport: createTusTransport({
        endpoint,
        detectExtensions: true,
        fetch: server.fetch,
        metadata: {
          lotId: "LOT-1"
        }
      })
    });

    await session.start();

    const patchRequests = server.requests.filter((request) => request.method === "PATCH");
    const offsets = session.getSnapshot()?.completedChunks.map(
      (receipt) => receipt.transport.offset
    );

    expect(server.requests.map((request) => request.method)).toEqual([
      "OPTIONS",
      "POST",
      "HEAD",
      "PATCH",
      "HEAD",
      "PATCH",
      "HEAD",
      "PATCH",
      "HEAD"
    ]);
    expect(server.requests[1].headers.get("Upload-Metadata")).toBe("lotId TE9ULTE=");
    expect(patchRequests.map((request) => request.headers.get("Tus-Resumable"))).toEqual([
      "1.0.0",
      "1.0.0",
      "1.0.0"
    ]);
    expect(patchRequests.map((request) => request.headers.get("Content-Type"))).toEqual([
      "application/offset+octet-stream",
      "application/offset+octet-stream",
      "application/offset+octet-stream"
    ]);
    expect(offsets).toEqual([chunkSize, chunkSize * 2, file.size]);
    expect(fullSnapshots.at(-1)?.transportSession?.resumeToken).toBe(uploadUrl);
    expect(eventSnapshots.at(-1)?.transportSession?.resumeToken).toBeUndefined();
  });

  it("resumes from a stored tus upload URL without creating a new upload", async () => {
    const file = new File([new Uint8Array(600 * 1024)], "wafer.tif", {
      type: "image/tiff"
    });
    const manifest = await createManifest(file, {
      chunking: { chunkSize }
    });
    const server = createFakeTusServer({
      initialOffset: chunkSize
    });
    const transport = createTusTransport({
      endpoint,
      fetch: server.fetch
    });

    await createIngestSession(file, {
      chunking: { chunkSize },
      manifest,
      resumeFrom: {
        manifestId: manifest.id,
        status: "paused",
        transportSession: {
          uploadId: "tus-existing",
          transportName: "tus",
          createdAt: "2026-01-01T00:00:00.000Z",
          resumeToken: uploadUrl
        },
        chunkPlan: {
          chunkSize,
          totalBytes: file.size,
          totalChunks: 3,
          chunks: [
            { index: 0, start: 0, end: chunkSize, size: chunkSize },
            { index: 1, start: chunkSize, end: chunkSize * 2, size: chunkSize },
            { index: 2, start: chunkSize * 2, end: file.size, size: file.size - chunkSize * 2 }
          ]
        },
        completedChunks: [
          {
            chunkIndex: 0,
            sizeBytes: chunkSize,
            completedAt: "2026-01-01T00:00:00.000Z",
            transport: {
              name: "tus",
              offset: chunkSize
            }
          }
        ],
        uploadedBytes: chunkSize,
        totalBytes: file.size,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      transport
    }).start();

    expect(server.requests.some((request) => request.method === "POST")).toBe(false);
    expect(server.requests.filter((request) => request.method === "PATCH")).toHaveLength(2);
    expect(server.offset).toBe(file.size);
  });

  it("rejects missing required tus extensions during OPTIONS discovery", async () => {
    const server = createFakeTusServer({
      extensions: "creation"
    });
    const file = new File([new Uint8Array(chunkSize)], "wafer.tif", {
      type: "image/tiff"
    });

    await expect(
      createIngestSession(file, {
        chunking: { chunkSize },
        transport: createTusTransport({
          endpoint,
          detectExtensions: true,
          fetch: server.fetch,
          requiredExtensions: ["expiration"]
        })
      }).start()
    ).rejects.toMatchObject({
      code: "transport.failed",
      retryable: false
    });
  });

  it("reports offset mismatch when the remote offset does not match the chunk", async () => {
    const server = createFakeTusServer({
      initialOffset: 1
    });
    const file = new File([new Uint8Array(chunkSize)], "wafer.tif", {
      type: "image/tiff"
    });

    await expect(
      createIngestSession(file, {
        chunking: { chunkSize },
        transport: createTusTransport({
          endpoint,
          fetch: server.fetch
        })
      }).start()
    ).rejects.toMatchObject({
      code: "transport.offset_mismatch",
      retryable: false
    });
  });

  it("terminates the tus upload when the session is canceled", async () => {
    const file = new File([new Uint8Array(600 * 1024)], "wafer.tif", {
      type: "image/tiff"
    });
    let session: ReturnType<typeof createIngestSession>;
    const server = createFakeTusServer({
      extensions: "creation,termination",
      onPatchComplete() {
        session.cancel("User canceled upload.");
      }
    });

    session = createIngestSession(file, {
      chunking: { chunkSize },
      transport: createTusTransport({
        endpoint,
        detectExtensions: true,
        fetch: server.fetch,
        terminateOnAbort: true
      })
    });

    await expect(session.start()).rejects.toMatchObject({
      code: "transport.canceled",
      retryable: false
    });
    expect(server.requests.some((request) => request.method === "DELETE")).toBe(true);
  });
});

function createFakeTusServer(options: FakeTusServerOptions = {}): {
  readonly fetch: TusFetch;
  readonly requests: TusRequest[];
  offset: number;
} {
  const requests: TusRequest[] = [];
  const server = {
    offset: options.initialOffset ?? 0,
    requests,
    fetch: async (input: string, init?: RequestInit): Promise<Response> => {
      const method = init?.method ?? "GET";
      const bodySize = bodyByteLength(init?.body);
      const request = {
        bodySize,
        headers: new Headers(init?.headers),
        input,
        method
      };
      requests.push(request);

      if (method === "OPTIONS") {
        return createResponse(204, {
          "Tus-Version": "1.0.0",
          "Tus-Extension": options.extensions ?? "creation"
        });
      }

      if (method === "POST" && input === endpoint) {
        expect(request.headers.get("Tus-Resumable")).toBe("1.0.0");
        expect(request.headers.get("Upload-Length")).toBeTruthy();

        return createResponse(201, {
          Location: uploadUrl,
          "Tus-Resumable": "1.0.0",
          "Upload-Expires": "2026-01-01T00:00:00.000Z"
        });
      }

      if (method === "HEAD" && input === uploadUrl) {
        expect(request.headers.get("Tus-Resumable")).toBe("1.0.0");

        return createResponse(204, {
          "Upload-Offset": String(server.offset),
          "Tus-Resumable": "1.0.0"
        });
      }

      if (method === "PATCH" && input === uploadUrl) {
        expect(request.headers.get("Tus-Resumable")).toBe("1.0.0");
        expect(request.headers.get("Content-Type")).toBe("application/offset+octet-stream");
        expect(Number(request.headers.get("Upload-Offset"))).toBe(server.offset);

        server.offset += bodySize;
        options.onPatchComplete?.();

        return createResponse(204, {
          "Upload-Offset": String(server.offset),
          "Tus-Resumable": "1.0.0"
        });
      }

      if (method === "DELETE" && input === uploadUrl) {
        expect(request.headers.get("Tus-Resumable")).toBe("1.0.0");
        return createResponse(204);
      }

      return createResponse(404);
    }
  };

  return server;
}

function createResponse(status: number, headers: HeadersInit = {}): Response {
  return new Response(null, {
    status,
    headers
  });
}

function bodyByteLength(body: BodyInit | null | undefined): number {
  if (!body) {
    return 0;
  }

  if (body instanceof Blob) {
    return body.size;
  }

  if (typeof body === "string") {
    return new TextEncoder().encode(body).byteLength;
  }

  throw new TypeError("Unsupported fake tus body type.");
}
