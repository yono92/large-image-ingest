import { describe, expect, it } from "vitest";
import { validateFile } from "../src/validation";

describe("validateFile", () => {
  it("accepts matching image constraints", () => {
    const file = new File(["data"], "wafer.tif", { type: "image/tiff" });

    const result = validateFile(file, {
      acceptedExtensions: ["tif", "tiff"],
      acceptedMimeTypes: ["image/tiff"],
      maxBytes: 1024
    });

    expect(result.ok).toBe(true);
  });

  it("reports extension and size failures", () => {
    const file = new File(["data"], "wafer.jpg", { type: "image/jpeg" });

    const result = validateFile(file, {
      acceptedExtensions: ["tif"],
      maxBytes: 2
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "file.too_large",
      "file.extension_not_allowed"
    ]);
  });

  it("reports missing required metadata", () => {
    const file = new File(["data"], "wafer.tif", { type: "image/tiff" });

    const result = validateFile(
      file,
      {
        requiredMetadata: ["lotId", "waferId"]
      },
      {
        lotId: "LOT-001"
      }
    );

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(["metadata.required_missing"]);
    expect(result.issues[0]?.path).toBe("metadata.waferId");
  });

  it("reports unavailable dimensions when dimension rules are configured without image metadata", () => {
    const file = new File(["data"], "wafer.tif", { type: "image/tiff" });

    const result = validateFile(file, {
      minWidth: 1024,
      minHeight: 1024
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(["image.dimensions_unavailable"]);
  });

  it("validates provided dimensions", () => {
    const file = new File(["data"], "wafer.tif", { type: "image/tiff" });

    const result = validateFile(
      file,
      {
        minWidth: 1024,
        maxHeight: 4096
      },
      {},
      {
        width: 512,
        height: 8192
      }
    );

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "image.width_too_small",
      "image.height_too_large"
    ]);
  });

  it("reports empty, minimum-size, and MIME failures together", () => {
    const file = new File([], "empty.tif", { type: "application/octet-stream" });
    const result = validateFile(file, {
      minBytes: 1,
      acceptedMimeTypes: ["image/tiff"]
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "file.empty",
      "file.too_small",
      "file.mime_not_allowed"
    ]);
  });
});
