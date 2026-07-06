import { describe, expect, it } from "vitest";

import {
  LargeImageIngestError,
  isLargeImageIngestError,
  type IngestError
} from "../src/core";

describe("LargeImageIngestError", () => {
  it("exposes stable public error fields", () => {
    const error: IngestError = new LargeImageIngestError(
      "session.invalid_state",
      "Session cannot transition from the current state.",
      { status: "completed" },
      false
    );

    expect(isLargeImageIngestError(error)).toBe(true);
    expect(error).toMatchObject({
      name: "LargeImageIngestError",
      code: "session.invalid_state",
      message: "Session cannot transition from the current state.",
      details: { status: "completed" },
      retryable: false
    });
  });
});
