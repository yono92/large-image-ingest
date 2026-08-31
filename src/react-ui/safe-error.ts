import type { IngestErrorCode } from "../types.js";
import type { SafeUiError, SafeUiErrorCategory } from "./types.js";

export function toSafeUiError(error: unknown): SafeUiError {
  const code = readCode(error);
  const category = categorize(code);
  return {
    category,
    ...(code ? { code } : {}),
    title: titleFor(category),
    guidance: guidanceFor(category),
    retryable: readRetryable(error)
  };
}

function readCode(error: unknown): IngestErrorCode | string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function readRetryable(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "retryable" in error && error.retryable === true);
}

function categorize(code: string | undefined): SafeUiErrorCategory {
  if (!code) return "unknown";
  if (code === "transport.paused") return "transport";
  if (
    code === "transport.canceled" ||
    code === "session.aborted" ||
    code === "checksum.canceled"
  ) return "cancellation";
  if (code === "resume.store_failed") return "cleanup";
  if (code.startsWith("resume.")) return "compatibility";
  if (code.startsWith("verification.")) return "verification";
  if (
    code === "validation.failed" ||
    code.startsWith("file.") ||
    code.startsWith("metadata.") ||
    code.startsWith("image.") ||
    code === "checksum.mismatch" ||
    code === "checksum.execution_failed"
  ) return "validation";
  if (code.startsWith("transport.")) return "transport";
  return "unknown";
}

function titleFor(category: SafeUiErrorCategory): string {
  switch (category) {
    case "validation": return "Source validation failed";
    case "compatibility": return "Recovery source is not compatible";
    case "transport": return "Upload transport failed";
    case "cancellation": return "Upload was canceled";
    case "cleanup": return "Recovery cleanup needs attention";
    case "observer": return "Status reporting failed";
    case "verification": return "Stored verification failed";
    case "unknown": return "Upload needs attention";
  }
}

function guidanceFor(category: SafeUiErrorCategory): string {
  switch (category) {
    case "validation": return "Select a compliant source or correct the required metadata.";
    case "compatibility": return "Reselect the original source or choose another compatible recovery record.";
    case "transport": return "Retry when available, or cancel and safely replace the source.";
    case "cancellation": return "Select the source again when you are ready to restart.";
    case "cleanup": return "The transfer result remains authoritative; refresh recovery before retrying cleanup.";
    case "observer": return "The ingest operation remains authoritative even though status reporting failed.";
    case "verification": return "The transfer remains complete. Retry stored-original verification when available.";
    case "unknown": return "Review the application callback for the typed cause and choose a safe next action.";
  }
}
