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

export type IngestManifestSchemaVersion = "large-image-ingest.manifest.v0.1";

export type FingerprintAlgorithm = "metadata-sha256" | "metadata-fallback";

export interface FileFingerprint {
  algorithm: FingerprintAlgorithm;
  scope: "file-metadata";
  value: string;
}

export interface OriginalImageManifest {
  kind: "original";
  name: string;
  extension?: string;
  sizeBytes: number;
  mediaType: string;
  lastModifiedAt?: string;
  fingerprint: FileFingerprint;
  preservation: {
    required: true;
    allowedMutations: [];
  };
}

export interface ImageInspectionManifest {
  status: "not_inspected";
  format?: string;
  width: null;
  height: null;
  colorDepth: null;
}

export interface UploadManifest {
  status: "pending";
  resumable: true;
  retryLimit: number;
  transport?: {
    name: string;
  };
}

export interface StorageTargetManifest {
  kind: "s3" | "tus" | "nas" | "filesystem" | "custom";
  label?: string;
  locationHint?: string;
}

export interface DerivativeManifest {
  id: string;
  kind: "preview" | "thumbnail" | "tile" | "metadata" | "custom";
  status: "planned" | "created" | "failed";
  mediaType?: string;
  width?: number;
  height?: number;
  source: "original";
}

export interface IngestManifest {
  schemaVersion: IngestManifestSchemaVersion;
  id: string;
  createdAt: string;
  library: {
    name: "large-image-ingest";
    version: "0.0.0";
  };
  original: OriginalImageManifest;
  image: ImageInspectionManifest;
  chunking: {
    strategy: "fixed-size";
    chunkSizeBytes: number;
    totalBytes: number;
    totalChunks: number;
    chunkRangesIncluded: false;
  };
  upload: UploadManifest;
  storage?: StorageTargetManifest;
  metadata: Record<string, unknown>;
  derivatives: DerivativeManifest[];
  validation: ValidationResult;
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
  storage?: StorageTargetManifest;
  transport: UploadTransport;
  validation?: ValidationRules;
}
