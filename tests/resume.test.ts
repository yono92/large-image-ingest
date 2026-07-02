import { describe, expect, it } from "vitest";
import {
  classifyResumeRecordForFile,
  createResumeChunkingIdentity,
  createResumeFileIdentity,
  createResumeRecord,
  listRecoverableResumeRecords,
  mergeCompletedChunkRange
} from "../src/index";
import { createManifest } from "../src/manifest";
import type { ResumeRecord, ResumeRecordStatus } from "../src/types";
import { createLargeTestFile } from "./resume-fixtures";

async function createRecord(status: ResumeRecordStatus = "active"): Promise<ResumeRecord> {
  const file = createLargeTestFile();
  const manifest = await createManifest(file, { chunking: { chunkSize: 256 * 1024 } });
  const record = createResumeRecord({
    id: `record-${status}`,
    manifest,
    file: await createResumeFileIdentity(file),
    chunking: createResumeChunkingIdentity(file.size, { chunkSize: 256 * 1024 }),
    transport: { uploadId: `upload-${status}` }
  });

  return {
    ...record,
    progress: {
      ...record.progress,
      status
    }
  };
}

describe("resume helpers", () => {
  it("merges completed chunk ranges", () => {
    expect(
      mergeCompletedChunkRange(
        [
          { startIndex: 0, endIndexInclusive: 1 },
          { startIndex: 4, endIndexInclusive: 5 }
        ],
        3
      )
    ).toEqual([
      { startIndex: 0, endIndexInclusive: 1 },
      { startIndex: 3, endIndexInclusive: 5 }
    ]);

    expect(
      mergeCompletedChunkRange([{ startIndex: 1, endIndexInclusive: 2 }], 0)
    ).toEqual([{ startIndex: 0, endIndexInclusive: 2 }]);
  });

  it("filters recoverable records by default", async () => {
    const active = await createRecord("active");
    const paused = await createRecord("paused");
    const failed = await createRecord("failed");
    const completed = await createRecord("completed");
    const canceled = await createRecord("canceled");
    const expired = await createRecord("active");
    expired.id = "record-expired";
    expired.transport.expiresAt = "2026-01-01T00:00:00.000Z";

    const recoverable = listRecoverableResumeRecords(
      [active, paused, failed, completed, canceled, expired],
      new Date("2026-07-02T00:00:00.000Z")
    );

    expect(recoverable.map((record) => record.id)).toEqual([
      "record-active",
      "record-paused",
      "record-failed"
    ]);
  });

  it("classifies selected file compatibility", async () => {
    const file = createLargeTestFile();
    const manifest = await createManifest(file, { chunking: { chunkSize: 256 * 1024 } });
    const record = createResumeRecord({
      manifest,
      file: await createResumeFileIdentity(file),
      chunking: createResumeChunkingIdentity(file.size, { chunkSize: 256 * 1024 }),
      transport: { uploadId: "upload-compatible" }
    });

    await expect(
      classifyResumeRecordForFile(record, file, { chunkSize: 256 * 1024 })
    ).resolves.toBe("compatible");

    await expect(
      classifyResumeRecordForFile(
        record,
        createLargeTestFile("other-wafer.tif"),
        { chunkSize: 256 * 1024 }
      )
    ).resolves.toBe("file_mismatch");

    await expect(
      classifyResumeRecordForFile(record, file, { chunkSize: 512 * 1024 })
    ).resolves.toBe("chunking_mismatch");
  });
});
