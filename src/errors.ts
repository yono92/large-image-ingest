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

export class ChecksumCanceledError extends LargeImageIngestError {
  readonly retryable = false;

  constructor() {
    super("checksum.canceled", "Checksum calculation was canceled.");
    this.name = "ChecksumCanceledError";
  }
}

export class ChecksumExecutionError extends LargeImageIngestError {
  readonly retryable = true;

  constructor(message = "Checksum execution failed.") {
    super("checksum.execution_failed", message);
    this.name = "ChecksumExecutionError";
  }
}
