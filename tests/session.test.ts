import { describe, expect, it } from "vitest";
import { createManifest } from "../src/manifest";
import { createIngestSession } from "../src/session";
import type {
  IngestEvent,
  TransportCapabilities,
  TransportSession,
  UploadChunkReceipt,
  UploadSessionSnapshot,
  UploadTransport
} from "../src/types";

const chunkSize = 256 * 1024;

const fakeCapabilities: TransportCapabilities = {
  name: "fake-receipt-transport",
  resumable: true,
  abortable: true,
  expires: false,
  supportsParallelChunks: false,
  supportsChunkChecksum: false
};

describe("LargeImageIngestSession", () => {
  it("tracks chunk receipts and passes ordered receipts to completeSession", async () => {
    const file = new File([new Uint8Array(600 * 1024)], "wafer.tif", {
      type: "image/tiff"
    });
    const completedReceipts: UploadChunkReceipt[][] = [];
    const eventSnapshots: UploadSessionSnapshot[] = [];
    const fullSnapshots: UploadSessionSnapshot[] = [];

    const transport: UploadTransport = {
      capabilities: fakeCapabilities,
      async createSession(): Promise<TransportSession> {
        return {
          uploadId: "upload-1",
          transportName: fakeCapabilities.name,
          createdAt: "2026-01-01T00:00:00.000Z",
          resumeToken: "secret-resume-url",
          remote: {
            brokerSessionId: "broker-1"
          }
        };
      },
      async uploadChunk({ chunk, body }): Promise<UploadChunkReceipt> {
        return {
          chunkIndex: chunk.index,
          sizeBytes: body.size,
          completedAt: "2026-01-01T00:00:00.000Z",
          transport: {
            name: fakeCapabilities.name,
            partNumber: chunk.index + 1,
            etag: `etag-${chunk.index}`,
            location: `https://example.invalid/part-${chunk.index}`
          }
        };
      },
      async completeSession({ receipts }): Promise<void> {
        completedReceipts.push([...receipts]);
      }
    };

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
      transport
    });

    await session.start();

    expect(completedReceipts).toHaveLength(1);
    expect(completedReceipts[0].map((receipt) => receipt.chunkIndex)).toEqual([0, 1, 2]);
    expect(completedReceipts[0].map((receipt) => receipt.transport.partNumber)).toEqual([1, 2, 3]);
    expect(session.getSnapshot()?.status).toBe("completed");
    expect(session.getSnapshot()?.completedChunks).toHaveLength(3);

    const finalFullSnapshot = fullSnapshots.at(-1);
    const finalEventSnapshot = eventSnapshots.at(-1);

    expect(finalFullSnapshot?.transportSession?.resumeToken).toBe("secret-resume-url");
    expect(finalFullSnapshot?.transportSession?.remote).toEqual({
      brokerSessionId: "broker-1"
    });
    expect(finalFullSnapshot?.completedChunks[0].transport.location).toBe(
      "https://example.invalid/part-0"
    );

    expect(finalEventSnapshot?.transportSession?.resumeToken).toBeUndefined();
    expect(finalEventSnapshot?.transportSession?.remote).toBeUndefined();
    expect(finalEventSnapshot?.completedChunks[0].transport.location).toBeUndefined();
    expect(finalEventSnapshot?.redactions).toEqual({
      transportSession: ["resumeToken", "remote"],
      receipts: ["transport.location"]
    });
  });

  it("resumes from a snapshot and skips already completed chunks", async () => {
    const file = new File([new Uint8Array(600 * 1024)], "wafer.tif", {
      type: "image/tiff"
    });
    const manifest = await createManifest(file, {
      chunking: { chunkSize }
    });
    const resumedChunks: number[] = [];
    const completedReceipts: UploadChunkReceipt[][] = [];
    const resumeSession: TransportSession = {
      uploadId: "upload-resume",
      transportName: fakeCapabilities.name,
      createdAt: "2026-01-01T00:00:00.000Z"
    };
    const resumeFrom: UploadSessionSnapshot = {
      manifestId: manifest.id,
      status: "paused",
      transportSession: resumeSession,
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
            name: fakeCapabilities.name,
            partNumber: 1,
            etag: "etag-0"
          }
        }
      ],
      uploadedBytes: chunkSize,
      totalBytes: file.size,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };

    const transport: UploadTransport = {
      capabilities: fakeCapabilities,
      async createSession(): Promise<TransportSession> {
        throw new Error("createSession should not be called when resuming.");
      },
      async resumeSession({ snapshot }): Promise<TransportSession> {
        expect(snapshot).toBe(resumeFrom);
        return resumeSession;
      },
      async uploadChunk({ chunk, body }): Promise<UploadChunkReceipt> {
        resumedChunks.push(chunk.index);
        return {
          chunkIndex: chunk.index,
          sizeBytes: body.size,
          completedAt: "2026-01-01T00:00:00.000Z",
          transport: {
            name: fakeCapabilities.name,
            partNumber: chunk.index + 1,
            etag: `etag-${chunk.index}`
          }
        };
      },
      async completeSession({ receipts }): Promise<void> {
        completedReceipts.push([...receipts]);
      }
    };

    await createIngestSession(file, {
      chunking: { chunkSize },
      manifest,
      resumeFrom,
      transport
    }).start();

    expect(resumedChunks).toEqual([1, 2]);
    expect(completedReceipts[0].map((receipt) => receipt.chunkIndex)).toEqual([0, 1, 2]);
  });

  it("rejects invalid chunk receipts without retrying", async () => {
    const file = new File([new Uint8Array(chunkSize)], "wafer.tif", {
      type: "image/tiff"
    });
    let uploadAttempts = 0;

    const transport: UploadTransport = {
      capabilities: fakeCapabilities,
      async createSession(): Promise<TransportSession> {
        return {
          uploadId: "upload-invalid",
          transportName: fakeCapabilities.name,
          createdAt: "2026-01-01T00:00:00.000Z"
        };
      },
      async uploadChunk({ chunk, body }): Promise<UploadChunkReceipt> {
        uploadAttempts += 1;
        return {
          chunkIndex: chunk.index + 1,
          sizeBytes: body.size,
          completedAt: "2026-01-01T00:00:00.000Z",
          transport: {
            name: fakeCapabilities.name
          }
        };
      },
      async completeSession(): Promise<void> {
        throw new Error("completeSession should not be called for invalid receipts.");
      }
    };

    await expect(
      createIngestSession(file, {
        chunking: { chunkSize },
        retries: 3,
        transport
      }).start()
    ).rejects.toMatchObject({
      code: "transport.receipt_invalid",
      retryable: false
    });
    expect(uploadAttempts).toBe(1);
  });

  it("rejects resume snapshots with mismatched chunk plans", async () => {
    const file = new File([new Uint8Array(600 * 1024)], "wafer.tif", {
      type: "image/tiff"
    });
    const manifest = await createManifest(file, {
      chunking: { chunkSize }
    });
    let uploadAttempts = 0;

    const transport: UploadTransport = {
      capabilities: fakeCapabilities,
      async createSession(): Promise<TransportSession> {
        throw new Error("createSession should not be called for invalid resume snapshots.");
      },
      async uploadChunk({ chunk, body }): Promise<UploadChunkReceipt> {
        uploadAttempts += 1;
        return {
          chunkIndex: chunk.index,
          sizeBytes: body.size,
          completedAt: "2026-01-01T00:00:00.000Z",
          transport: {
            name: fakeCapabilities.name
          }
        };
      },
      async completeSession(): Promise<void> {
        throw new Error("completeSession should not be called for invalid resume snapshots.");
      }
    };

    await expect(
      createIngestSession(file, {
        chunking: { chunkSize },
        manifest,
        resumeFrom: {
          manifestId: manifest.id,
          status: "paused",
          chunkPlan: {
            chunkSize: chunkSize * 2,
            totalBytes: file.size,
            totalChunks: 2,
            chunks: [
              { index: 0, start: 0, end: chunkSize * 2, size: chunkSize * 2 },
              { index: 1, start: chunkSize * 2, end: file.size, size: file.size - chunkSize * 2 }
            ]
          },
          completedChunks: [],
          uploadedBytes: 0,
          totalBytes: file.size,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        },
        transport
      }).start()
    ).rejects.toMatchObject({
      code: "transport.resume_failed",
      retryable: false
    });
    expect(uploadAttempts).toBe(0);
  });

  it("pauses without aborting the remote transport session", async () => {
    const file = new File([new Uint8Array(600 * 1024)], "wafer.tif", {
      type: "image/tiff"
    });
    const events: IngestEvent[] = [];
    let abortCalled = false;
    let session: ReturnType<typeof createIngestSession>;

    const transport: UploadTransport = {
      capabilities: fakeCapabilities,
      async createSession(): Promise<TransportSession> {
        return {
          uploadId: "upload-pause",
          transportName: fakeCapabilities.name,
          createdAt: "2026-01-01T00:00:00.000Z"
        };
      },
      async uploadChunk({ chunk, body }): Promise<UploadChunkReceipt> {
        if (chunk.index === 0) {
          session.pause("User paused upload.");
        }

        return {
          chunkIndex: chunk.index,
          sizeBytes: body.size,
          completedAt: "2026-01-01T00:00:00.000Z",
          transport: {
            name: fakeCapabilities.name,
            partNumber: chunk.index + 1
          }
        };
      },
      async completeSession(): Promise<void> {
        throw new Error("completeSession should not be called after pause.");
      },
      async abortSession(): Promise<void> {
        abortCalled = true;
      }
    };

    session = createIngestSession(file, {
      chunking: { chunkSize },
      onEvent(event) {
        events.push(event);
      },
      transport
    });

    await expect(session.start()).rejects.toMatchObject({
      code: "transport.paused",
      retryable: false
    });

    expect(abortCalled).toBe(false);
    expect(session.getSnapshot()?.status).toBe("paused");
    expect(session.getSnapshot()?.completedChunks.map((receipt) => receipt.chunkIndex)).toEqual([0]);
    expect(events.some((event) => event.type === "paused")).toBe(true);
    expect(events.some((event) => event.type === "failed")).toBe(false);
  });

  it("cancels and asks the transport to abort the remote session", async () => {
    const file = new File([new Uint8Array(600 * 1024)], "wafer.tif", {
      type: "image/tiff"
    });
    const events: IngestEvent[] = [];
    let abortedReceipts: readonly UploadChunkReceipt[] | undefined;
    let session: ReturnType<typeof createIngestSession>;

    const transport: UploadTransport = {
      capabilities: fakeCapabilities,
      async createSession(): Promise<TransportSession> {
        return {
          uploadId: "upload-cancel",
          transportName: fakeCapabilities.name,
          createdAt: "2026-01-01T00:00:00.000Z"
        };
      },
      async uploadChunk({ chunk, body }): Promise<UploadChunkReceipt> {
        if (chunk.index === 0) {
          session.cancel("User canceled upload.");
        }

        return {
          chunkIndex: chunk.index,
          sizeBytes: body.size,
          completedAt: "2026-01-01T00:00:00.000Z",
          transport: {
            name: fakeCapabilities.name,
            partNumber: chunk.index + 1
          }
        };
      },
      async completeSession(): Promise<void> {
        throw new Error("completeSession should not be called after cancel.");
      },
      async abortSession({ receipts }): Promise<void> {
        abortedReceipts = receipts;
      }
    };

    session = createIngestSession(file, {
      chunking: { chunkSize },
      onEvent(event) {
        events.push(event);
      },
      transport
    });

    await expect(session.start()).rejects.toMatchObject({
      code: "transport.canceled",
      retryable: false
    });

    expect(abortedReceipts?.map((receipt) => receipt.chunkIndex)).toEqual([0]);
    expect(session.getSnapshot()?.status).toBe("canceled");
    expect(session.getSnapshot()?.completedChunks.map((receipt) => receipt.chunkIndex)).toEqual([0]);
    expect(events.some((event) => event.type === "canceled")).toBe(true);
    expect(events.some((event) => event.type === "failed")).toBe(false);
  });
});
