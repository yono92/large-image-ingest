import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ResumeRecord } from "../src/core.js";

const require = createRequire(import.meta.url);
const {
  JsonFileResumeStore,
  parseArguments,
  validateResult
} = require("../benchmarks/run-local.cjs") as {
  JsonFileResumeStore: new (filePath: string) => {
    get(recordId: string): Promise<ResumeRecord | undefined>;
    put(record: ResumeRecord): Promise<void>;
    list(): Promise<ResumeRecord[]>;
    delete(recordId: string): Promise<void>;
  };
  parseArguments(argv: string[]): {
    sizeBytes: number;
    chunkSizeBytes: number;
    failAfterChunks: number;
    outputPath?: string;
  };
  validateResult(result: unknown): void;
};

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true
  })));
});

describe("reference benchmark harness", () => {
  it("parses a bounded multi-chunk scenario", () => {
    const parsed = parseArguments([
      "--size-mib",
      "128",
      "--chunk-mib",
      "16",
      "--fail-after-chunks",
      "3"
    ]);

    expect(parsed).toMatchObject({
      sizeBytes: 128 * 1024 * 1024,
      chunkSizeBytes: 16 * 1024 * 1024,
      failAfterChunks: 3
    });
  });

  it("rejects a fixture with no chunk remaining after interruption", () => {
    expect(() => parseArguments([
      "--size-mib",
      "16",
      "--chunk-mib",
      "8",
      "--fail-after-chunks",
      "2"
    ])).toThrow("leave at least one chunk");
  });

  it("rejects sizes that Node file-backed Blob offsets cannot represent", () => {
    expect(() => parseArguments([
      "--size-mib",
      "10240",
      "--chunk-mib",
      "64"
    ])).toThrow("limited to less than 4 GiB");
  });

  it("persists and deletes resume records through JSON", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lii-benchmark-store-"));
    temporaryRoots.push(root);
    const filePath = path.join(root, "records.json");
    const store = new JsonFileResumeStore(filePath);
    const record = {
      id: "record-1",
      progress: { status: "failed" }
    } as ResumeRecord;

    await store.put(record);
    expect(await store.get(record.id)).toEqual(record);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual([record]);

    await store.delete(record.id);
    expect(await store.list()).toEqual([]);
  });

  it("requires interruption, zero duplicates, memory, and final integrity evidence", () => {
    expect(() => validateResult({
      schemaVersion: "large-image-ingest.benchmark.v1",
      integrity: { targetVerifiedAfterPromotion: true },
      recovery: {
        interruptionObserved: true,
        duplicateReceivedBytes: 1
      },
      memoryPeakBytes: {
        rss: 1,
        heapUsed: 1,
        external: 1,
        arrayBuffers: 1
      }
    })).toThrow("Duplicate-byte evidence is invalid");
  });
});
