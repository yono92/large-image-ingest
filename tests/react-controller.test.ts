import { describe, expect, it } from "vitest";
import { createIngestSession } from "../src/session";
import { createIngestController } from "../src/react-controller";
import type {
  TransportSession,
  UploadChunkReceipt,
  UploadTransport
} from "../src/types";
import { FakeTransport, MemoryResumeStore, createLargeTestFile } from "./resume-fixtures";

const chunkSize = 256 * 1024;

describe("React ingest controller", () => {
  it("publishes stable state revisions and removes subscriptions", async () => {
    const states: string[] = [];
    const controller = createIngestController(createFile(), {
      chunking: { chunkSize },
      transport: createTransport()
    });
    const initial = controller.getState();
    expect(controller.getState()).toBe(initial);

    const unsubscribe = controller.subscribe(() => {
      states.push(controller.getState().status);
    });
    await controller.start();
    const revisionCount = states.length;
    unsubscribe();
    await controller.start();

    expect(states).toContain("uploading");
    expect(states.at(-1)).toBe("completed");
    expect(states).toHaveLength(revisionCount);
  });

  it("maps upload progress and deduplicates concurrent starts", async () => {
    const uploadedChunks: number[] = [];
    let completionCalls = 0;
    const controller = createIngestController(createFile(), {
      chunking: { chunkSize },
      transport: createTransport(uploadedChunks, () => {
        completionCalls += 1;
      })
    });

    const first = controller.start();
    const second = controller.start();
    expect(second).toBe(first);
    const manifest = await first;

    expect(manifest.schemaVersion).toBe("large-image-ingest.manifest.v1");
    expect(uploadedChunks).toEqual([0, 1, 2]);
    expect(completionCalls).toBe(1);
    expect(controller.getState()).toMatchObject({
      status: "completed",
      uploadedBytes: createFile().size,
      totalBytes: createFile().size,
      progress: 1,
      manifest: { id: manifest.id }
    });
  });

  it("maps operation failures without losing the typed error", async () => {
    const failure = Object.assign(new Error("Upload failed."), {
      code: "transport.failed",
      retryable: false
    });
    const transport = createTransport();
    transport.uploadChunk = async () => {
      throw failure;
    };
    const controller = createIngestController(createFile(), {
      chunking: { chunkSize },
      retries: 0,
      transport
    });

    await expect(controller.start()).rejects.toBe(failure);
    expect(controller.getState()).toMatchObject({
      status: "failed",
      error: failure
    });
  });

  it("resumes a persistent record and deduplicates the active operation", async () => {
    const file = createLargeTestFile();
    const store = new MemoryResumeStore();
    await expect(createIngestSession(file, {
      chunking: { chunkSize },
      retries: 0,
      resume: { store },
      transport: new FakeTransport({ failChunkIndexes: [1] })
    }).start()).rejects.toThrow("Chunk 1 failed.");
    const [record] = await store.list();
    if (!record) {
      throw new Error("Expected a persistent resume record.");
    }
    const transport = new FakeTransport();
    const controller = createIngestController(file, {
      chunking: { chunkSize },
      resume: { store },
      transport
    });

    const first = controller.resume(record.id);
    const second = controller.start();
    expect(second).toBe(first);
    await first;

    expect(transport.resumed).toHaveLength(1);
    expect(controller.getState()).toMatchObject({
      status: "completed",
      progress: 1,
      recordId: record.id
    });
  });

  it("delegates pause and cancel to the active core session", async () => {
    const pausedController = createIngestController(createFile(), {
      chunking: { chunkSize },
      transport: createAbortAwareTransport()
    });
    const paused = pausedController.start();
    await waitForStatus(pausedController, "uploading");
    pausedController.pause();
    await expect(paused).rejects.toMatchObject({ code: "transport.paused" });
    expect(pausedController.getState().status).toBe("paused");

    const canceledController = createIngestController(createFile(), {
      chunking: { chunkSize },
      transport: createAbortAwareTransport()
    });
    const canceled = canceledController.start();
    await waitForStatus(canceledController, "uploading");
    await canceledController.cancel();
    await expect(canceled).rejects.toMatchObject({ code: "transport.canceled" });
    expect(canceledController.getState().status).toBe("canceled");
  });
});

function createFile(): File {
  return new File([new Uint8Array(600 * 1024)], "wafer.tif", {
    type: "image/tiff",
    lastModified: Date.UTC(2026, 0, 1)
  });
}

function createAbortAwareTransport(): UploadTransport {
  return {
    async createSession(): Promise<TransportSession> {
      return {
        uploadId: "react-controller-abort",
        transportName: "react-controller-fake",
        createdAt: "2026-01-01T00:00:00.000Z"
      };
    },
    async uploadChunk({ signal }): Promise<never> {
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    },
    async completeSession(): Promise<void> {}
  };
}

async function waitForStatus(
  controller: ReturnType<typeof createIngestController>,
  status: string
): Promise<void> {
  if (controller.getState().status === status) {
    return;
  }
  await new Promise<void>((resolve) => {
    const unsubscribe = controller.subscribe(() => {
      if (controller.getState().status === status) {
        unsubscribe();
        resolve();
      }
    });
  });
}

function createTransport(
  uploadedChunks: number[] = [],
  onComplete: () => void = () => {}
): UploadTransport {
  return {
    async createSession(): Promise<TransportSession> {
      return {
        uploadId: "react-controller-upload",
        transportName: "react-controller-fake",
        createdAt: "2026-01-01T00:00:00.000Z"
      };
    },
    async uploadChunk({ chunk, body }): Promise<UploadChunkReceipt> {
      uploadedChunks.push(chunk.index);
      return {
        chunkIndex: chunk.index,
        sizeBytes: body.size,
        completedAt: "2026-01-01T00:00:00.000Z",
        transport: { name: "react-controller-fake" }
      };
    },
    async completeSession(): Promise<void> {
      onComplete();
    }
  };
}
