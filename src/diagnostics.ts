import type {
  IngestEvent,
  IngestCompletionEvidence,
  IngestCompletionEvidenceSchemaVersion,
  IngestCompletionStatus,
  IngestIssueCode,
  IngestIssueSeverity,
  ResumeChunkingIdentity,
  ResumeCleanupOperation,
  ResumeFileIdentity,
  ResumeProgress,
  ResumeRecord,
  ResumeRecordSchemaVersion,
  ResumeRecordStatus,
  UploadSessionSnapshot,
  UploadSessionStatus,
  VerificationIssueCode,
  VerificationResult
} from "./types.js";

export interface SafeProgressSummary {
  uploadedBytes: number;
  totalBytes: number;
}

export interface SafeErrorSummary {
  code: IngestIssueCode | VerificationIssueCode | string;
  message: string;
  retryable?: boolean | undefined;
}

export interface RedactionSummary {
  fields: readonly string[];
}

export interface SafeEventSummary {
  type: IngestEvent["type"];
  manifestId?: string | undefined;
  recordId?: string | undefined;
  uploadId?: string | undefined;
  status?: UploadSessionStatus | ResumeRecordStatus | undefined;
  progress?: SafeProgressSummary | undefined;
  chunkIndex?: number | undefined;
  attempt?: number | undefined;
  cleanupOperation?: ResumeCleanupOperation | undefined;
  error?: SafeErrorSummary | undefined;
  redactions?: RedactionSummary | undefined;
  completion?: SafeCompletionSummary | undefined;
}

export interface SafeCompletionSummary {
  schemaVersion: IngestCompletionEvidenceSchemaVersion;
  id: string;
  manifestId: string;
  status: IngestCompletionStatus;
  producerVersion: string;
  transportName: string;
  totalBytes: number;
  totalChunks: number;
  acknowledgedChunks: number;
  receiptDigestAlgorithm: "sha256";
  sourceChecksumAlgorithm?: string | undefined;
  storedChecksumAlgorithm?: string | undefined;
  createdAt: string;
  completedAt: string;
  verifiedAt?: string | undefined;
}

export interface RedactedSnapshotResult {
  snapshot: UploadSessionSnapshot;
  redactions?: RedactionSummary | undefined;
}

export interface RedactedResumeRecord {
  schemaVersion: ResumeRecordSchemaVersion;
  id: string;
  manifestId: string;
  file: ResumeFileIdentity;
  chunking: ResumeChunkingIdentity;
  transport: {
    name?: string | undefined;
    uploadId?: string | undefined;
  };
  progress: ResumeProgress;
  createdAt: string;
  updatedAt: string;
  redactions?: RedactionSummary | undefined;
}

export interface SafeVerificationSummary {
  ok: boolean;
  issues: readonly {
    code: VerificationIssueCode | IngestIssueCode;
    path?: string | undefined;
    severity: IngestIssueSeverity;
  }[];
}

export function createSafeEventSummary(event: IngestEvent): SafeEventSummary {
  switch (event.type) {
    case "validated":
      return withRedactions({
        type: event.type,
        manifestId: event.manifest.id
      }, ["manifest"]);

    case "started":
      return withRedactions({
        type: event.type,
        manifestId: event.manifest.id,
        uploadId: event.uploadId
      }, ["manifest"]);

    case "completed":
      return withRedactions({
        type: event.type,
        manifestId: event.manifest.id,
        completion: createSafeCompletionSummary(event.evidence)
      }, ["manifest", "uploadId", "evidence.checksumValues", "evidence.storage"]);

    case "snapshot": {
      const redacted = redactUploadSessionSnapshot(event.snapshot);
      return withRedactions({
        type: event.type,
        manifestId: redacted.snapshot.manifestId,
        status: redacted.snapshot.status,
        progress: {
          uploadedBytes: redacted.snapshot.uploadedBytes,
          totalBytes: redacted.snapshot.totalBytes
        }
      }, redacted.redactions?.fields);
    }

    case "paused":
    case "canceled": {
      const redacted = redactUploadSessionSnapshot(event.snapshot);
      return withRedactions({
        type: event.type,
        manifestId: redacted.snapshot.manifestId,
        status: redacted.snapshot.status,
        progress: {
          uploadedBytes: redacted.snapshot.uploadedBytes,
          totalBytes: redacted.snapshot.totalBytes
        }
      }, redacted.redactions?.fields);
    }

    case "chunk:started":
      return {
        type: event.type,
        manifestId: event.manifestId,
        chunkIndex: event.chunk.index
      };

    case "chunk:completed":
      return {
        type: event.type,
        manifestId: event.manifestId,
        chunkIndex: event.chunk.index,
        progress: {
          uploadedBytes: event.uploadedBytes,
          totalBytes: event.totalBytes
        }
      };

    case "retry":
      return {
        type: event.type,
        manifestId: event.manifestId,
        chunkIndex: event.chunk.index,
        attempt: event.attempt,
        error: toSafeErrorSummary(event.error)
      };

    case "resume:available":
      return {
        type: event.type,
        manifestId: event.manifestId,
        recordId: event.recordId,
        status: event.status
      };

    case "resume:started":
      return {
        type: event.type,
        manifestId: event.manifestId,
        recordId: event.recordId
      };

    case "resume:checkpoint":
      return {
        type: event.type,
        recordId: event.recordId
      };

    case "resume:conflict":
      return {
        type: event.type,
        recordId: event.recordId,
        error: toSafeErrorSummary(event.error, event.code)
      };

    case "resume:cleanup-failed":
      return {
        type: event.type,
        recordId: event.recordId,
        cleanupOperation: event.operation,
        error: toSafeErrorSummary(event.error, event.code)
      };

    case "resume:expired":
      return {
        type: event.type,
        recordId: event.recordId,
        status: "expired"
      };

    case "upload:paused":
      return {
        type: event.type,
        recordId: event.recordId,
        status: "paused"
      };

    case "upload:canceled":
      return {
        type: event.type,
        recordId: event.recordId,
        status: "canceled"
      };

    case "failed":
      return {
        type: event.type,
        manifestId: event.manifestId,
        error: toSafeErrorSummary(event.error)
      };
  }
}

export function redactUploadSessionSnapshot(snapshot: UploadSessionSnapshot): RedactedSnapshotResult {
  const redactions: string[] = [];
  const redacted: UploadSessionSnapshot = {
    ...snapshot,
    transportSession: snapshot.transportSession ? { ...snapshot.transportSession } : undefined,
    chunkPlan: {
      ...snapshot.chunkPlan,
      chunks: snapshot.chunkPlan.chunks.map((chunk) => ({ ...chunk }))
    },
    completedChunks: snapshot.completedChunks.map((receipt) => ({
      ...receipt,
      checksum: receipt.checksum ? { ...receipt.checksum } : undefined,
      transport: {
        ...receipt.transport,
        opaque: receipt.transport.opaque ? { ...receipt.transport.opaque } : undefined
      }
    })),
    failedChunk: snapshot.failedChunk ? { ...snapshot.failedChunk } : undefined,
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

  if (redacted.transportSession) {
    if (redacted.transportSession.resumeToken !== undefined) {
      delete redacted.transportSession.resumeToken;
      redactions.push("snapshot.transportSession.resumeToken");
    }

    if (redacted.transportSession.secretsRef !== undefined) {
      delete redacted.transportSession.secretsRef;
      redactions.push("snapshot.transportSession.secretsRef");
    }

    if (redacted.transportSession.remote !== undefined) {
      delete redacted.transportSession.remote;
      redactions.push("snapshot.transportSession.remote");
    }
  }

  redacted.completedChunks = redacted.completedChunks.map((receipt) => {
    const transport = { ...receipt.transport };

    if (transport.etag !== undefined) {
      delete transport.etag;
      redactions.push("snapshot.completedChunks.transport.etag");
    }

    if (transport.location !== undefined) {
      delete transport.location;
      redactions.push("snapshot.completedChunks.transport.location");
    }

    if (transport.opaque !== undefined) {
      delete transport.opaque;
      redactions.push("snapshot.completedChunks.transport.opaque");
    }

    return {
      ...receipt,
      transport
    };
  });

  const fields = unique(redactions);
  if (fields.length > 0) {
    redacted.redactions = {
      transportSession: fields.filter((field) => field.startsWith("snapshot.transportSession.")),
      receipts: fields.filter((field) => field.startsWith("snapshot.completedChunks."))
    };
  }

  return {
    snapshot: redacted,
    redactions: fields.length > 0 ? { fields } : undefined
  };
}

export function redactResumeRecord(record: ResumeRecord): RedactedResumeRecord {
  const redactions = ["resume.manifest"];
  const transport: RedactedResumeRecord["transport"] = {};

  if (record.transport.name !== undefined) {
    transport.name = record.transport.name;
  }

  if (record.transport.uploadId !== undefined) {
    redactions.push("resume.transport.uploadId");
  }

  if (record.transport.resumeToken !== undefined) {
    redactions.push("resume.transport.resumeToken");
  }

  if (record.transport.data !== undefined) {
    redactions.push("resume.transport.data");
  }

  if (record.schemaVersion !== "large-image-ingest.resume.v0.1") {
    redactions.push("resume.receipts");
  }

  if (record.schemaVersion === "large-image-ingest.resume.v0.3") {
    redactions.push("resume.file.contentIdentity");
  }

  const file: ResumeFileIdentity = {
    name: record.file.name,
    sizeBytes: record.file.sizeBytes,
    mediaType: record.file.mediaType,
    fingerprint: { ...record.file.fingerprint }
  };
  if (record.file.lastModified !== undefined) {
    file.lastModified = record.file.lastModified;
  }

  return {
    schemaVersion: record.schemaVersion,
    id: record.id,
    manifestId: record.manifest.id,
    file,
    chunking: { ...record.chunking },
    transport,
    progress: {
      ...record.progress,
      completedChunkRanges: record.progress.completedChunkRanges.map((range) => ({ ...range }))
    },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    redactions: {
      fields: unique(redactions)
    }
  };
}

export function createSafeCompletionSummary(
  evidence: IngestCompletionEvidence
): SafeCompletionSummary {
  const summary: SafeCompletionSummary = {
    schemaVersion: evidence.schemaVersion,
    id: evidence.id,
    manifestId: evidence.manifest.id,
    status: evidence.status,
    producerVersion: evidence.producer.version,
    transportName: evidence.upload.transportName,
    totalBytes: evidence.upload.totalBytes,
    totalChunks: evidence.upload.totalChunks,
    acknowledgedChunks: evidence.upload.acknowledgedChunks,
    receiptDigestAlgorithm: evidence.upload.receiptDigest.algorithm,
    createdAt: evidence.createdAt,
    completedAt: evidence.completedAt
  };

  if (evidence.source.checksum) {
    summary.sourceChecksumAlgorithm = evidence.source.checksum.algorithm;
  }
  if (evidence.verification) {
    summary.storedChecksumAlgorithm = evidence.verification.storedChecksum.algorithm;
    summary.verifiedAt = evidence.verification.verifiedAt;
  }

  return summary;
}

export function createSafeVerificationSummary(result: VerificationResult): SafeVerificationSummary {
  return {
    ok: result.ok,
    issues: result.issues.map((issue) => ({
      code: issue.code,
      path: issue.path,
      severity: issue.severity
    }))
  };
}

function withRedactions<T extends SafeEventSummary>(
  summary: T,
  redactions: readonly string[] | undefined
): T {
  const fields = unique(redactions ?? []);

  if (fields.length === 0) {
    return summary;
  }

  return {
    ...summary,
    redactions: { fields }
  };
}

function toSafeErrorSummary(error: unknown, fallbackCode = "unknown"): SafeErrorSummary {
  const record = isRecord(error) ? error : undefined;
  const code = typeof record?.code === "string" ? record.code : fallbackCode;
  const rawMessage = typeof record?.message === "string"
    ? record.message
    : error instanceof Error
      ? error.message
      : "Operation failed.";
  const retryable = typeof record?.retryable === "boolean" ? record.retryable : undefined;
  const summary: SafeErrorSummary = {
    code,
    message: sanitizeErrorMessage(rawMessage)
  };

  if (retryable !== undefined) {
    summary.retryable = retryable;
  }

  return summary;
}

function sanitizeErrorMessage(message: string): string {
  if (
    /(?:https?|s3|file):\/\//i.test(message) ||
    /credential|authorization|presigned|resume token/i.test(message) ||
    /\b[a-f0-9]{32,}\b/i.test(message)
  ) {
    return "Error details redacted.";
  }

  return message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}
