export type IngestIssueSeverity = "error" | "warning";

export type IngestIssueCode =
  | "file.empty"
  | "file.too_large"
  | "file.too_small"
  | "file.mime_not_allowed"
  | "file.extension_not_allowed"
  | "metadata.required_missing"
  | "checksum.mismatch"
  | "image.dimensions_unavailable"
  | "image.width_too_small"
  | "image.width_too_large"
  | "image.height_too_small"
  | "image.height_too_large"
  | "chunk.invalid_size"
  | "transport.failed"
  | "transport.aborted";

export type IngestErrorCode =
  | IngestIssueCode
  | "manifest.failed"
  | "session.failed"
  | "validation.failed"
  | "session.aborted"
  | "session.invalid_state"
  | "session.snapshot_file_mismatch";

export interface IngestIssue {
  code: IngestIssueCode;
  message: string;
  severity: IngestIssueSeverity;
  path?: string;
  details?: Record<string, unknown>;
}

export interface ValidationRules {
  acceptedExtensions?: readonly string[];
  acceptedMimeTypes?: readonly string[];
  maxBytes?: number;
  maxHeight?: number;
  maxWidth?: number;
  minHeight?: number;
  minBytes?: number;
  minWidth?: number;
  requireNonEmpty?: boolean;
  requiredMetadata?: readonly string[];
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

export type ChecksumAlgorithm = "sha256";

export interface ChecksumProgress {
  loadedBytes: number;
  totalBytes: number;
  chunkIndex: number;
  totalChunks: number;
}

export interface ChecksumOptions {
  algorithm?: ChecksumAlgorithm;
  chunkSize?: number;
  expected?: string;
  onProgress?: (progress: ChecksumProgress) => void;
  required?: boolean;
}

export interface FileChecksum {
  algorithm: ChecksumAlgorithm;
  calculatedAt: string;
  chunkSizeBytes: number;
  scope: "whole-file";
  value: string;
}

export interface ImageMetadataInput {
  colorDepth?: number;
  format?: string;
  height?: number;
  width?: number;
}

export type IngestManifestSchemaVersion = "large-image-ingest.manifest.v1";

export type FingerprintAlgorithm = "metadata-sha256" | "metadata-fallback";

export interface FileFingerprint {
  algorithm: FingerprintAlgorithm;
  scope: "file-metadata";
  value: string;
}

export interface OriginalImageManifest {
  kind: "original";
  name: string;
  checksum?: FileChecksum;
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
  status: "not_inspected" | "provided";
  format?: string;
  width: number | null;
  height: number | null;
  colorDepth: number | null;
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
    version: "1.0.0";
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

export type IngestSessionState =
  | "idle"
  | "validating"
  | "ready"
  | "uploading"
  | "paused"
  | "completed"
  | "failed"
  | "aborted";

export type IngestSessionSnapshotSchemaVersion = "large-image-ingest.session.v1";

export interface IngestSessionSnapshot {
  schemaVersion: IngestSessionSnapshotSchemaVersion;
  createdAt: string;
  manifest: IngestManifest;
  nextChunkIndex: number;
  state: IngestSessionState;
  updatedAt: string;
  uploadId?: string;
  uploadedBytes: number;
  uploadedChunks: number[];
}

export type IngestEvent =
  | { type: "session:created"; state: IngestSessionState }
  | { type: "validation:started"; state: IngestSessionState }
  | { type: "validation:completed"; manifest: IngestManifest; state: IngestSessionState }
  | { type: "checksum:started"; state: IngestSessionState }
  | { type: "checksum:progress"; progress: ChecksumProgress; state: IngestSessionState }
  | { type: "checksum:completed"; checksum: FileChecksum; state: IngestSessionState }
  | { type: "manifest:created"; manifest: IngestManifest; state: IngestSessionState }
  | { type: "upload:started"; manifest: IngestManifest; state: IngestSessionState; uploadId: string }
  | {
      type: "upload:progress";
      completedChunks: number;
      manifestId: string;
      state: IngestSessionState;
      totalBytes: number;
      totalChunks: number;
      uploadId: string;
      uploadedBytes: number;
    }
  | { type: "chunk:started"; chunk: ChunkDescriptor; manifestId: string; state: IngestSessionState; uploadId: string }
  | {
      type: "chunk:completed";
      chunk: ChunkDescriptor;
      manifestId: string;
      state: IngestSessionState;
      totalBytes: number;
      uploadId: string;
      uploadedBytes: number;
    }
  | { type: "chunk:skipped"; chunk: ChunkDescriptor; manifestId: string; state: IngestSessionState; uploadId: string }
  | {
      type: "chunk:retry";
      attempt: number;
      chunk: ChunkDescriptor;
      error: unknown;
      manifestId: string;
      state: IngestSessionState;
      uploadId: string;
    }
  | { type: "upload:paused"; snapshot: IngestSessionSnapshot; state: IngestSessionState }
  | { type: "upload:resumed"; snapshot: IngestSessionSnapshot; state: IngestSessionState }
  | { type: "upload:completed"; manifest: IngestManifest; state: IngestSessionState; uploadId: string }
  | { type: "upload:failed"; error: unknown; manifestId?: string; state: IngestSessionState }
  | { type: "upload:aborted"; error: unknown; manifestId?: string; state: IngestSessionState };

export interface IngestErrorDetails {
  [key: string]: unknown;
}

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

export interface UploadChunkCheckContext extends UploadSessionContext {
  chunk: ChunkDescriptor;
  snapshot?: IngestSessionSnapshot;
  uploadId: string;
}

export interface UploadResumeContext extends UploadSessionContext {
  snapshot: IngestSessionSnapshot;
}

export interface UploadTransport {
  createSession(context: UploadSessionContext): Promise<{ uploadId: string }>;
  resumeSession?(context: UploadResumeContext): Promise<{ uploadId: string }>;
  shouldUploadChunk?(context: UploadChunkCheckContext): Promise<boolean> | boolean;
  uploadChunk(context: UploadChunkContext): Promise<void>;
  completeSession(context: UploadSessionContext & { uploadId: string }): Promise<void>;
}

export interface CreateIngestSessionOptions {
  checksum?: ChecksumOptions | false;
  chunking?: ChunkPlanOptions;
  image?: ImageMetadataInput;
  metadata?: Record<string, unknown>;
  onEvent?: (event: IngestEvent) => void;
  resumeFrom?: IngestSessionSnapshot;
  retries?: number;
  storage?: StorageTargetManifest;
  transport: UploadTransport;
  validation?: ValidationRules;
}
