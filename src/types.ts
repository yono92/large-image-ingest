export type IngestIssueSeverity = "error" | "warning";

export type IngestIssueCode =
  | "file.empty"
  | "file.too_large"
  | "file.too_small"
  | "file.mime_not_allowed"
  | "file.extension_not_allowed"
  | "chunk.invalid_size"
  | "transport.failed"
  | "transport.aborted"
  | ResumeConflictCode;

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

export type ResumeRecordSchemaVersion = "large-image-ingest.resume.v0.1";

export type ResumeRecordStatus =
  | "active"
  | "paused"
  | "failed"
  | "completed"
  | "canceled"
  | "expired";

export type ResumeCleanupPolicy = "delete-on-complete" | "mark-complete";

export type ResumeConflictCode =
  | "resume.record_not_found"
  | "resume.schema_unsupported"
  | "resume.file_mismatch"
  | "resume.chunking_mismatch"
  | "resume.transport_unsupported"
  | "resume.transport_mismatch"
  | "resume.expired"
  | "resume.store_failed";

export interface CompletedChunkRange {
  startIndex: number;
  endIndexInclusive: number;
}

export interface ResumeFileIdentity {
  name: string;
  sizeBytes: number;
  mediaType: string;
  lastModified?: number;
  fingerprint: FileFingerprint;
}

export interface ResumeChunkingIdentity {
  strategy: "fixed-size";
  chunkSizeBytes: number;
  totalBytes: number;
  totalChunks: number;
}

export interface ResumeTransportState {
  name?: string;
  uploadId: string;
  resumeToken?: string;
  expiresAt?: string;
  data?: Record<string, unknown>;
}

export interface ResumeProgress {
  status: ResumeRecordStatus;
  uploadedBytes: number;
  completedChunkRanges: CompletedChunkRange[];
  nextChunkIndex: number;
  lastErrorCode?: IngestIssueCode | ResumeConflictCode;
}

export interface ResumeRecord {
  schemaVersion: ResumeRecordSchemaVersion;
  id: string;
  manifest: IngestManifest;
  file: ResumeFileIdentity;
  chunking: ResumeChunkingIdentity;
  transport: ResumeTransportState;
  progress: ResumeProgress;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeStore {
  get(recordId: string): Promise<ResumeRecord | undefined>;
  put(record: ResumeRecord): Promise<void>;
  list(): Promise<ResumeRecord[]>;
  delete(recordId: string): Promise<void>;
}

export interface ResumeOptions {
  store: ResumeStore;
  cleanup?: ResumeCleanupPolicy;
}

export interface ManifestIdentityOverride {
  id: string;
  createdAt: string;
}

export type IngestEvent =
  | { type: "validated"; manifest: IngestManifest }
  | { type: "started"; manifest: IngestManifest; uploadId: string }
  | { type: "chunk:started"; manifestId: string; chunk: ChunkDescriptor }
  | { type: "chunk:completed"; manifestId: string; chunk: ChunkDescriptor; uploadedBytes: number; totalBytes: number }
  | { type: "retry"; manifestId: string; chunk: ChunkDescriptor; attempt: number; error: unknown }
  | { type: "resume:available"; recordId: string; manifestId: string; status: ResumeRecordStatus }
  | { type: "resume:started"; recordId: string; manifestId: string }
  | { type: "resume:checkpoint"; recordId: string; completedChunkRanges: CompletedChunkRange[] }
  | { type: "resume:conflict"; recordId?: string; code: ResumeConflictCode; error: unknown }
  | { type: "resume:expired"; recordId: string }
  | { type: "upload:paused"; recordId?: string }
  | { type: "upload:canceled"; recordId?: string }
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

export interface ResumeSessionContext extends UploadSessionContext {
  record: ResumeRecord;
}

export interface UploadSessionResult {
  uploadId: string;
  resumeToken?: string;
  expiresAt?: string;
  data?: Record<string, unknown>;
}

export interface UploadChunkResult {
  resumeToken?: string;
  expiresAt?: string;
  data?: Record<string, unknown>;
}

export interface UploadTransport {
  createSession(context: UploadSessionContext): Promise<UploadSessionResult>;
  resumeSession?(context: ResumeSessionContext): Promise<UploadSessionResult>;
  uploadChunk(context: UploadChunkContext): Promise<void | UploadChunkResult>;
  completeSession(context: UploadSessionContext & { uploadId: string }): Promise<void>;
}

export interface CreateIngestSessionOptions {
  chunking?: ChunkPlanOptions;
  manifestIdentity?: ManifestIdentityOverride;
  metadata?: Record<string, unknown>;
  onEvent?: (event: IngestEvent) => void;
  retries?: number;
  resume?: ResumeOptions;
  storage?: StorageTargetManifest;
  transport: UploadTransport;
  validation?: ValidationRules;
}
