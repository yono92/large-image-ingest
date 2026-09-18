import { describe, expect, it } from "vitest";
import { createIngestSession } from "../src/session";
import type { IngestEvent, UploadTransport } from "../src/types";

const chunkSize = 256 * 1024;

describe("parallel lifecycle settlement", () => {
  it.each(["pause", "cancel"] as const)("settles workers before publishing %s", async (action) => {
    const events: IngestEvent[] = [];
    let aborts = 0;
    let session: ReturnType<typeof createIngestSession>;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const transport: UploadTransport = {
      capabilities: {
        name: "parallel-race-fake",
        resumable: true,
        abortable: true,
        expires: false,
        supportsParallelChunks: true,
        supportsChunkChecksum: true,
        maxParallelChunks: 3,
        supportsSparseResume: true,
        supportsSafeChunkRepeat: true,
        chunkChecksumAlgorithms: ["sha256"],
        attestsChunkChecksum: false
      },
      async createSession() { return { uploadId: "race-upload" }; },
      async uploadChunk({ chunk }) {
        if (chunk.index === 0) {
          if (action === "pause") session.pause(); else void session.cancel();
          release();
        } else {
          await gate;
        }
        return {
          chunkIndex: chunk.index,
          sizeBytes: chunk.size,
          completedAt: new Date().toISOString(),
          transport: { name: "parallel-race-fake" }
        };
      },
      async completeSession() { throw new Error("must not complete"); },
      async abortSession() { aborts += 1; }
    };
    session = createIngestSession(new File([new Uint8Array(chunkSize * 6)], "race.tif"), {
      checksum: false,
      chunking: { chunkSize },
      parallel: { concurrency: 3 },
      onEvent(event) { events.push(event); },
      transport
    });
    await expect(session.start()).rejects.toMatchObject({
      code: action === "pause" ? "transport.paused" : "transport.canceled"
    });
    const terminalIndex = events.findIndex((event) => event.type === (action === "pause" ? "paused" : "canceled"));
    expect(terminalIndex).toBeGreaterThan(-1);
    expect(events.slice(terminalIndex + 1).some((event) => event.type === "chunk:completed")).toBe(false);
    expect(aborts).toBe(action === "cancel" ? 1 : 0);
    expect(session.getSnapshot()?.status).toBe(action === "pause" ? "paused" : "canceled");
  });

  it("fails fast, interrupts siblings, and never finalizes after a permanent integrity failure", async () => {
    let completionCalls = 0;
    let observedAbort = false;
    const transport: UploadTransport = {
      capabilities: {
        name: "parallel-failure-fake",
        resumable: true,
        abortable: true,
        expires: false,
        supportsParallelChunks: true,
        supportsChunkChecksum: true,
        maxParallelChunks: 3,
        supportsSparseResume: true,
        supportsSafeChunkRepeat: true,
        chunkChecksumAlgorithms: ["sha256"],
        attestsChunkChecksum: true
      },
      async createSession() { return { uploadId: "failure-upload" }; },
      async uploadChunk({ chunk, signal }) {
        if (chunk.index === 0) {
          return {
            chunkIndex: 0,
            sizeBytes: chunk.size,
            completedAt: new Date().toISOString(),
            checksum: { algorithm: "sha256", value: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
            transport: { name: "parallel-failure-fake" }
          };
        }
        await new Promise<void>((resolve) => signal.addEventListener("abort", () => { observedAbort = true; resolve(); }, { once: true }));
        throw signal.reason;
      },
      async completeSession() { completionCalls += 1; }
    };
    await expect(createIngestSession(new File([new Uint8Array(chunkSize * 4)], "failure.tif"), {
      checksum: false,
      chunking: { chunkSize },
      parallel: { concurrency: 3 },
      transport
    }).start()).rejects.toMatchObject({ code: "checksum.chunk_mismatch" });
    expect(observedAbort).toBe(true);
    expect(completionCalls).toBe(0);
  });

  it("keeps authoritative completion when cancellation arrives inside completion", async () => {
    let aborts = 0;
    let session: ReturnType<typeof createIngestSession>;
    const transport: UploadTransport = {
      capabilities: {
        name: "parallel-completion-race",
        resumable: true,
        abortable: true,
        expires: false,
        supportsParallelChunks: true,
        supportsChunkChecksum: true,
        maxParallelChunks: 2,
        supportsSparseResume: true,
        supportsSafeChunkRepeat: true,
        chunkChecksumAlgorithms: ["sha256"],
        attestsChunkChecksum: false
      },
      async createSession() { return { uploadId: "completion-race" }; },
      async uploadChunk() {},
      async completeSession() { void session.cancel(); },
      async abortSession() { aborts += 1; }
    };
    session = createIngestSession(new File([new Uint8Array(chunkSize * 2)], "complete.tif"), {
      checksum: false,
      chunking: { chunkSize },
      parallel: { concurrency: 2 },
      transport
    });
    await expect(session.start()).resolves.toMatchObject({ schemaVersion: "large-image-ingest.manifest.v1" });
    expect(session.getSnapshot()?.status).toBe("completed");
    expect(aborts).toBe(0);
  });
});
