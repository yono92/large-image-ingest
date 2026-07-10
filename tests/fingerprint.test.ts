import { describe, expect, it } from "vitest";
import { createFastFingerprint } from "../src/fingerprint";

describe("createFastFingerprint", () => {
  it("is deterministic for the same file metadata", async () => {
    const options = {
      type: "image/tiff",
      lastModified: Date.UTC(2026, 0, 1)
    };
    const first = new File(["first"], "wafer.tif", options);
    const second = new File(["other"], "wafer.tif", options);

    await expect(createFastFingerprint(first)).resolves.toBe(await createFastFingerprint(second));
  });

  it("changes when observable file identity metadata changes", async () => {
    const first = new File(["same"], "wafer-a.tif", {
      type: "image/tiff",
      lastModified: Date.UTC(2026, 0, 1)
    });
    const second = new File(["same"], "wafer-b.tif", {
      type: "image/tiff",
      lastModified: Date.UTC(2026, 0, 1)
    });

    expect(await createFastFingerprint(first)).not.toBe(await createFastFingerprint(second));
  });
});
