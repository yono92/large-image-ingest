import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createManifest } from "../src/manifest";
import {
  calculateNodeFileChecksum,
  verifyNodeFileManifest
} from "../src/node-verification";

const tempRoots: string[] = [];

describe("node verification helpers", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
  });

  it("calculates a streaming SHA-256 checksum for a stored file", async () => {
    const root = await createTempRoot();
    const filePath = join(root, "abc.bin");
    const progress: number[] = [];
    await writeFile(filePath, "abc");

    const checksum = await calculateNodeFileChecksum(filePath, {
      chunkSize: 64 * 1024,
      onProgress(event) {
        progress.push(event.loadedBytes);
      }
    });

    expect(checksum.value).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(progress).toEqual([3]);
  });

  it("verifies a stored file against a manifest checksum", async () => {
    const root = await createTempRoot();
    const filePath = join(root, "wafer.bin");
    const file = new File(["inspection"], "wafer.bin", { type: "application/octet-stream" });
    const manifest = await createManifest(file, {
      chunking: { chunkSize: 256 * 1024 }
    });
    await writeFile(filePath, "inspection");

    await expect(verifyNodeFileManifest(filePath, manifest)).resolves.toMatchObject({
      ok: true,
      issues: []
    });
  });

  it("reports stored-file checksum and size failures with typed codes", async () => {
    const root = await createTempRoot();
    const checksumMismatchPath = join(root, "checksum.bin");
    const sizeMismatchPath = join(root, "size.bin");
    const file = new File(["abc"], "wafer.bin", { type: "application/octet-stream" });
    const manifest = await createManifest(file, {
      chunking: { chunkSize: 256 * 1024 }
    });
    await writeFile(checksumMismatchPath, "abd");
    await writeFile(sizeMismatchPath, "abcd");

    const checksumReport = await verifyNodeFileManifest(checksumMismatchPath, manifest);
    const sizeReport = await verifyNodeFileManifest(sizeMismatchPath, manifest);

    expect(checksumReport.ok).toBe(false);
    expect(checksumReport.issues.map((issue) => issue.code)).toContain("verification.checksum_mismatch");
    expect(sizeReport.ok).toBe(false);
    expect(sizeReport.issues.map((issue) => issue.code)).toContain("verification.original_mismatch");
  });

  it("reports missing stored files without leaking path details", async () => {
    const root = await createTempRoot();
    const file = new File(["abc"], "wafer.bin", { type: "application/octet-stream" });
    const manifest = await createManifest(file, {
      chunking: { chunkSize: 256 * 1024 }
    });

    const report = await verifyNodeFileManifest(join(root, "missing.bin"), manifest);

    expect(report.ok).toBe(false);
    expect(report.issues[0]).toMatchObject({
      code: "verification.file_not_found"
    });
    expect(report.issues[0]).not.toHaveProperty("details");
  });
});

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "large-image-ingest-node-verification-"));
  tempRoots.push(root);
  return root;
}
