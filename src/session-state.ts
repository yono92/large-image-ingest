import type {
  IngestError,
  IngestErrorCode,
  IngestIssueCode,
  ResumeCompatibilityResult,
  ResumeConflictCode,
  UploadSessionSnapshot
} from "./types.js";
import { cloneReceipt } from "./session-receipts.js";

export function combineAbortSignals(primary: AbortSignal, secondary?: AbortSignal): AbortSignal {
  if (!secondary || secondary === primary) return primary;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([primary, secondary]);
  }
  const controller = new AbortController();
  const abort = (signal: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(signal.reason);
  };
  if (primary.aborted) abort(primary);
  else primary.addEventListener("abort", () => abort(primary), { once: true });
  if (secondary.aborted) abort(secondary);
  else secondary.addEventListener("abort", () => abort(secondary), { once: true });
  return controller.signal;
}

export function compatibilityConflictCode(
  reason: ResumeCompatibilityResult["reason"]
): ResumeConflictCode {
  switch (reason) {
    case "source_mismatch": return "resume.file_mismatch";
    case "identity_missing": return "resume.identity_missing";
    case "chunking_mismatch": return "resume.chunking_mismatch";
    case "transport_unsupported": return "resume.transport_unsupported";
    case "transport_mismatch": return "resume.transport_mismatch";
    case "profile_mismatch": return "resume.profile_mismatch";
    case "receipt_missing": return "resume.receipt_missing";
    case "expired": return "resume.expired";
    case "terminal": return "resume.record_not_found";
    case "compatible":
    case "legacy_upgrade_available":
      return "resume.record_invalid";
  }
}

export function compatibilityConflictMessage(reason: ResumeCompatibilityResult["reason"]): string {
  switch (reason) {
    case "source_mismatch": return "The selected file does not match the stored resume record.";
    case "identity_missing": return "The stored resume record lacks trustworthy whole-file source identity.";
    case "chunking_mismatch": return "The active chunking options do not match the stored resume record.";
    case "transport_unsupported": return "The configured upload transport does not support persistent resume.";
    case "transport_mismatch": return "The stored resume transport does not match the configured transport.";
    case "profile_mismatch": return "The stored resume profile does not match the configured domain profile.";
    case "receipt_missing": return "The stored resume record lacks required durable provider receipts.";
    case "expired": return "The stored remote resume handle has expired.";
    case "terminal": return "The resume record is terminal and cannot be resumed.";
    case "compatible":
    case "legacy_upgrade_available":
      return "The resume record is not compatible.";
  }
}

export function cloneSnapshot(snapshot: UploadSessionSnapshot): UploadSessionSnapshot {
  return {
    ...snapshot,
    transportSession: snapshot.transportSession
      ? { ...snapshot.transportSession, remote: cloneRecord(snapshot.transportSession.remote) }
      : undefined,
    chunkPlan: {
      ...snapshot.chunkPlan,
      chunks: snapshot.chunkPlan.chunks.map((chunk) => ({ ...chunk }))
    },
    completedChunks: snapshot.completedChunks.map(cloneReceipt),
    failedChunk: snapshot.failedChunk ? { ...snapshot.failedChunk } : undefined,
    parallel: snapshot.parallel ? {
      ...snapshot.parallel,
      ambiguousChunkIndexes: [...snapshot.parallel.ambiguousChunkIndexes]
    } : undefined,
    chunkOutcomes: snapshot.chunkOutcomes ? { ...snapshot.chunkOutcomes } : undefined,
    error: snapshot.error ? { ...snapshot.error } : undefined,
    redactions: snapshot.redactions
      ? {
          transportSession: snapshot.redactions.transportSession
            ? [...snapshot.redactions.transportSession]
            : undefined,
          receipts: snapshot.redactions.receipts ? [...snapshot.redactions.receipts] : undefined
        }
      : undefined
  };
}

export function redactSnapshot(snapshot: UploadSessionSnapshot): UploadSessionSnapshot {
  const redacted = cloneSnapshot(snapshot);
  const transportRedactions: string[] = [];
  const receiptRedactions: string[] = [];

  if (redacted.transportSession) {
    if (redacted.transportSession.resumeToken !== undefined) {
      delete redacted.transportSession.resumeToken;
      transportRedactions.push("resumeToken");
    }

    if (redacted.transportSession.secretsRef !== undefined) {
      delete redacted.transportSession.secretsRef;
      transportRedactions.push("secretsRef");
    }

    if (redacted.transportSession.remote !== undefined) {
      delete redacted.transportSession.remote;
      transportRedactions.push("remote");
    }
  }

  redacted.completedChunks = redacted.completedChunks.map((receipt) => {
    const transport = { ...receipt.transport };

    if (transport.etag !== undefined) {
      delete transport.etag;
      receiptRedactions.push("transport.etag");
    }

    if (transport.location !== undefined) {
      delete transport.location;
      receiptRedactions.push("transport.location");
    }

    if (transport.opaque !== undefined) {
      delete transport.opaque;
      receiptRedactions.push("transport.opaque");
    }

    return {
      ...receipt,
      transport
    };
  });

  if (transportRedactions.length > 0 || receiptRedactions.length > 0) {
    redacted.redactions = {
      transportSession: unique(transportRedactions),
      receipts: unique(receiptRedactions)
    };
  }

  return redacted;
}

export function cloneRecord<T extends Record<string, unknown> | undefined>(record: T): T {
  return record ? ({ ...record } as T) : record;
}

export function unique(values: readonly string[]): string[] | undefined {
  const result = Array.from(new Set(values));
  return result.length > 0 ? result : undefined;
}

export function createIngestError(
  code: IngestErrorCode,
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

export function isIngestError(error: unknown): error is IngestError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      "retryable" in error
  );
}

export function isNonRetryableIngestError(error: unknown): error is IngestError {
  return isIngestError(error) && error.retryable === false;
}

export function isIngestIssueErrorCode(code: IngestErrorCode): code is IngestIssueCode {
  return code !== "manifest.failed" &&
    code !== "session.failed" &&
    code !== "validation.failed" &&
    code !== "session.aborted" &&
    code !== "session.invalid_state" &&
    code !== "session.snapshot_file_mismatch";
}

export function toSnapshotError(error: unknown): UploadSessionSnapshot["error"] {
  if (isIngestError(error)) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable
    };
  }

  return {
    code: "transport.failed",
    message: toErrorMessage(error, "Upload failed."),
    retryable: false
  };
}

export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return fallback;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export const CURRENT_RESUME_SCHEMA_VERSION = "large-image-ingest.resume.v0.3";
export const PARALLEL_RESUME_SCHEMA_VERSION = "large-image-ingest.resume.v0.4";
export const PARALLEL_POLICY_ID = "parallel-worker-pool-v1";
export const CHUNK_INTEGRITY_POLICY_ID = "chunk-sha256-base64-v1";
