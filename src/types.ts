import type { UploadChunkReceipt } from "./types-transport.js";
export type { CreateDerivativeReferenceInput, AttachDerivativeOptions, CreatePreviewDerivativeInput, CreateTilePyramidDerivativeInput, CreateMetadataDerivativeInput, TransportCapabilities, TransportRecoveryCapabilities, TransportSession, ChecksumReceipt, ChunkChecksumValue, ChunkChecksumEvidence, ChunkIntegrityBinding, ChunkIntegrityEvidence, ParallelUploadOptions, ParallelUploadState, ParallelChunkOutcomeCounts, UploadChunkReceipt, UploadSessionStatus, UploadSessionSnapshot, ResumeRecordSchemaVersion, ContentSourceIdentitySchemaVersion, ContentSourceIdentityV1, ResumeRecordStatus, ResumeCleanupPolicy, ResumeCleanupOperation, CompletedChunkRange, ResumeFileIdentity, ResumeChunkingIdentity, ResumeTransportState, ResumeProgress, ResumeRecordBase, DomainProfileReference, DomainProfileSessionBinding, ResumeRecordV0_1, ResumeRecordV0_2, ResumeRecordV0_3, ResumeRecordV0_4, ResumeRecord, ResumeCompatibilityStatus, ResumeCompatibilityReason, ResumeCompatibilityResult, PersistentResumeClassificationOptions, ResumeRecordValidationIssue, ResumeRecordValidationResult, ResumeStore, ResumeOptions, ManifestIdentityOverride, RetryDecisionContext } from "./types-transport.js";
export type { RetryPolicy, IngestEvent, IngestObserverFailure, UploadSessionContext, UploadChunkContext, ResumeSessionContext, ReconcileChunksContext, UploadSessionResult, UploadChunkResult, UploadTransport, CreateIngestSessionOptions } from "./types-session.js";

export type IngestIssueSeverity = "error" | "warning";

export type ResumeConflictCode =
  | "resume.record_not_found"
  | "resume.record_invalid"
  | "resume.schema_unsupported"
  | "resume.receipt_missing"
  | "resume.receipt_invalid"
  | "resume.identity_missing"
  | "resume.restart_required"
  | "resume.file_mismatch"
  | "resume.chunking_mismatch"
  | "resume.transport_unsupported"
  | "resume.transport_mismatch"
  | "resume.profile_mismatch"
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
  | "checksum.canceled"
  | "checksum.execution_failed"
  | "checksum.chunk_missing"
  | "checksum.chunk_mismatch"
  | "checksum.chunk_unsupported"
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
  | DerivativeValidationIssueCode
  | VerificationIssueCode
  | ResumeConflictCode;

export type IngestErrorCode =
  | IngestIssueCode
  | "manifest.failed"
  | "session.failed"
  | "validation.failed"
  | "profile.binding_invalid"
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
  code: IngestErrorCode;
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
  executor?: ChecksumExecutor;
  fallback?: "error" | "inline";
  onProgress?: (progress: ChecksumProgress) => void;
  onObserverError?: (failure: ChecksumObserverFailure) => void;
  required?: boolean;
  signal?: AbortSignal;
}

export interface ChecksumExecutionOptions {
  algorithm: FileChecksumAlgorithm;
  chunkSize: number;
  signal?: AbortSignal;
  onProgress?: (progress: ChecksumProgress) => void;
}

export interface ChecksumExecutor {
  calculate(file: IngestFileLike, options: ChecksumExecutionOptions): Promise<FileChecksum>;
}

export interface ChecksumObserverFailure {
  observer: "progress";
  error: unknown;
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

export type DerivativeKind = "preview" | "thumbnail" | "tile" | "metadata" | "custom";

export type DerivativeStatus = "planned" | "created" | "failed";

export type DerivativeStorageKind = "object" | "url" | "path" | "inline-reference" | "custom";

export interface DerivativeStorageReference {
  kind: DerivativeStorageKind;
  label?: string;
  locationHint?: string;
  metadata?: Record<string, unknown>;
}

export interface DerivativeSourceIdentity {
  manifestId: string;
  schemaVersion: IngestManifestSchemaVersion;
  fingerprint?: FileFingerprint;
  checksum?: FileChecksum;
  sizeBytes?: number;
  mediaType?: string;
}

export interface DerivativeProvenance {
  generator?: string;
  generatorVersion?: string;
  parametersLabel?: string;
  environment?: "browser" | "server" | "external" | "custom";
}

export interface DerivativeFailure {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface TilePyramidLevelDescriptor {
  level: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  scale?: number;
  storage?: DerivativeStorageReference;
}

export interface TilePyramidDescriptor {
  tileWidth?: number;
  tileHeight?: number;
  levels: readonly TilePyramidLevelDescriptor[];
  storage?: DerivativeStorageReference;
}

export interface DerivativeMetadata {
  format?: string;
  width?: number;
  height?: number;
  colorDepth?: number;
  channels?: number;
  tilePyramid?: TilePyramidDescriptor;
}

export interface DerivativeManifest {
  id: string;
  kind: DerivativeKind;
  status: DerivativeStatus;
  role?: string;
  mediaType?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  checksum?: FileChecksum;
  source: "original";
  sourceIdentity?: DerivativeSourceIdentity;
  storage?: DerivativeStorageReference;
  createdAt?: string;
  updatedAt?: string;
  provenance?: DerivativeProvenance;
  failure?: DerivativeFailure;
  tilePyramid?: TilePyramidDescriptor;
  metadata?: DerivativeMetadata;
}

export interface IngestManifest {
  schemaVersion: IngestManifestSchemaVersion;
  id: string;
  createdAt: string;
  library: {
    name: "large-image-ingest";
    version: string;
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

export type DerivativeValidationIssueCode =
  | "derivative.id.missing"
  | "derivative.id.duplicate"
  | "derivative.kind.unsupported"
  | "derivative.status.invalid"
  | "derivative.source.missing"
  | "derivative.source.mismatch"
  | "derivative.storage.unsafe"
  | "derivative.payload.embedded"
  | "derivative.failure.unsafe"
  | "derivative.tile.invalid"
  | "derivative.required.missing";

export interface DerivativeValidationIssue {
  code: DerivativeValidationIssueCode;
  message: string;
  path?: string;
  severity: IngestIssueSeverity;
  derivativeId?: string;
}

export interface DerivativeValidationOptions {
  strictSourceIdentity?: boolean;
  allowUnsafeLocationHints?: boolean;
  requiredDerivativeIds?: readonly string[];
}

export interface DerivativeValidationResult {
  ok: boolean;
  issues: readonly DerivativeValidationIssue[];
}
