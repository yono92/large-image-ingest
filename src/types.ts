export type IngestIssueSeverity = "error" | "warning";

export type ResumeConflictCode =
  | "resume.record_not_found"
  | "resume.record_invalid"
  | "resume.schema_unsupported"
  | "resume.receipt_missing"
  | "resume.receipt_invalid"
  | "resume.content_identity_missing"
  | "resume.content_mismatch"
  | "resume.file_mismatch"
  | "resume.chunking_mismatch"
  | "resume.transport_unsupported"
  | "resume.transport_mismatch"
  | "resume.expired"
  | "resume.store_failed";

export type CompletionIssueCode =
  | "completion.evidence_invalid"
  | "completion.schema_unsupported"
  | "completion.integrity_mismatch";

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

export type QueueIssueCode =
  | "queue.invalid_options"
  | "queue.capacity_exceeded"
  | "queue.duplicate_item"
  | "queue.item_not_found"
  | "queue.invalid_transition"
  | "queue.store_failed"
  | "queue.record_invalid"
  | "queue.source_mismatch";

export type ProfileIssueCode =
  | "profile.invalid"
  | "profile.field_missing"
  | "profile.field_type"
  | "profile.field_min_length"
  | "profile.field_max_length"
  | "profile.field_min_value"
  | "profile.field_max_value"
  | "profile.field_enum"
  | "profile.field_pattern";

export type PolicyIssueCode =
  | "policy.invalid"
  | "policy.metadata_invalid"
  | "policy.original_not_preserved"
  | "policy.checksum_missing"
  | "policy.checksum_algorithm"
  | "policy.completion_missing"
  | "policy.completion_invalid"
  | "policy.completion_unverified"
  | "policy.stored_checksum_missing"
  | "policy.source_too_large"
  | "policy.media_type_disallowed";

export type EvidenceExportIssueCode =
  | "evidence.bundle_invalid"
  | "evidence.bundle_mismatch"
  | "evidence.canonicalization_failed"
  | "evidence.signature_failed"
  | "evidence.signature_invalid";

export type IngestIssueCode =
  | "file.empty"
  | "file.too_large"
  | "file.too_small"
  | "file.mime_not_allowed"
  | "file.extension_not_allowed"
  | "metadata.required_missing"
  | "checksum.mismatch"
  | "checksum.aborted"
  | "checksum.worker_failed"
  | "image.dimensions_unavailable"
  | "image.width_too_small"
  | "image.width_too_large"
  | "image.height_too_small"
  | "image.height_too_large"
  | "chunk.invalid_size"
  | "execution.invalid_concurrency"
  | "execution.parallel_unsupported"
  | QueueIssueCode
  | ProfileIssueCode
  | PolicyIssueCode
  | EvidenceExportIssueCode
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
  | CompletionIssueCode
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

export interface ChecksumExecutionOptions {
  algorithm?: FileChecksumAlgorithm;
  chunkSize?: number;
  onProgress?: (progress: ChecksumProgress) => void;
  signal?: AbortSignal;
}

export interface ChecksumExecutor {
  calculate(
    file: IngestFileLike,
    options: ChecksumExecutionOptions
  ): Promise<FileChecksum>;
}

export interface ChecksumOptions extends ChecksumExecutionOptions {
  executor?: ChecksumExecutor;
  expected?: string;
  required?: boolean;
}

export interface ChecksumWorkerEvent {
  data?: unknown;
  message?: string;
}

export type ChecksumWorkerEventListener = (event: ChecksumWorkerEvent) => void;

export interface ChecksumWorkerLike {
  postMessage(value: unknown): void;
  addEventListener(
    type: "message" | "error" | "messageerror",
    listener: ChecksumWorkerEventListener
  ): void;
  removeEventListener(
    type: "message" | "error" | "messageerror",
    listener: ChecksumWorkerEventListener
  ): void;
  terminate(): void;
}

export interface ChecksumWorkerRuntimeScope {
  postMessage(value: unknown): void;
  addEventListener(type: "message", listener: ChecksumWorkerEventListener): void;
  removeEventListener(type: "message", listener: ChecksumWorkerEventListener): void;
}

export type ChecksumWorkerRequest = {
  protocol: "large-image-ingest.checksum-worker.v1";
  type: "calculate";
  requestId: string;
  file: IngestFileLike;
  algorithm: FileChecksumAlgorithm;
  chunkSize?: number | undefined;
};

export type ChecksumWorkerResponse =
  | {
      protocol: "large-image-ingest.checksum-worker.v1";
      type: "progress";
      requestId: string;
      progress: ChecksumProgress;
    }
  | {
      protocol: "large-image-ingest.checksum-worker.v1";
      type: "result";
      requestId: string;
      checksum: FileChecksum;
    }
  | {
      protocol: "large-image-ingest.checksum-worker.v1";
      type: "error";
      requestId: string;
      code: "checksum.worker_failed";
      message: string;
    };

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

export interface ArtifactProducer {
  name: "large-image-ingest";
  version: string;
}

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
    name: ArtifactProducer["name"];
    version: ArtifactProducer["version"];
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
  supportsSnapshotResume?: boolean;
  supportsPersistentResume?: boolean;
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

export interface ReceiptSetDigest {
  algorithm: "sha256";
  value: string;
}

export interface StoredObjectEvidence {
  sizeBytes: number;
  checksum?: ChecksumReceipt | undefined;
}

export interface UploadCompletionResult {
  completedAt?: string | undefined;
  storage?: StorageTargetManifest | undefined;
  storedObject?: StoredObjectEvidence | undefined;
}

export interface CreateCompletionEvidenceInput {
  manifest: IngestManifest;
  transportName: string;
  receipts: readonly UploadChunkReceipt[];
  completionResult?: UploadCompletionResult | undefined;
  id?: string | undefined;
  now?: Date | undefined;
}

export type IngestCompletionEvidenceSchemaVersion =
  "large-image-ingest.completion.v1";

export type IngestCompletionStatus = "verified" | "completed-unverified";

export interface IngestCompletionEvidence {
  schemaVersion: IngestCompletionEvidenceSchemaVersion;
  id: string;
  createdAt: string;
  completedAt: string;
  producer: ArtifactProducer;
  manifest: {
    id: string;
    schemaVersion: IngestManifestSchemaVersion;
  };
  source: {
    sizeBytes: number;
    checksum?: FileChecksum | undefined;
  };
  status: IngestCompletionStatus;
  upload: {
    transportName: string;
    totalBytes: number;
    totalChunks: number;
    acknowledgedChunks: number;
    receiptDigest: ReceiptSetDigest;
  };
  storage?: StorageTargetManifest | undefined;
  verification?: {
    verifiedAt: string;
    sourceChecksum: FileChecksum;
    storedChecksum: ChecksumReceipt;
    storedSizeBytes: number;
  } | undefined;
}

export interface CompletionEvidenceValidationIssue {
  code: "completion.evidence_invalid" | "completion.schema_unsupported";
  message: string;
  path?: string | undefined;
}

export type CompletionEvidenceValidationResult =
  | {
      ok: true;
      issues: readonly [];
      evidence: IngestCompletionEvidence;
    }
  | {
      ok: false;
      issues: readonly CompletionEvidenceValidationIssue[];
    };

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

export type ResumeRecordSchemaVersion =
  | "large-image-ingest.resume.v0.1"
  | "large-image-ingest.resume.v0.2"
  | "large-image-ingest.resume.v0.3";

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

export interface ResumeContentIdentity {
  algorithm: "sha256";
  scope: "whole-file";
  value: string;
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
}

export interface ResumeRecordV0_1 extends ResumeRecordBase {
  schemaVersion: "large-image-ingest.resume.v0.1";
}

export interface ResumeRecordV0_2 extends ResumeRecordBase {
  schemaVersion: "large-image-ingest.resume.v0.2";
  receipts: UploadChunkReceipt[];
}

export interface ResumeRecordV0_3 extends Omit<ResumeRecordBase, "file"> {
  schemaVersion: "large-image-ingest.resume.v0.3";
  producer: ArtifactProducer;
  file: ResumeFileIdentity & {
    contentIdentity: ResumeContentIdentity;
  };
  receipts: UploadChunkReceipt[];
}

export type ResumeRecord = ResumeRecordV0_1 | ResumeRecordV0_2 | ResumeRecordV0_3;

export interface ResumeRecordValidationIssue {
  code:
    | "resume.record_invalid"
    | "resume.receipt_invalid"
    | "resume.content_identity_missing"
    | "resume.content_mismatch"
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

export type IngestQueueRecordSchemaVersion = "large-image-ingest.queue.v0.1";

export type IngestQueueItemStatus =
  | "pending"
  | "needs-source"
  | "running"
  | "paused"
  | "failed"
  | "completed"
  | "canceled";

export type IngestQueueStatus = "idle" | "running" | "paused" | "drained";

export interface IngestQueueSourceIdentity {
  name: string;
  size: number;
  type: string;
  lastModified?: number | undefined;
}

export interface IngestQueueFailure {
  code: IngestIssueCode;
  retryable: boolean;
}

export interface IngestQueueRecord {
  schemaVersion: IngestQueueRecordSchemaVersion;
  id: string;
  sequence: number;
  status: IngestQueueItemStatus;
  source: IngestQueueSourceIdentity;
  uploadedBytes: number;
  totalBytes: number;
  attempt: number;
  resumeRecordId?: string | undefined;
  failure?: IngestQueueFailure | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface IngestQueueStore {
  get(id: string): Promise<IngestQueueRecord | undefined>;
  put(record: IngestQueueRecord): Promise<void>;
  list(): Promise<IngestQueueRecord[]>;
  delete(id: string): Promise<void>;
}

export interface IngestQueueItemSnapshot {
  id: string;
  sequence: number;
  status: IngestQueueItemStatus;
  uploadedBytes: number;
  totalBytes: number;
  attempt: number;
  hasSource: boolean;
  hasResumeRecord: boolean;
  failure?: IngestQueueFailure | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface IngestQueueSnapshot {
  status: IngestQueueStatus;
  counts: Record<IngestQueueItemStatus, number>;
  activeItems: number;
  activeBytes: number;
  uploadedBytes: number;
  totalBytes: number;
  items: IngestQueueItemSnapshot[];
  updatedAt: string;
}

export type IngestQueueEvent =
  | { type: "item:enqueued"; item: IngestQueueItemSnapshot }
  | { type: "item:restored"; item: IngestQueueItemSnapshot }
  | { type: "item:source-needed"; item: IngestQueueItemSnapshot }
  | { type: "item:source-attached"; item: IngestQueueItemSnapshot }
  | { type: "item:started"; item: IngestQueueItemSnapshot }
  | { type: "item:progress"; item: IngestQueueItemSnapshot }
  | { type: "item:paused"; item: IngestQueueItemSnapshot }
  | { type: "item:failed"; item: IngestQueueItemSnapshot }
  | { type: "item:completed"; item: IngestQueueItemSnapshot }
  | { type: "item:canceled"; item: IngestQueueItemSnapshot }
  | { type: "item:removed"; itemId: string }
  | { type: "queue:paused"; snapshot: IngestQueueSnapshot }
  | { type: "queue:drained"; snapshot: IngestQueueSnapshot }
  | {
      type: "queue:store-failed";
      itemId?: string | undefined;
      operation: "put" | "delete" | "list";
      error: unknown;
    };

export interface IngestQueueObserverFailure {
  observer: "event" | "snapshot";
  eventType?: IngestQueueEvent["type"] | undefined;
  error: unknown;
}

export interface IngestQueueSessionFactoryContext {
  itemId: string;
  attempt: number;
  source: IngestQueueSourceIdentity;
  resumeRecordId?: string | undefined;
}

export interface CreateIngestQueueOptions {
  createSessionOptions(
    context: IngestQueueSessionFactoryContext
  ): CreateIngestSessionOptions;
  maxActiveItems?: number | undefined;
  maxActiveBytes?: number | undefined;
  maxQueuedItems?: number | undefined;
  store?: IngestQueueStore | undefined;
  resolveSource?(
    identity: IngestQueueSourceIdentity,
    itemId: string
  ): Promise<IngestFileLike | undefined> | IngestFileLike | undefined;
  onEvent?: ((event: IngestQueueEvent) => void) | undefined;
  onSnapshot?: ((snapshot: IngestQueueSnapshot) => void) | undefined;
  onObserverError?: ((failure: IngestQueueObserverFailure) => void) | undefined;
}

export interface EnqueueIngestOptions {
  id?: string | undefined;
}

export type InspectionMetadataProfileSchemaVersion =
  "large-image-ingest.inspection-profile.v1";

export type InspectionMetadataScalarType = "string" | "number" | "integer" | "boolean";

export interface InspectionMetadataFieldRule {
  key: string;
  required?: boolean | undefined;
  type: InspectionMetadataScalarType;
  minLength?: number | undefined;
  maxLength?: number | undefined;
  minimum?: number | undefined;
  maximum?: number | undefined;
  enum?: readonly (string | number | boolean)[] | undefined;
  pattern?: string | undefined;
}

export interface InspectionMetadataProfile {
  schemaVersion: InspectionMetadataProfileSchemaVersion;
  id: string;
  version: string;
  description?: string | undefined;
  fields: readonly InspectionMetadataFieldRule[];
}

export interface InspectionMetadataValidationIssue {
  code: ProfileIssueCode;
  path: string;
  severity: "error";
}

export interface InspectionMetadataValidationResult {
  ok: boolean;
  profileId: string;
  profileVersion: string;
  issues: readonly InspectionMetadataValidationIssue[];
}

export type InspectionPolicySchemaVersion = "large-image-ingest.inspection-policy.v1";

export interface InspectionPolicyPack {
  schemaVersion: InspectionPolicySchemaVersion;
  id: string;
  version: string;
  description?: string | undefined;
  metadataProfile?: InspectionMetadataProfile | undefined;
  requireOriginalPreserved?: boolean | undefined;
  requireWholeFileChecksum?: boolean | undefined;
  requiredChecksumAlgorithm?: FileChecksumAlgorithm | undefined;
  allowedCompletionStatuses?: readonly IngestCompletionStatus[] | undefined;
  requireStoredChecksum?: boolean | undefined;
  maxSourceBytes?: number | undefined;
  allowedMediaTypes?: readonly string[] | undefined;
}

export interface InspectionPolicyIssue {
  code: PolicyIssueCode | ProfileIssueCode;
  path: string;
  severity: "error";
}

export type InspectionPolicyReportSchemaVersion =
  "large-image-ingest.inspection-policy-report.v1";

export interface InspectionPolicyReport {
  schemaVersion: InspectionPolicyReportSchemaVersion;
  producer: ArtifactProducer;
  policy: { id: string; version: string };
  manifestId: string;
  completionId?: string | undefined;
  ok: boolean;
  issues: readonly InspectionPolicyIssue[];
  evaluatedAt: string;
}

export interface EvaluateInspectionPolicyInput {
  manifest: IngestManifest;
  completion?: IngestCompletionEvidence | undefined;
  policy: InspectionPolicyPack;
  evaluatedAt?: string | undefined;
}

export type EvidenceBundleSchemaVersion = "large-image-ingest.evidence-bundle.v1";

export interface EvidenceBundle {
  schemaVersion: EvidenceBundleSchemaVersion;
  producer: ArtifactProducer;
  id: string;
  manifestId: string;
  completionId: string;
  createdAt: string;
  manifest: IngestManifest;
  completion: IngestCompletionEvidence;
  policyReport?: InspectionPolicyReport | undefined;
}

export interface CreateEvidenceBundleInput {
  manifest: IngestManifest;
  completion: IngestCompletionEvidence;
  policyReport?: InspectionPolicyReport | undefined;
  id?: string | undefined;
  createdAt?: string | undefined;
}

export interface EvidenceBundleDigest {
  algorithm: "sha256";
  value: string;
}

export interface EvidenceBundleSigner {
  algorithm: string;
  keyId: string;
  sign(payload: Uint8Array): Promise<Uint8Array> | Uint8Array;
}

export interface EvidenceBundleVerifierInput {
  algorithm: string;
  keyId: string;
  payload: Uint8Array;
  signature: Uint8Array;
}

export interface EvidenceBundleVerifier {
  verify(input: EvidenceBundleVerifierInput): Promise<boolean> | boolean;
}

export type SignedEvidenceEnvelopeSchemaVersion =
  "large-image-ingest.signed-evidence.v1";

export interface SignedEvidenceEnvelope {
  schemaVersion: SignedEvidenceEnvelopeSchemaVersion;
  bundle: EvidenceBundle;
  payloadDigest: EvidenceBundleDigest;
  signature: {
    algorithm: string;
    keyId: string;
    value: string;
    signedAt: string;
  };
}

export interface EvidenceSignatureVerification {
  trusted: boolean;
  digestValid: boolean;
  signatureValid: boolean;
  bundle?: EvidenceBundle | undefined;
  issues: readonly {
    code: EvidenceExportIssueCode;
    path: string;
    severity: "error";
  }[];
}

export interface UploadExecutionOptions {
  maxParallelChunks?: number;
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

export interface RetryPolicy {
  maxAttempts?: number | undefined;
  delayMs?: number | undefined;
  backoffFactor?: number | undefined;
  maxDelayMs?: number | undefined;
  jitter?: "none" | "full" | undefined;
  isRetryable?: ((error: unknown, context: RetryDecisionContext) => boolean) | undefined;
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
  | { type: "resume:cleanup-failed"; recordId: string; code: "resume.store_failed"; operation: ResumeCleanupOperation; error: unknown }
  | { type: "resume:expired"; recordId: string }
  | { type: "upload:paused"; recordId?: string }
  | { type: "upload:canceled"; recordId?: string }
  | { type: "paused"; snapshot: UploadSessionSnapshot }
  | { type: "canceled"; snapshot: UploadSessionSnapshot }
  | { type: "completed"; manifest: IngestManifest; uploadId: string; evidence: IngestCompletionEvidence }
  | { type: "failed"; manifestId?: string; error: unknown };

export interface IngestObserverFailure {
  observer: "event" | "snapshot";
  eventType?: IngestEvent["type"];
  error: unknown;
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

export type UploadCompletionContext = UploadSessionContext & {
  uploadId: string;
  session: TransportSession;
  receipts: readonly UploadChunkReceipt[];
};

export interface UploadTransport {
  readonly capabilities?: TransportCapabilities;
  createSession(context: UploadSessionContext): Promise<TransportSession | UploadSessionResult>;
  resumeSession?(context: ResumeSessionContext): Promise<TransportSession | UploadSessionResult>;
  uploadChunk(context: UploadChunkContext): Promise<void | UploadChunkResult | UploadChunkReceipt>;
  completeSession(context: UploadCompletionContext): Promise<void | UploadCompletionResult>;
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
  execution?: UploadExecutionOptions;
  manifest?: IngestManifest;
  manifestIdentity?: ManifestIdentityOverride;
  metadata?: Record<string, unknown>;
  onEvent?: (event: IngestEvent) => void;
  onObserverError?: (failure: IngestObserverFailure) => void;
  onSnapshot?: (snapshot: UploadSessionSnapshot) => void;
  retries?: number;
  retryPolicy?: RetryPolicy | undefined;
  resume?: ResumeOptions;
  resumeFrom?: UploadSessionSnapshot;
  storage?: StorageTargetManifest;
  transport: UploadTransport;
  validation?: ValidationRules;
}
