export type IngestIssueSeverity = "error" | "warning";

export type IngestIssueCode =
  | "file.empty"
  | "file.too_large"
  | "file.too_small"
  | "file.mime_not_allowed"
  | "file.extension_not_allowed"
  | "chunk.invalid_size"
  | "transport.failed"
  | "transport.aborted";

export interface IngestIssue {
  code: IngestIssueCode;
  message: string;
  severity: IngestIssueSeverity;
  details?: Record<string, unknown>;
}

export interface ValidationRules {
  acceptedExtensions?: readonly string[];
  acceptedMimeTypes?: readonly string[];
  maxBytes?: number;
  minBytes?: number;
  requireNonEmpty?: boolean;
}

export interface ValidationResult {
  ok: boolean;
  issues: IngestIssue[];
}

export interface IngestFileLike extends Blob {
  name: string;
  lastModified?: number;
}

export interface ChunkDescriptor {
  index: number;
  start: number;
  end: number;
  size: number;
}

export interface ChunkPlan {
  chunkSize: number;
  totalBytes: number;
  totalChunks: number;
  chunks: ChunkDescriptor[];
}

export interface ChunkPlanOptions {
  chunkSize?: number;
}

export interface OriginalImageManifest {
  name: string;
  size: number;
  type: string;
  lastModified?: number;
  fingerprint: string;
}

export interface IngestManifest {
  id: string;
  version: "0.1";
  createdAt: string;
  original: OriginalImageManifest;
  chunking: {
    chunkSize: number;
    totalChunks: number;
  };
  metadata: Record<string, unknown>;
  issues: IngestIssue[];
}

export type IngestEvent =
  | { type: "validated"; manifest: IngestManifest }
  | { type: "started"; manifest: IngestManifest; uploadId: string }
  | { type: "chunk:started"; manifestId: string; chunk: ChunkDescriptor }
  | { type: "chunk:completed"; manifestId: string; chunk: ChunkDescriptor; uploadedBytes: number; totalBytes: number }
  | { type: "retry"; manifestId: string; chunk: ChunkDescriptor; attempt: number; error: unknown }
  | { type: "completed"; manifest: IngestManifest; uploadId: string }
  | { type: "failed"; manifestId?: string; error: unknown };

export interface UploadSessionContext {
  manifest: IngestManifest;
  file: IngestFileLike;
  signal: AbortSignal;
}

export interface UploadChunkContext extends UploadSessionContext {
  uploadId: string;
  chunk: ChunkDescriptor;
  body: Blob;
}

export interface UploadTransport {
  createSession(context: UploadSessionContext): Promise<{ uploadId: string }>;
  uploadChunk(context: UploadChunkContext): Promise<void>;
  completeSession(context: UploadSessionContext & { uploadId: string }): Promise<void>;
}

export interface CreateIngestSessionOptions {
  chunking?: ChunkPlanOptions;
  metadata?: Record<string, unknown>;
  onEvent?: (event: IngestEvent) => void;
  retries?: number;
  transport: UploadTransport;
  validation?: ValidationRules;
}
