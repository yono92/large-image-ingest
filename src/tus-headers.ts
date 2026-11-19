// Part of tus.ts, split out to keep modules under 500 lines; public exports stay on tus.ts.
import type { IngestError, IngestIssueCode } from "./types.js";

export function readRequiredOffset(response: Response): number {
  const rawOffset = response.headers.get("Upload-Offset");

  if (!rawOffset) {
    throw createTusError("transport.offset_mismatch", "tus response did not include Upload-Offset.", false);
  }

  // tus defines Upload-Offset as a non-negative decimal integer; Number()
  // alone would also accept "0x10" and "1e3".
  const offset = /^\d+$/.test(rawOffset) ? Number(rawOffset) : Number.NaN;

  if (!Number.isSafeInteger(offset)) {
    throw createTusError("transport.offset_mismatch", "tus response included an invalid Upload-Offset.", false, {
      offset: rawOffset
    });
  }

  return offset;
}

export function readUploadExpires(response: Response): string | undefined {
  const raw = response.headers.get("Upload-Expires");
  if (!raw) {
    return undefined;
  }

  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) {
    throw createTusError(
      "transport.failed",
      "tus response included an invalid Upload-Expires value.",
      false
    );
  }

  return new Date(timestamp).toISOString();
}

export function assertUploadStillExists(response: Response): void {
  if ([403, 404, 410].includes(response.status)) {
    throw createTusError("transport.session_expired", "tus upload session is unavailable or expired.", false, {
      status: response.status
    });
  }
}

export function parseHeaderList(value: string | null): string[] {
  return value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function createTusError(
  code: IngestIssueCode,
  message: string,
  retryable: boolean,
  details?: Record<string, unknown>
): IngestError {
  const error = new Error(message) as IngestError;
  error.code = code;
  error.retryable = retryable;

  if (details) {
    error.details = details;
  }

  return error;
}

export function nowIso(): string {
  return new Date().toISOString();
}
