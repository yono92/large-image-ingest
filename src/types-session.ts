// Part of types.ts, split out to keep modules under 500 lines; public exports stay on types.ts.
import type { ChecksumOptions, ChunkDescriptor, ChunkPlan, ChunkPlanOptions, ImageMetadataInput, IngestFileLike, IngestManifest, ResumeConflictCode, StorageTargetManifest, ValidationRules } from "./types.js";
import type { ChunkIntegrityEvidence, CompletedChunkRange, DomainProfileSessionBinding, ManifestIdentityOverride, ParallelUploadOptions, ParallelUploadState, ResumeCleanupOperation, ResumeOptions, ResumeRecord, ResumeRecordStatus, RetryDecisionContext, TransportCapabilities, TransportSession, UploadChunkReceipt, UploadSessionSnapshot } from "./types-transport.js";

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
  | { type: "chunk:started"; manifestId: string; chunk: ChunkDescriptor; attemptId?: string; attemptNumber?: number }
  | { type: "chunk:completed"; manifestId: string; chunk: ChunkDescriptor; uploadedBytes: number; totalBytes: number; attemptId?: string; attemptNumber?: number }
  | { type: "retry"; manifestId: string; chunk: ChunkDescriptor; attempt: number; attemptId?: string; error: unknown }
  | { type: "resume:available"; recordId: string; manifestId: string; status: ResumeRecordStatus }
  | { type: "resume:started"; recordId: string; manifestId: string }
  | { type: "resume:checkpoint"; recordId: string; completedChunkRanges: CompletedChunkRange[] }
  | { type: "resume:conflict"; recordId?: string; code: ResumeConflictCode; error: unknown }
  | { type: "resume:cleanup-failed"; recordId: string; code: "resume.store_failed"; operation: ResumeCleanupOperation; error: unknown }
  | { type: "resume:expired"; recordId: string }
  /** A stored v0.1 or v0.2 resume record was read; 2.0.0 will stop reading these schemas. */
  | { type: "resume:legacy-record"; recordId: string; schemaVersion: "large-image-ingest.resume.v0.1" | "large-image-ingest.resume.v0.2"; removedIn: "2.0.0" }
  | { type: "upload:paused"; recordId?: string }
  | { type: "upload:canceled"; recordId?: string }
  | { type: "paused"; snapshot: UploadSessionSnapshot }
  | { type: "canceled"; snapshot: UploadSessionSnapshot }
  | { type: "completed"; manifest: IngestManifest; uploadId: string }
  | { type: "failed"; manifestId?: string; error: unknown };

export interface IngestObserverFailure {
  observer: "event" | "snapshot" | "checksum";
  eventType?: IngestEvent["type"];
  error: unknown;
}

export interface UploadSessionContext {
  manifest: IngestManifest;
  file: IngestFileLike;
  signal: AbortSignal;
  parallel?: ParallelUploadState | undefined;
}

export interface UploadChunkContext extends UploadSessionContext {
  uploadId: string;
  chunk: ChunkDescriptor;
  body: Blob;
  session: TransportSession;
  previousReceipts: readonly UploadChunkReceipt[];
  attemptId?: string | undefined;
  attemptNumber?: number | undefined;
  integrity?: ChunkIntegrityEvidence | undefined;
}

export interface ResumeSessionContext extends UploadSessionContext {
  record: ResumeRecord;
  snapshot?: UploadSessionSnapshot;
}

export interface ReconcileChunksContext extends UploadSessionContext {
  uploadId: string;
  session: TransportSession;
  chunkPlan: ChunkPlan;
  localReceipts: readonly UploadChunkReceipt[];
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
  reconcileChunks?(context: ReconcileChunksContext): Promise<readonly UploadChunkReceipt[]>;
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
  /**
   * Start uploading while the whole-file checksum is still being calculated.
   * Sequential new uploads only. The persistent resume record is created once the
   * checksum is known; an upload interrupted before then cannot resume and starts over.
   * `validated` and `started` events carry a manifest without `original.checksum`.
   */
  overlapChecksum?: boolean;
  parallel?: ParallelUploadOptions;
  onEvent?: (event: IngestEvent) => void;
  onObserverError?: (failure: IngestObserverFailure) => void;
  onSnapshot?: (snapshot: UploadSessionSnapshot) => void;
  retries?: number;
  retryPolicy?: RetryPolicy | undefined;
  resume?: ResumeOptions;
  resumeFrom?: UploadSessionSnapshot;
  sourceIdentity?: ChecksumOptions;
  storage?: StorageTargetManifest;
  domainProfile?: DomainProfileSessionBinding;
  transport: UploadTransport;
  validation?: ValidationRules;
}
