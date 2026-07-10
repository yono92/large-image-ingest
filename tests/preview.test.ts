import { describe, expect, it } from "vitest";
import { createManifest } from "../src/manifest";
import { createPreviewDerivative } from "../src/preview";
import type { IngestFileLike } from "../src/types";

async function createLargeManifest() {
  const file = {
    name: "large-wafer.tif",
    type: "image/tiff",
    size: 10 * 1024 * 1024 * 1024,
    lastModified: Date.UTC(2026, 6, 10),
    slice() {
      throw new Error("slice should not be called");
    },
    stream() {
      throw new Error("stream should not be called");
    },
    arrayBuffer() {
      throw new Error("arrayBuffer should not be called");
    },
    text() {
      throw new Error("text should not be called");
    }
  } as unknown as IngestFileLike;

  return createManifest(file, {
    checksum: false,
    validation: {
      maxBytes: 20 * 1024 * 1024 * 1024,
      acceptedMimeTypes: ["image/tiff"],
      acceptedExtensions: ["tif", "tiff"]
    }
  });
}

describe("preview derivatives", () => {
  it("creates planned, created, and failed preview descriptors", async () => {
    const manifest = await createLargeManifest();

    const planned = createPreviewDerivative({
      manifest,
      id: "preview-planned",
      kind: "preview",
      status: "planned",
      width: 1024,
      height: 1024
    });
    const created = createPreviewDerivative({
      manifest,
      id: "thumbnail-created",
      kind: "thumbnail",
      status: "created",
      mediaType: "image/jpeg",
      width: 256,
      height: 256,
      sizeBytes: 40_000,
      storage: {
        kind: "object",
        label: "preview-bucket",
        locationHint: "thumbnails/large-wafer-256.jpg"
      },
      provenance: {
        generator: "app-preview-worker",
        environment: "browser"
      }
    });
    const failed = createPreviewDerivative({
      manifest,
      id: "preview-failed",
      kind: "preview",
      status: "failed",
      failure: {
        code: "preview.decode_failed",
        message: "Preview generation failed."
      }
    });

    expect(planned).toMatchObject({ id: "preview-planned", kind: "preview", status: "planned" });
    expect(created).toMatchObject({ id: "thumbnail-created", kind: "thumbnail", status: "created" });
    expect(failed).toMatchObject({ id: "preview-failed", kind: "preview", status: "failed" });
  });

  it("does not read, decode, rewrite, or embed source bytes", async () => {
    const manifest = await createLargeManifest();

    const preview = createPreviewDerivative({
      manifest,
      id: "preview-reference",
      kind: "preview",
      status: "created",
      mediaType: "image/jpeg",
      storage: {
        kind: "inline-reference",
        label: "caller-owned-object-url"
      }
    });

    expect(JSON.stringify(preview)).not.toContain("inspection-data");
    expect(preview.storage).toEqual({
      kind: "inline-reference",
      label: "caller-owned-object-url"
    });
    expect(() =>
      createPreviewDerivative({
        manifest,
        id: "unsafe-preview",
        kind: "preview",
        status: "created",
        storage: {
          kind: "custom",
          metadata: {
            base64: "embedded-preview-payload"
          }
        }
      })
    ).toThrow(/embedded derivative payload/i);
  });
});
