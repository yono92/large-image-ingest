import { describe, expect, it } from "vitest";
import { LargeImageIngestError, isLargeImageIngestError } from "../src/errors";

describe("LargeImageIngestError", () => {
  it("preserves typed code and details for public derivative errors", () => {
    const error = new LargeImageIngestError(
      "derivative.tile.invalid",
      "Invalid tile descriptor.",
      { derivativeId: "tile-1" }
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("LargeImageIngestError");
    expect(error.code).toBe("derivative.tile.invalid");
    expect(error.details).toEqual({ derivativeId: "tile-1" });
    expect(isLargeImageIngestError(error)).toBe(true);
    expect(isLargeImageIngestError(new Error("other"))).toBe(false);
  });
});
