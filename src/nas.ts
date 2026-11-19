export { createNasGateway, createNasFileLockProvider } from "./nas-gateway.js";

export type NasGatewaySessionStatus = "staging" | "finalized" | "canceled" | "expired";

export type NasGatewayLockScope = "finalize";

export type NasGatewayErrorCode =
  | "nas.invalid_session"
  | "nas.invalid_chunk"
  | "nas.unsafe_path"
  | "nas.session_not_found"
  | "nas.session_expired"
  | "nas.session_closed"
  | "nas.chunk_missing"
  | "nas.checksum_mismatch"
  | "nas.finalize_locked"
  | "nas.lock_failed"
  | "nas.target_exists"
  | "nas.finalize_failed"
  | "nas.cleanup_failed";

export interface NasGatewayError extends Error {
  code: NasGatewayErrorCode;
  details?: Record<string, unknown>;
}

export interface NasGatewayChecksum {
  algorithm: "sha256";
  value: string;
}

export interface NasGatewayChunkRecord {
  checksum?: NasGatewayChecksum | undefined;
  index: number;
  path: string;
  sizeBytes: number;
  stagedAt: string;
}

export interface NasGatewaySessionMetadata {
  schemaVersion: "large-image-ingest.nas-session.v0.1";
  sessionId: string;
  status: NasGatewaySessionStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | undefined;
  targetRelativePath: string;
  totalBytes: number;
  expectedChunks: number;
  metadata: Record<string, unknown>;
  chunks: NasGatewayChunkRecord[];
  finalizedAt?: string | undefined;
  canceledAt?: string | undefined;
}

export interface NasGatewaySessionSnapshot extends NasGatewaySessionMetadata {
  stagingPath: string;
  targetPath: string;
}

export interface AcquireNasGatewayLockOptions {
  now?: Date;
  scope: NasGatewayLockScope;
  sessionId: string;
}

export interface NasGatewayLock {
  release(): Promise<void>;
}

export interface NasGatewayLockProvider {
  acquireLock(options: AcquireNasGatewayLockOptions): Promise<NasGatewayLock | undefined>;
}

export interface NasFileLockProviderOptions {
  clock?: () => Date;
  lockRoot: string;
  staleLockMs?: number;
}

export interface NasGatewayOptions {
  stagingRoot: string;
  targetRoot: string;
  clock?: () => Date;
  createSessionId?: () => string;
  defaultExpiresInMs?: number;
  lockProvider?: NasGatewayLockProvider;
  overwrite?: boolean;
}

export interface CreateNasSessionOptions {
  expectedChunks: number;
  expiresAt?: string | Date;
  metadata?: Record<string, unknown>;
  sessionId?: string;
  targetRelativePath: string;
  totalBytes: number;
}

export type NasGatewayChunkBody = Blob | ArrayBuffer | ArrayBufferView;

export interface StageNasChunkOptions {
  body: NasGatewayChunkBody;
  checksum?: NasGatewayChecksum;
  index: number;
  sessionId: string;
}

export interface FinalizeNasSessionOptions {
  sessionId: string;
}

export interface CancelNasSessionOptions {
  sessionId: string;
}

export interface CleanupNasSessionsOptions {
  now?: Date;
}

export interface CleanupNasSessionsResult {
  removedSessionIds: string[];
}

export interface NasGateway {
  createSession(options: CreateNasSessionOptions): Promise<NasGatewaySessionSnapshot>;
  getSession(sessionId: string): Promise<NasGatewaySessionSnapshot>;
  stageChunk(options: StageNasChunkOptions): Promise<NasGatewaySessionSnapshot>;
  finalizeSession(options: FinalizeNasSessionOptions): Promise<NasGatewaySessionSnapshot>;
  cancelSession(options: CancelNasSessionOptions): Promise<void>;
  cleanupExpiredSessions(options?: CleanupNasSessionsOptions): Promise<CleanupNasSessionsResult>;
}
