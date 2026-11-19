import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createIngestSession } from "../src/index";
import type {
  ChecksumExecutor,
  FileChecksum,
  IngestEvent,
  IngestFileLike,
  UploadChunkContext
} from "../src/types";
import { FakeTransport, MemoryResumeStore, createLargeTestFile } from "./resume-fixtures";

const chunking = { chunkSize: 256 * 1024 };

/** Executor whose result is held until `release()` so the test controls when hashing ends. */
function gatedExecutor() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let finished = false;
  const executor: ChecksumExecutor = {
    async calculate(file: IngestFileLike, options): Promise<FileChecksum> {
      const bytes = new Uint8Array(await file.slice(0, file.size).arrayBuffer());
      await gate;
      finished = true;
      return {
        algorithm: "sha256",
        calculatedAt: new Date().toISOString(),
        chunkSizeBytes: options.chunkSize,
        scope: "whole-file",
        value: createHash("sha256").update(bytes).digest("hex")
      };
    }
  };
  return { executor, release, isFinished: () => finished };
}

async function sha256(file: File): Promise<string> {
  return createHash("sha256").update(new Uint8Array(await file.arrayBuffer())).digest("hex");
}

class ObservingTransport extends FakeTransport {
  constructor(private readonly onChunk: (context: UploadChunkContext) => void | Promise<void>) {
    super();
  }

  override async uploadChunk(context: UploadChunkContext) {
    await this.onChunk(context);
    return super.uploadChunk(context);
  }
}

describe("overlapChecksum", () => {
  it("uploads chunks before the whole-file checksum finishes and completes with it", async () => {
    const file = createLargeTestFile();
    const gated = gatedExecutor();
    const hashDoneAtChunk: boolean[] = [];
    const transport = new ObservingTransport(({ chunk }) => {
      hashDoneAtChunk.push(gated.isFinished());
      if (chunk.index === 1) gated.release();
    });
    const checksumAtEvent: Record<string, unknown> = {};

    const manifest = await createIngestSession(file, {
      chunking,
      checksum: { executor: gated.executor },
      overlapChecksum: true,
      transport,
      onEvent: (event: IngestEvent) => {
        if (event.type === "validated" || event.type === "completed") {
          checksumAtEvent[event.type] = event.manifest.original.checksum?.value;
        }
      }
    }).start();

    expect(hashDoneAtChunk[0]).toBe(false);
    expect(manifest.original.checksum?.value).toBe(await sha256(file));
    expect(transport.completed).toHaveLength(1);
    expect(checksumAtEvent.validated).toBeUndefined();
    expect(checksumAtEvent.completed).toBe(manifest.original.checksum?.value);
  });

  it("creates the resume record once the checksum is known, with chunks already uploaded", async () => {
    const file = createLargeTestFile();
    const store = new MemoryResumeStore();
    const gated = gatedExecutor();
    let recordsBeforeHash = -1;
    const transport = new ObservingTransport(async ({ chunk }) => {
      if (chunk.index === 1) {
        recordsBeforeHash = (await store.list()).length;
        gated.release();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (chunk.index === 2) throw new Error("Chunk 2 failed.");
    });

    await expect(createIngestSession(file, {
      chunking,
      retries: 0,
      checksum: { executor: gated.executor },
      overlapChecksum: true,
      resume: { store },
      transport
    }).start()).rejects.toThrow("Chunk 2 failed.");

    expect(recordsBeforeHash).toBe(0);
    const [record] = await store.list();
    expect(record?.schemaVersion).toBe("large-image-ingest.resume.v0.3");
    expect(record?.progress.completedChunkRanges).toEqual([{ startIndex: 0, endIndexInclusive: 1 }]);
    expect(record?.manifest.original.checksum?.value).toBe(await sha256(file));

    const resumed = new FakeTransport();
    await createIngestSession(file, { chunking, resume: { store }, transport: resumed }).resume(record!.id);
    expect(resumed.uploadedChunks[0]).toBe(2);
    expect(resumed.completed).toHaveLength(1);
  });

  it("fails before completion when the overlapped checksum does not match checksum.expected", async () => {
    const file = createLargeTestFile();
    const transport = new FakeTransport();

    await expect(createIngestSession(file, {
      chunking,
      checksum: { expected: "0".repeat(64) },
      overlapChecksum: true,
      transport
    }).start()).rejects.toMatchObject({ code: "validation.failed" });
    expect(transport.completed).toHaveLength(0);
  });

  it.each([
    ["parallel", { parallel: { concurrency: 2 } }],
    ["checksum: false", { checksum: false as const }]
  ])("rejects overlap combined with %s", async (_name, extra) => {
    const transport = new FakeTransport();
    await expect(createIngestSession(createLargeTestFile(), {
      chunking,
      overlapChecksum: true,
      transport,
      ...extra
    }).start()).rejects.toMatchObject({ code: "session.invalid_state" });
    expect(transport.created).toHaveLength(0);
  });
});
