import { describe, expect, it } from "vitest";
import { createManifest } from "../src/manifest";

describe("createManifest", () => {
  it("creates a versioned original-preserving manifest", async () => {
    const file = new File(["inspection-data"], "wafer-aoi-001.tif", {
      type: "image/tiff",
      lastModified: Date.UTC(2026, 0, 1)
    });

    const manifest = await createManifest(file, {
      chunking: { chunkSize: 256 * 1024 },
      metadata: {
        lotId: "LOT-001",
        waferId: "W12"
      },
      retries: 3,
      storage: {
        kind: "nas",
        label: "fab-qc-nas",
        locationHint: "/inspection/inbox"
      },
      validation: {
        acceptedExtensions: ["tif", "tiff"],
        acceptedMimeTypes: ["image/tiff"]
      }
    });

    expect(manifest.schemaVersion).toBe("large-image-ingest.manifest.v1");
    expect(manifest.library.version).toBe("1.0.0");
    expect(manifest.original).toMatchObject({
      kind: "original",
      name: "wafer-aoi-001.tif",
      extension: "tif",
      sizeBytes: file.size,
      mediaType: "image/tiff",
      preservation: {
        required: true,
        allowedMutations: []
      }
    });
    expect(manifest.original.fingerprint.scope).toBe("file-metadata");
    expect(manifest.original.checksum).toMatchObject({
      algorithm: "sha256",
      scope: "whole-file"
    });
    expect(manifest.original.checksum?.value).toHaveLength(64);
    expect(manifest.chunking).toEqual({
      strategy: "fixed-size",
      chunkSizeBytes: 256 * 1024,
      totalBytes: file.size,
      totalChunks: 1,
      chunkRangesIncluded: false
    });
    expect(manifest.upload).toEqual({
      status: "pending",
      resumable: true,
      retryLimit: 3
    });
    expect(manifest.storage).toEqual({
      kind: "nas",
      label: "fab-qc-nas",
      locationHint: "/inspection/inbox"
    });
    expect(manifest.validation.ok).toBe(true);
  });

  it("records provided image metadata", async () => {
    const file = new File(["inspection-data"], "wafer-aoi-001.tif", { type: "image/tiff" });

    const manifest = await createManifest(file, {
      checksum: false,
      image: {
        format: "tiff",
        width: 4096,
        height: 2048,
        colorDepth: 16
      },
      validation: {
        minWidth: 1024,
        minHeight: 1024
      }
    });

    expect(manifest.image).toEqual({
      status: "provided",
      format: "tiff",
      width: 4096,
      height: 2048,
      colorDepth: 16
    });
    expect(manifest.validation.ok).toBe(true);
  });

  it("keeps validation failures inside the manifest", async () => {
    const file = new File(["bad"], "wafer.jpg", { type: "image/jpeg" });

    const manifest = await createManifest(file, {
      checksum: false,
      validation: {
        acceptedExtensions: ["tif"],
        acceptedMimeTypes: ["image/tiff"]
      }
    });

    expect(manifest.validation.ok).toBe(false);
    expect(manifest.validation.issues.map((issue) => issue.code)).toEqual([
      "file.mime_not_allowed",
      "file.extension_not_allowed"
    ]);
  });

  it("reports checksum mismatches inside the manifest", async () => {
    const file = new File(["abc"], "wafer.tif", { type: "image/tiff" });

    const manifest = await createManifest(file, {
      checksum: {
        expected: "0".repeat(64)
      }
    });

    expect(manifest.validation.ok).toBe(false);
    expect(manifest.validation.issues.map((issue) => issue.code)).toContain("checksum.mismatch");
  });

  it("honors deterministic manifest identity and explicit checksum omission", async () => {
    const file = new File(["inspection"], "wafer.tif", { type: "image/tiff" });
    const manifest = await createManifest(file, {
      checksum: false,
      manifestIdentity: {
        id: "manifest-fixed",
        createdAt: "2026-07-10T00:00:00.000Z"
      }
    });

    expect(manifest.id).toBe("manifest-fixed");
    expect(manifest.createdAt).toBe("2026-07-10T00:00:00.000Z");
    expect(manifest.original.checksum).toBeUndefined();
  });
});
