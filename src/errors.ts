import type { IngestErrorCode, IngestErrorDetails } from "./types.js";

export class LargeImageIngestError extends Error {
  readonly code: IngestErrorCode;
  readonly details?: IngestErrorDetails;

  constructor(code: IngestErrorCode, message: string, details?: IngestErrorDetails) {
    super(message);
    this.name = "LargeImageIngestError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function isLargeImageIngestError(error: unknown): error is LargeImageIngestError {
  return error instanceof LargeImageIngestError;
}
