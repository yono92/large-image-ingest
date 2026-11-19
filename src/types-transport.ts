// Part of types.ts, split out to keep modules under 500 lines; public exports stay on types.ts.
import type { ChecksumAlgorithm, ChecksumOptions, ChunkDescriptor, ChunkPlan, ChunkPlanOptions, DerivativeFailure, DerivativeKind, DerivativeMetadata, DerivativeProvenance, DerivativeStatus, DerivativeStorageReference, FileChecksum, FileFingerprint, IngestErrorCode, IngestIssueCode, IngestManifest, TilePyramidDescriptor, TilePyramidLevelDescriptor } from "./types.js";

export interface CreateDerivativeReferenceInput {
  manifest: IngestManifest;
  id?: string;
  kind: DerivativeKind;
  status: DerivativeStatus;
  role?: string;
  mediaType?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  checksum?: FileChecksum;
  storage?: DerivativeStorageReference;
  provenance?: DerivativeProvenance;
  failure?: DerivativeFailure;
  tilePyramid?: TilePyramidDescriptor;
  metadata?: DerivativeMetadata;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttachDerivativeOptions {
  replaceExisting?: boolean;
}

export interface CreatePreviewDerivativeInput
  extends Omit<CreateDerivativeReferenceInput, "kind" | "metadata" | "tilePyramid"> {
  kind: "preview" | "thumbnail";
}

export interface CreateTilePyramidDerivativeInput
  extends Omit<CreateDerivativeReferenceInput, "kind" | "metadata" | "tilePyramid"> {
  kind?: "tile";
  tileWidth?: number;
  tileHeight?: number;
  levels?: readonly TilePyramidLevelDescriptor[];
}

export interface CreateMetadataDerivativeInput
  extends Omit<CreateDerivativeReferenceInput, "kind" | "mediaType" | "metadata" | "tilePyramid"> {
  kind?: "metadata";
  format?: string;
  width?: number;
  height?: number;
  colorDepth?: number;
  channels?: number;
  tilePyramid?: TilePyramidDescriptor;
}

export interface TransportCapabilities {
  name: string;
  resumable: boolean;
  abortable: boolean;
  expires: boolean;
  supportsParallelChunks: boolean;
  supportsChunkChecksum: boolean;
  maxParallelChunks?: number;
  supportsSparseResume?: boolean;
  supportsSafeChunkRepeat?: boolean;
  supportsRemoteChunkReconciliation?: boolean;
  chunkChecksumAlgorithms?: readonly ChecksumAlgorithm[];
  chunkChecksumEncodings?: readonly ("hex" | "base64")[];
  attestsChunkChecksum?: boolean;
  supportsCompletionReconciliation?: boolean;
  supportsSnapshotResume?: boolean;
  supportsPersistentResume?: boolean;
  minChunkSizeBytes?: number;
  minFinalChunkSizeBytes?: number;
  maxChunkSizeBytes?: number;
  maxChunkCount?: number;
  partNumberBase?: 0 | 1;
}

export interface TransportRecoveryCapabilities {
  resumable: boolean;
  snapshotResume: boolean;
  persistentResume: boolean;
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

export interface ChunkChecksumValue extends ChecksumReceipt {
  encoding: "hex" | "base64";
}

export interface ChunkChecksumEvidence extends ChunkChecksumValue {
  role: "local-calculation" | "remote-attestation";
}

export interface ChunkIntegrityBinding {
  manifestId: string;
  uploadId: string;
  sourceIdentity: string;
  chunkIndex: number;
  startByte: number;
  endByteExclusive: number;
  sizeBytes: number;
}

export interface ChunkIntegrityEvidence {
  policyId: string;
  binding: ChunkIntegrityBinding;
  local: ChunkChecksumEvidence;
  remote?: ChunkChecksumEvidence | undefined;
}

export interface ParallelUploadOptions {
  concurrency: number;
  chunkChecksum?: { algorithm?: "sha256" | undefined } | undefined;
}

export interface ParallelUploadState {
  requestedConcurrency: number;
  effectiveConcurrency: number;
  policyId: string;
  integrityPolicyId: string;
  ambiguousChunkIndexes: number[];
}

export interface ParallelChunkOutcomeCounts {
  missing: number;
  inFlight: number;
  acknowledged: number;
  retryable: number;
  ambiguous: number;
  failed: number;
}

export interface UploadChunkReceipt {
  chunkIndex: number;
  sizeBytes: number;
  completedAt: string;
  checksum?: ChecksumReceipt | undefined;
  integrity?: ChunkIntegrityEvidence | undefined;
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
  parallel?: ParallelUploadState | undefined;
  chunkOutcomes?: ParallelChunkOutcomeCounts | undefined;
  error?: {
    code: IngestErrorCode;
    message: string;
    retryable: boolean;
  } | undefined;
  redactions?: {
    transportSession?: readonly string[] | undefined;
    receipts?: readonly string[] | undefined;
  } | undefined;
}

export type ResumeRecordSchemaVersion =
  | "large-image-ingest.resume.v0.1"
  | "large-image-ingest.resume.v0.2"
  | "large-image-ingest.resume.v0.3"
  | "large-image-ingest.resume.v0.4";

export type ContentSourceIdentitySchemaVersion =
  "large-image-ingest.source-identity.v1";

export interface ContentSourceIdentityV1 {
  schemaVersion: ContentSourceIdentitySchemaVersion;
  algorithm: "sha256";
  scope: "whole-file";
  sizeBytes: number;
  value: string;
}

export type ResumeRecordStatus =
  | "active"
  | "paused"
  | "failed"
  | "completed"
  | "canceled"
  | "expired";

export type ResumeCleanupPolicy = "delete-on-complete" | "mark-complete";
export type ResumeCleanupOperation = "mark-complete" | "delete";

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

export interface ResumeRecordBase {
  id: string;
  manifest: IngestManifest;
  file: ResumeFileIdentity;
  chunking: ResumeChunkingIdentity;
  transport: ResumeTransportState;
  progress: ResumeProgress;
  createdAt: string;
  updatedAt: string;
  domainProfile?: DomainProfileReference;
}

export interface DomainProfileReference {
  schemaVersion: "large-image-ingest.domain-profile-reference.v1";
  name: string;
  version: string;
  effectivePolicyDigest: {
    algorithm: "sha256";
    value: string;
  };
}

export interface DomainProfileSessionBinding {
  schemaVersion: "large-image-ingest.domain-profile-binding.v1";
  manifestId: string;
  result: "passed" | "passed_with_warnings";
  profile: DomainProfileReference;
}

export interface ResumeRecordV0_1 extends ResumeRecordBase {
  schemaVersion: "large-image-ingest.resume.v0.1";
}

export interface ResumeRecordV0_2 extends ResumeRecordBase {
  schemaVersion: "large-image-ingest.resume.v0.2";
  receipts: UploadChunkReceipt[];
}

export interface ResumeRecordV0_3 extends ResumeRecordBase {
  schemaVersion: "large-image-ingest.resume.v0.3";
  file: ResumeFileIdentity & {
    contentIdentity: ContentSourceIdentityV1;
  };
  receipts: UploadChunkReceipt[];
}

export interface ResumeRecordV0_4 extends ResumeRecordBase {
  schemaVersion: "large-image-ingest.resume.v0.4";
  file: ResumeFileIdentity & {
    contentIdentity: ContentSourceIdentityV1;
  };
  receipts: UploadChunkReceipt[];
  parallel: ParallelUploadState;
}

export type ResumeRecord = ResumeRecordV0_1 | ResumeRecordV0_2 | ResumeRecordV0_3 | ResumeRecordV0_4;

export type ResumeCompatibilityStatus =
  | "resumable"
  | "upgradeable"
  | "restart_only"
  | "expired"
  | "incompatible";

export type ResumeCompatibilityReason =
  | "compatible"
  | "legacy_upgrade_available"
  | "source_mismatch"
  | "identity_missing"
  | "chunking_mismatch"
  | "transport_unsupported"
  | "transport_mismatch"
  | "profile_mismatch"
  | "receipt_missing"
  | "expired"
  | "terminal";

export interface ResumeCompatibilityResult {
  status: ResumeCompatibilityStatus;
  reason: ResumeCompatibilityReason;
  recordId: string;
}

export interface PersistentResumeClassificationOptions extends ChunkPlanOptions {
  capabilities?: TransportCapabilities;
  checksum?: ChecksumOptions;
  sourceIdentity?: ContentSourceIdentityV1;
  domainProfile?: DomainProfileReference;
}

export interface ResumeRecordValidationIssue {
  code:
    | "resume.record_invalid"
    | "resume.receipt_invalid"
    | "resume.schema_unsupported";
  message: string;
  path?: string;
}

export type ResumeRecordValidationResult =
  | {
      ok: true;
      issues: readonly [];
      record: ResumeRecord;
    }
  | {
      ok: false;
      issues: readonly ResumeRecordValidationIssue[];
    };

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

export interface RetryDecisionContext {
  manifestId: string;
  chunk: ChunkDescriptor;
  attempt: number;
  error: unknown;
}
