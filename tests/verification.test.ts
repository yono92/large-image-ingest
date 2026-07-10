import { describe, expect, it } from "vitest";
import { planChunks } from "../src/chunks";
import { createManifest } from "../src/manifest";
import {
  verifyIngestIntegrity,
  verifyManifest,
  verifyUploadReceipts
} from "../src/verification";
import type { UploadChunkReceipt } from "../src/types";

describe("verification helpers", () => {
  it("verifies a manifest, file identity, checksum, and complete receipt set", async () => {
    const file = new File([new Uint8Array(600 * 1024)], "wafer.tif", {
      type: "image/tiff",
      lastModified: Date.UTC(2026, 0, 1)
    });
    const manifest = await createManifest(file, {
      chunking: { chunkSize: 256 * 1024 },
      validation: {
        acceptedExtensions: ["tif"],
        acceptedMimeTypes: ["image/tiff"]
      }
    });
    manifest.upload.transport = { name: "fake" };

    const receipts = createReceipts(file.size, manifest.chunking.chunkSizeBytes, "fake");

    await expect(verifyManifest(manifest, { file })).resolves.toMatchObject({
      ok: true,
      issues: []
    });
    expect(verifyUploadReceipts(manifest, receipts)).toMatchObject({
      ok: true,
      issues: []
    });
    await expect(verifyIngestIntegrity({ manifest, file, receipts })).resolves.toMatchObject({
      ok: true,
      issues: []
    });
  });

  it("reports checksum mismatch for a same-size but different file", async () => {
    const file = new File(["abc"], "wafer.tif", {
      type: "image/tiff",
      lastModified: Date.UTC(2026, 0, 1)
    });
    const tampered = new File(["abd"], "wafer.tif", {
      type: "image/tiff",
      lastModified: Date.UTC(2026, 0, 1)
    });
    const manifest = await createManifest(file, {
      chunking: { chunkSize: 256 * 1024 }
    });

    const report = await verifyManifest(manifest, { file: tampered });

    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("verification.checksum_mismatch");
  });

  it("reports missing, duplicate, wrong-size, and wrong-transport receipts", async () => {
    const file = new File([new Uint8Array(600 * 1024)], "wafer.tif", { type: "image/tiff" });
    const manifest = await createManifest(file, {
      chunking: { chunkSize: 256 * 1024 }
    });
    manifest.upload.transport = { name: "fake" };
    const receipts = createReceipts(file.size, manifest.chunking.chunkSizeBytes, "fake");

    const report = verifyUploadReceipts(manifest, [
      receipts[0] as UploadChunkReceipt,
      {
        ...(receipts[0] as UploadChunkReceipt),
        completedAt: "2026-01-01T00:00:01.000Z"
      },
      {
        ...(receipts[1] as UploadChunkReceipt),
        sizeBytes: 1,
        transport: {
          name: "other"
        }
      }
    ]);

    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "verification.receipt_duplicate",
      "verification.receipt_invalid",
      "verification.receipt_missing",
      "verification.receipt_incomplete",
      "verification.transport_mismatch"
    ]));
  });

  it("supports partial receipt verification for resumable workflows", async () => {
    const file = new File([new Uint8Array(600 * 1024)], "wafer.tif", { type: "image/tiff" });
    const manifest = await createManifest(file, {
      chunking: { chunkSize: 256 * 1024 }
    });
    const receipts = createReceipts(file.size, manifest.chunking.chunkSizeBytes, "custom");

    expect(verifyUploadReceipts(manifest, [receipts[0] as UploadChunkReceipt], {
      allowPartial: true,
      expectedTransportName: "custom"
    })).toMatchObject({
      ok: true,
      issues: []
    });
  });

  it("rejects malformed manifests without throwing", async () => {
    const report = await verifyManifest({
      schemaVersion: "unknown",
      original: null
    } as never);

    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "verification.manifest_schema_unsupported",
      "verification.manifest_invalid"
    ]));
  });

  it("enforces required chunk checksum evidence", async () => {
    const file = new File([new Uint8Array(300 * 1024)], "wafer.tif", { type: "image/tiff" });
    const manifest = await createManifest(file, { chunking: { chunkSize: 256 * 1024 } });
    const receipts = createReceipts(file.size, manifest.chunking.chunkSizeBytes, "custom");

    const report = verifyUploadReceipts(manifest, receipts, { requireChunkChecksums: true });

    expect(report.ok).toBe(false);
    expect(report.issues.filter((issue) => issue.code === "verification.checksum_missing")).toHaveLength(2);
  });
});

function createReceipts(totalBytes: number, chunkSize: number, transportName: string): UploadChunkReceipt[] {
  return planChunks(totalBytes, { chunkSize }).chunks.map((chunk) => ({
    chunkIndex: chunk.index,
    completedAt: "2026-01-01T00:00:00.000Z",
    sizeBytes: chunk.size,
    transport: {
      name: transportName,
      partNumber: chunk.index + 1
    }
  }));
}
