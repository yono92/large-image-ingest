import type { IngestError, IngestErrorCode, IngestErrorDetails } from "./types.js";

export class LargeImageIngestError extends Error implements IngestError {
  readonly code: IngestErrorCode;
  readonly details?: IngestErrorDetails;
  readonly retryable: boolean;

  constructor(
    code: IngestErrorCode,
    message: string,
    details?: IngestErrorDetails,
    retryable = false
  ) {
    super(message);
    this.name = "LargeImageIngestError";
    this.code = code;
    this.retryable = retryable;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function isLargeImageIngestError(error: unknown): error is LargeImageIngestError {
  return error instanceof LargeImageIngestError;
}
