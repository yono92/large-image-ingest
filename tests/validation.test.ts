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
});
