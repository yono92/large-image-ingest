export type IngestIssueSeverity = "error" | "warning";

export type ResumeConflictCode =
  | "resume.record_not_found"
  | "resume.schema_unsupported"
  | "resume.file_mismatch"
  | "resume.chunking_mismatch"
  | "resume.transport_unsupported"
  | "resume.transport_mismatch"
  | "resume.expired"
  | "resume.store_failed";

export type VerificationIssueCode =
  | "verification.manifest_schema_unsupported"
  | "verification.manifest_invalid"
  | "verification.original_mismatch"
  | "verification.checksum_missing"
  | "verification.checksum_unsupported"
  | "verification.checksum_mismatch"
  | "verification.receipt_missing"
  | "verification.receipt_duplicate"
  | "verification.receipt_invalid"
  | "verification.receipt_incomplete"
  | "verification.transport_mismatch"
  | "verification.file_not_found"
  | "verification.file_unreadable";

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
  | "transport.aborted"
  | "transport.paused"
  | "transport.canceled"
  | "transport.session_expired"
  | "transport.offset_mismatch"
  | "transport.part_rejected"
  | "transport.receipt_missing"
  | "transport.receipt_invalid"
  | "transport.complete_failed"
  | "transport.abort_failed"
  | "transport.resume_failed"
  | "transport.unsafe_path"
  | "transport.unrecoverable"
  | VerificationIssueCode
  | ResumeConflictCode;

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

export interface IngestError extends Error {
  code: IngestIssueCode;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface IngestErrorDetails {
  [key: string]: unknown;
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

export interface VerificationResult {
  ok: boolean;
  issues: IngestIssue[];
}

export type VerificationChecksumPolicy = "required" | "when-present" | false;

export interface VerifyManifestOptions {
  checksum?: VerificationChecksumPolicy;
  checksumChunkSize?: number;
  file?: IngestFileLike;
}

export interface VerifyUploadReceiptsOptions {
  allowPartial?: boolean;
  expectedTransportName?: string;
  requireChunkChecksums?: boolean;
}

export interface VerifyIngestIntegrityOptions extends VerifyManifestOptions {
  manifest: IngestManifest;
  receiptVerification?: VerifyUploadReceiptsOptions | false;
  receipts?: readonly UploadChunkReceipt[];
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

export type FileChecksumAlgorithm = "sha256";

export type ChecksumAlgorithm =
  | FileChecksumAlgorithm
  | "crc64nvme"
  | "crc32c"
  | "crc32"
  | "md5"
  | "custom";

export interface ChecksumProgress {
  loadedBytes: number;
  totalBytes: number;
  chunkIndex: number;
  totalChunks: number;
}

export interface ChecksumOptions {
  algorithm?: FileChecksumAlgorithm;
  chunkSize?: number;
  expected?: string;
  onProgress?: (progress: ChecksumProgress) => void;
  required?: boolean;
}

export interface FileChecksum {
  algorithm: FileChecksumAlgorithm;
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

export interface TransportCapabilities {
  name: string;
  resumable: boolean;
  abortable: boolean;
  expires: boolean;
  supportsParallelChunks: boolean;
  supportsChunkChecksum: boolean;
  minChunkSizeBytes?: number;
  minFinalChunkSizeBytes?: number;
  maxChunkSizeBytes?: number;
  maxChunkCount?: number;
  partNumberBase?: 0 | 1;
}

export interface TransportSession {
  uploadId: string;
  transportName: string;
  createdAt: string;
  expiresAt?: string | undefined;
  resumeToken?: string | undefined;
  secretsRef?: string | undefined;
  remote?: Record<string, unknown> | undefined;
}

export interface ChecksumReceipt {
  algorithm: ChecksumAlgorithm;
  value: string;
}

export interface UploadChunkReceipt {
  chunkIndex: number;
  sizeBytes: number;
  completedAt: string;
  checksum?: ChecksumReceipt | undefined;
  transport: {
    name: string;
    partNumber?: number | undefined;
    etag?: string | undefined;
    offset?: number | undefined;
    location?: string | undefined;
    opaque?: Record<string, unknown> | undefined;
  };
}

export type UploadSessionStatus =
  | "idle"
  | "validating"
  | "creating"
  | "uploading"
  | "paused"
  | "resuming"
  | "completing"
  | "completed"
  | "failed"
  | "canceled";

export interface UploadSessionSnapshot {
  manifestId: string;
  status: UploadSessionStatus;
  transportSession?: TransportSession | undefined;
  chunkPlan: ChunkPlan;
  completedChunks: UploadChunkReceipt[];
  failedChunk?: ChunkDescriptor | undefined;
  uploadedBytes: number;
  totalBytes: number;
  createdAt: string;
  updatedAt: string;
  error?: {
    code: IngestIssueCode;
    message: string;
    retryable: boolean;
  } | undefined;
  redactions?: {
    transportSession?: readonly string[] | undefined;
    receipts?: readonly string[] | undefined;
  } | undefined;
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
  lastErrorCode?: IngestIssueCode;
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
  | { type: "snapshot"; snapshot: UploadSessionSnapshot }
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
  | { type: "paused"; snapshot: UploadSessionSnapshot }
  | { type: "canceled"; snapshot: UploadSessionSnapshot }
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
  session: TransportSession;
  previousReceipts: readonly UploadChunkReceipt[];
}

export interface ResumeSessionContext extends UploadSessionContext {
  record: ResumeRecord;
  snapshot?: UploadSessionSnapshot;
}

export interface UploadSessionResult {
  uploadId: string;
  transportName?: string;
  createdAt?: string;
  resumeToken?: string;
  expiresAt?: string;
  data?: Record<string, unknown>;
  remote?: Record<string, unknown>;
  secretsRef?: string;
}

export interface UploadChunkResult {
  resumeToken?: string;
  expiresAt?: string;
  data?: Record<string, unknown>;
}

export interface UploadTransport {
  readonly capabilities?: TransportCapabilities;
  createSession(context: UploadSessionContext): Promise<TransportSession | UploadSessionResult>;
  resumeSession?(context: ResumeSessionContext): Promise<TransportSession | UploadSessionResult>;
  uploadChunk(context: UploadChunkContext): Promise<void | UploadChunkResult | UploadChunkReceipt>;
  completeSession(
    context: UploadSessionContext & {
      uploadId: string;
      session: TransportSession;
      receipts: readonly UploadChunkReceipt[];
    }
  ): Promise<void>;
  abortSession?(
    context: UploadSessionContext & {
      uploadId: string;
      session: TransportSession;
      receipts: readonly UploadChunkReceipt[];
    }
  ): Promise<void>;
}

export interface CreateIngestSessionOptions {
  checksum?: ChecksumOptions | false;
  chunking?: ChunkPlanOptions;
  image?: ImageMetadataInput;
  manifest?: IngestManifest;
  manifestIdentity?: ManifestIdentityOverride;
  metadata?: Record<string, unknown>;
  onEvent?: (event: IngestEvent) => void;
  onSnapshot?: (snapshot: UploadSessionSnapshot) => void;
  retries?: number;
  resume?: ResumeOptions;
  resumeFrom?: UploadSessionSnapshot;
  storage?: StorageTargetManifest;
  transport: UploadTransport;
  validation?: ValidationRules;
}
