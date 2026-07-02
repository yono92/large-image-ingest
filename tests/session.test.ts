import { describe, expect, it } from "vitest";
import { LargeImageIngestError } from "../src/errors";
import { createManifest } from "../src/manifest";
import { createIngestSession } from "../src/session";
import type { IngestEvent, IngestSessionSnapshot, UploadTransport } from "../src/types";

describe("createIngestSession", () => {
  it("uploads chunks through a transport and emits progress", async () => {
    const file = new File(["a".repeat(600 * 1024)], "wafer.tif", { type: "image/tiff" });
    const uploadedChunks: number[] = [];
    const events: IngestEvent[] = [];
    const transport: UploadTransport = {
      async createSession() {
        return { uploadId: "upload-1" };
      },
      async uploadChunk({ chunk }) {
        uploadedChunks.push(chunk.index);
      },
      async completeSession() {}
    };

    const session = createIngestSession(file, {
      checksum: false,
      chunking: { chunkSize: 256 * 1024 },
      onEvent(event) {
        events.push(event);
      },
      transport,
      validation: {
        acceptedExtensions: ["tif"],
        acceptedMimeTypes: ["image/tiff"]
      }
    });

    const manifest = await session.start();

    expect(manifest.schemaVersion).toBe("large-image-ingest.manifest.v1");
    expect(uploadedChunks).toEqual([0, 1, 2]);
    expect(session.getState()).toBe("completed");
    expect(events.map((event) => event.type)).toContain("upload:completed");
    expect(events.filter((event) => event.type === "upload:progress")).toHaveLength(3);
  });

  it("pauses between chunks and resumes from a snapshot", async () => {
    const file = new File(["a".repeat(600 * 1024)], "wafer.tif", { type: "image/tiff" });
    const uploadedChunks: number[] = [];
    let session: ReturnType<typeof createIngestSession>;
    let pausedSnapshot: IngestSessionSnapshot | undefined;
    const transport: UploadTransport = {
      async createSession() {
        return { uploadId: "upload-1" };
      },
      async uploadChunk({ chunk }) {
        uploadedChunks.push(chunk.index);
      },
      async completeSession() {}
    };

    session = createIngestSession(file, {
      checksum: false,
      chunking: { chunkSize: 256 * 1024 },
      onEvent(event) {
        if (event.type === "chunk:completed" && event.chunk.index === 0 && !pausedSnapshot) {
          pausedSnapshot = session.pause();
          setTimeout(() => session.resume(), 0);
        }
      },
      transport
    });

    await session.start();

    expect(pausedSnapshot?.state).toBe("paused");
    expect(pausedSnapshot?.uploadedChunks).toEqual([0]);
    expect(uploadedChunks).toEqual([0, 1, 2]);
    expect(session.getState()).toBe("completed");
  });

  it("resumes from a snapshot and skips chunks reported by the transport", async () => {
    const file = new File(["a".repeat(600 * 1024)], "wafer.tif", { type: "image/tiff" });
    const manifest = await createManifest(file, {
      checksum: false,
      chunking: { chunkSize: 256 * 1024 }
    });
    const uploadedChunks: number[] = [];
    const skippedChecks: number[] = [];
    const snapshot: IngestSessionSnapshot = {
      schemaVersion: "large-image-ingest.session.v1",
      createdAt: "2026-01-01T00:00:00.000Z",
      manifest,
      nextChunkIndex: 0,
      state: "paused",
      updatedAt: "2026-01-01T00:00:00.000Z",
      uploadId: "upload-1",
      uploadedBytes: 0,
      uploadedChunks: []
    };
    const transport: UploadTransport = {
      async createSession() {
        throw new Error("resume should reuse the snapshot uploadId");
      },
      shouldUploadChunk({ chunk }) {
        skippedChecks.push(chunk.index);
        return chunk.index !== 0;
      },
      async uploadChunk({ chunk }) {
        uploadedChunks.push(chunk.index);
      },
      async completeSession() {}
    };

    const session = createIngestSession(file, {
      checksum: false,
      chunking: { chunkSize: 256 * 1024 },
      resumeFrom: snapshot,
      transport
    });

    await session.start();

    expect(skippedChecks).toEqual([0, 1, 2]);
    expect(uploadedChunks).toEqual([1, 2]);
    expect(session.getSnapshot()?.uploadedChunks).toEqual([0, 1, 2]);
  });

  it("retries failed chunk uploads and emits typed retry events", async () => {
    const file = new File(["data"], "wafer.tif", { type: "image/tiff" });
    const events: IngestEvent[] = [];
    let attempts = 0;
    const transport: UploadTransport = {
      async createSession() {
        return { uploadId: "upload-1" };
      },
      async uploadChunk() {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("temporary network failure");
        }
      },
      async completeSession() {}
    };

    const session = createIngestSession(file, {
      checksum: false,
      chunking: { chunkSize: 256 * 1024 },
      onEvent(event) {
        events.push(event);
      },
      retries: 1,
      transport
    });

    await session.start();

    const retryEvent = events.find((event) => event.type === "chunk:retry");
    expect(attempts).toBe(2);
    expect(retryEvent).toMatchObject({
      type: "chunk:retry",
      attempt: 1
    });
    expect(retryEvent?.error).toMatchObject({
      code: "transport.failed",
      details: {
        operation: "uploadChunk"
      }
    });
  });

  it("wraps transport failures in typed errors", async () => {
    const file = new File(["data"], "wafer.tif", { type: "image/tiff" });
    const transport: UploadTransport = {
      async createSession() {
        throw new Error("session endpoint unavailable");
      },
      async uploadChunk() {},
      async completeSession() {}
    };

    const session = createIngestSession(file, {
      checksum: false,
      transport
    });

    await expect(session.start()).rejects.toMatchObject({
      code: "transport.failed",
      details: {
        operation: "createSession"
      }
    });
    expect(session.getState()).toBe("failed");
  });

  it("aborts while paused without waiting for resume", async () => {
    const file = new File(["a".repeat(600 * 1024)], "wafer.tif", { type: "image/tiff" });
    let session: ReturnType<typeof createIngestSession>;
    const transport: UploadTransport = {
      async createSession() {
        return { uploadId: "upload-1" };
      },
      async uploadChunk() {},
      async completeSession() {}
    };

    session = createIngestSession(file, {
      checksum: false,
      chunking: { chunkSize: 256 * 1024 },
      onEvent(event) {
        if (event.type === "chunk:completed" && event.chunk.index === 0) {
          session.pause();
          setTimeout(() => session.abort(), 0);
        }
      },
      transport
    });

    await expect(session.start()).rejects.toMatchObject({
      code: "session.aborted"
    });
    expect(session.getState()).toBe("aborted");
  });

  it("throws typed errors for validation failures", async () => {
    const file = new File(["bad"], "wafer.jpg", { type: "image/jpeg" });
    const transport: UploadTransport = {
      async createSession() {
        return { uploadId: "upload-1" };
      },
      async uploadChunk() {},
      async completeSession() {}
    };

    const session = createIngestSession(file, {
      checksum: false,
      transport,
      validation: {
        acceptedExtensions: ["tif"],
        acceptedMimeTypes: ["image/tiff"]
      }
    });

    await expect(session.start()).rejects.toMatchObject({
      code: "validation.failed"
    });
    expect(session.getState()).toBe("failed");
  });

  it("throws typed errors when aborted before start", async () => {
    const file = new File(["data"], "wafer.tif", { type: "image/tiff" });
    const transport: UploadTransport = {
      async createSession() {
        return { uploadId: "upload-1" };
      },
      async uploadChunk() {},
      async completeSession() {}
    };
    const session = createIngestSession(file, {
      checksum: false,
      transport
    });

    session.abort(new LargeImageIngestError("session.aborted", "Stopped by test."));

    await expect(session.start()).rejects.toMatchObject({
      code: "session.aborted"
    });
    expect(session.getState()).toBe("aborted");
  });
});
