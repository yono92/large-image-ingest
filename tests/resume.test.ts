import { describe, expect, it } from "vitest";
import {
  classifyResumeRecordForFile,
  createResumeChunkingIdentity,
  createResumeFileIdentity,
  createResumeRecord,
  listRecoverableResumeRecords,
  mergeCompletedChunkRange,
  parseResumeRecord,
  validateResumeRecord
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

  it("creates and validates detached v0.2 resume records", async () => {
    const record = await createRecord();
    const result = validateResumeRecord(record);

    expect(record.schemaVersion).toBe("large-image-ingest.resume.v0.2");
    expect(record).toMatchObject({ receipts: [] });
    expect(result).toMatchObject({ ok: true });

    const parsed = parseResumeRecord(record);
    expect(parsed).toEqual(record);
    expect(parsed).not.toBe(record);
    expect(parsed.manifest).not.toBe(record.manifest);
  });

  it("rejects out-of-range progress before iterating it", async () => {
    const record = await createRecord();
    const invalid = structuredClone(record);
    invalid.progress.completedChunkRanges = [
      { startIndex: 0, endIndexInclusive: Number.MAX_SAFE_INTEGER }
    ];

    expect(() => parseResumeRecord(invalid)).toThrow(expect.objectContaining({
      code: "resume.record_invalid"
    }));
  });

  it("rejects duplicate and inconsistent durable receipts", async () => {
    const record = await createRecord();
    if (record.schemaVersion !== "large-image-ingest.resume.v0.2") {
      throw new Error("Expected a v0.2 record.");
    }

    const receipt = {
      chunkIndex: 0,
      sizeBytes: 256 * 1024,
      completedAt: "2026-07-10T00:00:00.000Z",
      transport: { name: "fake" }
    };
    record.receipts = [receipt, structuredClone(receipt)];
    record.progress = {
      ...record.progress,
      uploadedBytes: receipt.sizeBytes * 2,
      completedChunkRanges: [{ startIndex: 0, endIndexInclusive: 0 }],
      nextChunkIndex: 1
    };

    const result = validateResumeRecord(record);
    expect(result).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "resume.receipt_invalid" })]
    });
    expect(() => parseResumeRecord(record)).toThrow(expect.objectContaining({
      code: "resume.receipt_invalid"
    }));
  });

  it("rejects binary payloads embedded in persisted metadata", async () => {
    const record = await createRecord();
    record.transport.data = {
      sourceBytes: new Blob(["inspection-bytes"])
    };

    expect(() => parseResumeRecord(record)).toThrow(expect.objectContaining({
      code: "resume.record_invalid"
    }));
  });
});
