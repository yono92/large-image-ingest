import {
  createIngestSession,
  type UploadTransport
} from "large-image-ingest/core";

const appApiTransport: UploadTransport = {
  capabilities: {
    name: "app-api",
    resumable: true,
    abortable: true,
    expires: false,
    supportsParallelChunks: false,
    supportsChunkChecksum: false
  },
  async createSession({ manifest }) {
    const response = await fetch("/api/uploads", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        manifest
      })
    });
    const created = await response.json() as { uploadId: string };

    return {
      uploadId: created.uploadId,
      transportName: "app-api",
      createdAt: new Date().toISOString()
    };
  },
  async uploadChunk({ body, chunk, session }) {
    const response = await fetch(`/api/uploads/${session.uploadId}/chunks/${chunk.index}`, {
      method: "PUT",
      body
    });

    return {
      chunkIndex: chunk.index,
      sizeBytes: body.size,
      completedAt: new Date().toISOString(),
      transport: {
        name: "app-api",
        etag: response.headers.get("etag") ?? undefined
      }
    };
  },
  async completeSession({ manifest, receipts, session }) {
    await fetch(`/api/uploads/${session.uploadId}/complete`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        manifest,
        receipts
      })
    });
  },
  async abortSession({ session }) {
    await fetch(`/api/uploads/${session.uploadId}`, {
      method: "DELETE"
    });
  }
};

export async function uploadWithCustomTransport(file: File): Promise<void> {
  const session = createIngestSession(file, {
    chunking: {
      chunkSize: 64 * 1024 * 1024
    },
    metadata: {
      lotId: "LOT-2026-001",
      waferId: "W12"
    },
    transport: appApiTransport,
    validation: {
      acceptedExtensions: ["tif", "tiff", "png", "jpg", "jpeg"],
      acceptedMimeTypes: ["image/tiff", "image/png", "image/jpeg"],
      maxBytes: 10 * 1024 * 1024 * 1024
    }
  });

  await session.start();
}
