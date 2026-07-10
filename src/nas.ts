import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";

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

const metadataFileName = "metadata.json";
const chunksDirectoryName = "chunks";
const defaultLockRootDirectoryName = ".locks";
const lockMetadataFileName = "owner.json";
const sessionIdPattern = /^[A-Za-z0-9_-]+$/;
const lockMetadataSchemaVersion = "large-image-ingest.nas-lock.v0.1";

interface NasFileLockMetadata {
  schemaVersion: typeof lockMetadataSchemaVersion;
  acquiredAt: string;
  ownerId: string;
  scope: NasGatewayLockScope;
  sessionId: string;
}

export function createNasGateway(options: NasGatewayOptions): NasGateway {
  const stagingRoot = resolve(options.stagingRoot);
  const targetRoot = resolve(options.targetRoot);
  const clock = options.clock ?? (() => new Date());
  const createSessionId = options.createSessionId ?? (() => randomUUID());
  const lockProvider = options.lockProvider ?? createNasFileLockProvider({
    clock,
    lockRoot: join(stagingRoot, defaultLockRootDirectoryName)
  });

  return {
    async createSession(sessionOptions) {
      validateSessionShape(sessionOptions);
      const sessionId = validateSessionId(sessionOptions.sessionId ?? createSessionId());
      const targetPath = resolveTargetPath(targetRoot, sessionOptions.targetRelativePath);
      const stagingPath = sessionPath(stagingRoot, sessionId);
      const createdAt = clock().toISOString();
      const expiresAt = normalizeExpiresAt(sessionOptions.expiresAt, createdAt, options.defaultExpiresInMs);

      if (await exists(stagingPath)) {
        throw createNasError("nas.invalid_session", "NAS session id already exists.", {
          sessionId
        });
      }

      await mkdir(join(stagingPath, chunksDirectoryName), { recursive: true });

      const metadata: NasGatewaySessionMetadata = {
        schemaVersion: "large-image-ingest.nas-session.v0.1",
        sessionId,
        status: "staging",
        createdAt,
        updatedAt: createdAt,
        expiresAt,
        targetRelativePath: sessionOptions.targetRelativePath,
        totalBytes: sessionOptions.totalBytes,
        expectedChunks: sessionOptions.expectedChunks,
        metadata: sessionOptions.metadata ?? {},
        chunks: []
      };

      await writeMetadata(stagingPath, metadata);

      return {
        ...metadata,
        stagingPath,
        targetPath
      };
    },

    async getSession(sessionId) {
      const safeSessionId = validateSessionId(sessionId);
      return readSnapshot(stagingRoot, targetRoot, safeSessionId);
    },

    async stageChunk(stageOptions) {
      const safeSessionId = validateSessionId(stageOptions.sessionId);
      const stagingPath = sessionPath(stagingRoot, safeSessionId);
      const snapshot = await readSnapshot(stagingRoot, targetRoot, safeSessionId);
      ensureSessionOpen(snapshot);
      ensureNotExpired(snapshot, clock());

      if (!Number.isSafeInteger(stageOptions.index) || stageOptions.index < 0) {
        throw createNasError("nas.invalid_chunk", "Chunk index must be a non-negative safe integer.", {
          index: stageOptions.index
        });
      }

      if (stageOptions.index >= snapshot.expectedChunks) {
        throw createNasError("nas.invalid_chunk", "Chunk index exceeds expected chunk count.", {
          index: stageOptions.index,
          expectedChunks: snapshot.expectedChunks
        });
      }

      const body = await toUint8Array(stageOptions.body);
      const checksum = createSha256(body);

      if (stageOptions.checksum && stageOptions.checksum.value !== checksum.value) {
        throw createNasError("nas.checksum_mismatch", "Chunk checksum does not match expected value.", {
          index: stageOptions.index
        });
      }

      const chunkFileName = chunkFileNameForIndex(stageOptions.index);
      const chunkPath = join(stagingPath, chunksDirectoryName, chunkFileName);
      const tempChunkPath = `${chunkPath}.tmp`;

      await writeFile(tempChunkPath, body);
      await rename(tempChunkPath, chunkPath);

      const existing = new Map(snapshot.chunks.map((chunk) => [chunk.index, chunk]));
      existing.set(stageOptions.index, {
        checksum,
        index: stageOptions.index,
        path: join(chunksDirectoryName, chunkFileName),
        sizeBytes: body.byteLength,
        stagedAt: clock().toISOString()
      });

      const metadata = toMetadata(snapshot, {
        chunks: Array.from(existing.values()).sort((left, right) => left.index - right.index),
        updatedAt: clock().toISOString()
      });

      await writeMetadata(stagingPath, metadata);

      return {
        ...metadata,
        stagingPath,
        targetPath: resolveTargetPath(targetRoot, metadata.targetRelativePath)
      };
    },

    async finalizeSession(finalizeOptions) {
      const safeSessionId = validateSessionId(finalizeOptions.sessionId);
      const lock = await acquireFinalizeLock(lockProvider, safeSessionId, clock());
      let finalizeError: unknown;

      try {
        const stagingPath = sessionPath(stagingRoot, safeSessionId);
        const snapshot = await readSnapshot(stagingRoot, targetRoot, safeSessionId);
        ensureSessionOpen(snapshot);
        ensureNotExpired(snapshot, clock());
        await verifyAllChunks(stagingPath, snapshot);

        const targetPath = resolveTargetPath(targetRoot, snapshot.targetRelativePath);
        const tempTargetPath = `${targetPath}.tmp-${safeSessionId}`;

        await mkdir(dirname(targetPath), { recursive: true });

        if (!options.overwrite && await exists(targetPath)) {
          throw createNasError("nas.target_exists", "NAS finalize target already exists.", {
            targetPath
          });
        }

        await concatenateChunks(stagingPath, snapshot, tempTargetPath);
        await rename(tempTargetPath, targetPath);

        const finalizedAt = clock().toISOString();
        const metadata = toMetadata(snapshot, {
          finalizedAt,
          status: "finalized",
          updatedAt: finalizedAt
        });

        await writeMetadata(stagingPath, metadata);

        return {
          ...metadata,
          stagingPath,
          targetPath
        };
      } catch (error) {
        finalizeError = error;

        if (isNasGatewayError(error)) {
          throw error;
        }

        throw createNasError("nas.finalize_failed", toErrorMessage(error, "NAS finalize failed."));
      } finally {
        try {
          await lock.release();
        } catch (releaseError) {
          if (!finalizeError) {
            throw createNasError("nas.lock_failed", toErrorMessage(releaseError, "NAS finalize lock release failed."), {
              sessionId: safeSessionId
            });
          }
        }
      }
    },

    async cancelSession(cancelOptions) {
      const safeSessionId = validateSessionId(cancelOptions.sessionId);
      const stagingPath = sessionPath(stagingRoot, safeSessionId);
      const snapshot = await readSnapshot(stagingRoot, targetRoot, safeSessionId);
      const canceledAt = clock().toISOString();
      const metadata = toMetadata(snapshot, {
        canceledAt,
        status: "canceled",
        updatedAt: canceledAt
      });

      await writeMetadata(stagingPath, metadata);
      await rm(stagingPath, { force: true, recursive: true });
    },

    async cleanupExpiredSessions(cleanupOptions = {}) {
      await mkdir(stagingRoot, { recursive: true });

      const now = cleanupOptions.now ?? clock();
      const removedSessionIds: string[] = [];
      const entries = await readdir(stagingRoot, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || !sessionIdPattern.test(entry.name)) {
          continue;
        }

        const stagingPath = sessionPath(stagingRoot, entry.name);
        const metadata = await readMetadataOrUndefined(stagingPath);

        if (!metadata) {
          continue;
        }

        if (metadata.status === "canceled" || isExpired(metadata, now)) {
          try {
            await rm(stagingPath, { force: true, recursive: true });
            removedSessionIds.push(entry.name);
          } catch (error) {
            throw createNasError("nas.cleanup_failed", toErrorMessage(error, "NAS cleanup failed."), {
              sessionId: entry.name
            });
          }
        }
      }

      return { removedSessionIds };
    }
  };
}

export function createNasFileLockProvider(options: NasFileLockProviderOptions): NasGatewayLockProvider {
  const lockRoot = resolve(options.lockRoot);
  const clock = options.clock ?? (() => new Date());

  return {
    async acquireLock(lockOptions) {
      const sessionId = validateSessionId(lockOptions.sessionId);
      const scope = validateLockScope(lockOptions.scope);
      const now = lockOptions.now ?? clock();
      const lockPath = fileLockPath(lockRoot, scope, sessionId);

      await mkdir(dirname(lockPath), { recursive: true });

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const ownerId = randomUUID();

        try {
          await mkdir(lockPath);
        } catch (error) {
          if (!isNodeError(error, "EEXIST")) {
            throw createNasError("nas.lock_failed", toErrorMessage(error, "NAS lock acquire failed."), {
              sessionId,
              scope
            });
          }

          const removedStaleLock = await removeStaleFileLock(lockPath, options.staleLockMs, now);

          if (removedStaleLock) {
            continue;
          }

          return undefined;
        }

        try {
          await writeFile(fileLockMetadataPath(lockPath), `${JSON.stringify({
            schemaVersion: lockMetadataSchemaVersion,
            acquiredAt: now.toISOString(),
            ownerId,
            scope,
            sessionId
          } satisfies NasFileLockMetadata, null, 2)}\n`);
        } catch (error) {
          await rm(lockPath, { force: true, recursive: true });
          throw createNasError("nas.lock_failed", toErrorMessage(error, "NAS lock metadata write failed."), {
            sessionId,
            scope
          });
        }

        let released = false;

        return {
          async release() {
            if (released) {
              return;
            }

            released = true;
            await releaseFileLock(lockPath, ownerId);
          }
        };
      }

      return undefined;
    }
  };
}

async function acquireFinalizeLock(
  lockProvider: NasGatewayLockProvider,
  sessionId: string,
  now: Date
): Promise<NasGatewayLock> {
  let lock: NasGatewayLock | undefined;

  try {
    lock = await lockProvider.acquireLock({
      now,
      scope: "finalize",
      sessionId
    });
  } catch (error) {
    if (isNasGatewayError(error)) {
      throw error;
    }

    throw createNasError("nas.lock_failed", toErrorMessage(error, "NAS finalize lock acquire failed."), {
      sessionId
    });
  }

  if (!lock) {
    throw createNasError("nas.finalize_locked", "NAS session is already finalizing.", {
      sessionId
    });
  }

  return lock;
}

async function verifyAllChunks(stagingPath: string, snapshot: NasGatewaySessionSnapshot): Promise<void> {
  if (snapshot.chunks.length !== snapshot.expectedChunks) {
    throw createNasError("nas.chunk_missing", "Cannot finalize NAS session because chunks are missing.", {
      expectedChunks: snapshot.expectedChunks,
      actualChunks: snapshot.chunks.length
    });
  }

  let totalBytes = 0;

  for (let index = 0; index < snapshot.expectedChunks; index += 1) {
    const record = snapshot.chunks[index];

    if (!record || record.index !== index) {
      throw createNasError("nas.chunk_missing", "Cannot finalize NAS session because a chunk is missing.", {
        index
      });
    }

    const chunkPath = resolveWithinRoot(stagingPath, record.path);
    const info = await stat(chunkPath);

    if (!info.isFile() || info.size !== record.sizeBytes) {
      throw createNasError("nas.invalid_chunk", "Staged chunk file does not match metadata.", {
        index,
        expectedSizeBytes: record.sizeBytes,
        actualSizeBytes: info.size
      });
    }

    if (record.checksum) {
      const bytes = await readFile(chunkPath);
      const checksum = createSha256(bytes);

      if (checksum.value !== record.checksum.value) {
        throw createNasError("nas.checksum_mismatch", "Staged chunk checksum changed before finalize.", {
          index
        });
      }
    }

    totalBytes += record.sizeBytes;
  }

  if (totalBytes !== snapshot.totalBytes) {
    throw createNasError("nas.invalid_chunk", "Staged chunks do not add up to expected total bytes.", {
      expectedTotalBytes: snapshot.totalBytes,
      actualTotalBytes: totalBytes
    });
  }
}

async function concatenateChunks(
  stagingPath: string,
  snapshot: NasGatewaySessionSnapshot,
  tempTargetPath: string
): Promise<void> {
  const output = createWriteStream(tempTargetPath, { flags: "w" });

  try {
    for (const chunk of snapshot.chunks) {
      const chunkPath = resolveWithinRoot(stagingPath, chunk.path);
      await pipeline(createReadStream(chunkPath), output, { end: false });
    }
  } finally {
    output.end();
  }

  await new Promise<void>((resolvePromise, rejectPromise) => {
    output.on("finish", resolvePromise);
    output.on("error", rejectPromise);
  });
}

function validateSessionShape(options: CreateNasSessionOptions): void {
  if (!Number.isSafeInteger(options.expectedChunks) || options.expectedChunks <= 0) {
    throw createNasError("nas.invalid_session", "expectedChunks must be a positive safe integer.");
  }

  if (!Number.isSafeInteger(options.totalBytes) || options.totalBytes < 0) {
    throw createNasError("nas.invalid_session", "totalBytes must be a non-negative safe integer.");
  }

  if (!isRecord(options.metadata ?? {})) {
    throw createNasError("nas.invalid_session", "metadata must be an object when provided.");
  }
}

function validateSessionId(sessionId: string): string {
  if (!sessionIdPattern.test(sessionId)) {
    throw createNasError("nas.invalid_session", "NAS session IDs must be URL-safe tokens.", {
      sessionId
    });
  }

  return sessionId;
}

function resolveTargetPath(targetRoot: string, targetRelativePath: string): string {
  return resolveWithinRoot(targetRoot, targetRelativePath);
}

function resolveWithinRoot(root: string, relativePath: string): string {
  if (!relativePath || relativePath.includes("\0") || isAbsolute(relativePath)) {
    throw createNasError("nas.unsafe_path", "Path must be a non-empty relative path.");
  }

  const normalized = normalize(relativePath);

  if (normalized === "." || normalized.startsWith(`..${sep}`) || normalized === "..") {
    throw createNasError("nas.unsafe_path", "Path traversal is not allowed.", {
      relativePath
    });
  }

  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, normalized);
  const rootRelativePath = relative(resolvedRoot, resolvedPath);

  if (rootRelativePath.startsWith("..") || isAbsolute(rootRelativePath)) {
    throw createNasError("nas.unsafe_path", "Resolved path escapes the configured root.", {
      relativePath
    });
  }

  return resolvedPath;
}

function normalizeExpiresAt(
  expiresAt: string | Date | undefined,
  createdAt: string,
  defaultExpiresInMs: number | undefined
): string | undefined {
  if (expiresAt instanceof Date) {
    return expiresAt.toISOString();
  }

  if (expiresAt) {
    return new Date(expiresAt).toISOString();
  }

  if (defaultExpiresInMs !== undefined) {
    return new Date(new Date(createdAt).getTime() + defaultExpiresInMs).toISOString();
  }

  return undefined;
}

function ensureSessionOpen(snapshot: NasGatewaySessionSnapshot): void {
  if (snapshot.status !== "staging") {
    throw createNasError("nas.session_closed", "NAS session is no longer open for writes.", {
      sessionId: snapshot.sessionId,
      status: snapshot.status
    });
  }
}

function ensureNotExpired(snapshot: NasGatewaySessionSnapshot, now: Date): void {
  if (isExpired(snapshot, now)) {
    throw createNasError("nas.session_expired", "NAS session is expired.", {
      sessionId: snapshot.sessionId
    });
  }
}

function isExpired(metadata: NasGatewaySessionMetadata, now: Date): boolean {
  return Boolean(metadata.expiresAt && new Date(metadata.expiresAt).getTime() <= now.getTime());
}

function sessionPath(stagingRoot: string, sessionId: string): string {
  return join(stagingRoot, validateSessionId(sessionId));
}

function chunkFileNameForIndex(index: number): string {
  return `${index.toString().padStart(8, "0")}.part`;
}

function metadataPath(stagingPath: string): string {
  return join(stagingPath, metadataFileName);
}

function fileLockPath(lockRoot: string, scope: NasGatewayLockScope, sessionId: string): string {
  return join(lockRoot, scope, `${validateSessionId(sessionId)}.lock`);
}

function fileLockMetadataPath(lockPath: string): string {
  return join(lockPath, lockMetadataFileName);
}

function validateLockScope(scope: NasGatewayLockScope): NasGatewayLockScope {
  if (scope !== "finalize") {
    throw createNasError("nas.lock_failed", "Unsupported NAS lock scope.", {
      scope
    });
  }

  return scope;
}

async function removeStaleFileLock(
  lockPath: string,
  staleLockMs: number | undefined,
  now: Date
): Promise<boolean> {
  if (staleLockMs === undefined) {
    return false;
  }

  if (!Number.isFinite(staleLockMs) || staleLockMs < 0) {
    throw createNasError("nas.lock_failed", "staleLockMs must be a non-negative finite number.");
  }

  let acquiredAt: Date;

  try {
    acquiredAt = await readFileLockAcquiredAt(lockPath);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return true;
    }

    throw createNasError("nas.lock_failed", toErrorMessage(error, "NAS lock metadata read failed."));
  }

  if (now.getTime() - acquiredAt.getTime() < staleLockMs) {
    return false;
  }

  try {
    await rm(lockPath, { force: true, recursive: true });
    return true;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return true;
    }

    throw createNasError("nas.lock_failed", toErrorMessage(error, "NAS stale lock cleanup failed."));
  }
}

async function readFileLockAcquiredAt(lockPath: string): Promise<Date> {
  const metadata = await readFileLockMetadata(lockPath);
  const acquiredAtTime = metadata ? new Date(metadata.acquiredAt).getTime() : NaN;

  if (Number.isFinite(acquiredAtTime)) {
    return new Date(acquiredAtTime);
  }

  const info = await stat(lockPath);
  return info.mtime;
}

async function readFileLockMetadata(lockPath: string): Promise<NasFileLockMetadata | undefined> {
  try {
    const raw = await readFile(fileLockMetadataPath(lockPath), "utf8");
    const parsed = JSON.parse(raw) as Partial<NasFileLockMetadata>;

    if (
      parsed.schemaVersion !== lockMetadataSchemaVersion ||
      parsed.scope !== "finalize" ||
      typeof parsed.ownerId !== "string" ||
      typeof parsed.sessionId !== "string" ||
      typeof parsed.acquiredAt !== "string"
    ) {
      return undefined;
    }

    return {
      schemaVersion: parsed.schemaVersion,
      acquiredAt: parsed.acquiredAt,
      ownerId: parsed.ownerId,
      scope: parsed.scope,
      sessionId: parsed.sessionId
    };
  } catch (error) {
    if (isNodeError(error, "ENOENT") || error instanceof SyntaxError) {
      return undefined;
    }

    throw error;
  }
}

async function releaseFileLock(lockPath: string, ownerId: string): Promise<void> {
  const metadata = await readFileLockMetadata(lockPath);

  if (!metadata || metadata.ownerId !== ownerId) {
    return;
  }

  await rm(lockPath, { force: true, recursive: true });
}

async function readSnapshot(
  stagingRoot: string,
  targetRoot: string,
  sessionId: string
): Promise<NasGatewaySessionSnapshot> {
  const stagingPath = sessionPath(stagingRoot, sessionId);
  const metadata = await readMetadata(stagingPath);

  return {
    ...metadata,
    stagingPath,
    targetPath: resolveTargetPath(targetRoot, metadata.targetRelativePath)
  };
}

async function readMetadata(stagingPath: string): Promise<NasGatewaySessionMetadata> {
  const metadata = await readMetadataOrUndefined(stagingPath);

  if (!metadata) {
    throw createNasError("nas.session_not_found", "NAS session metadata was not found.", {
      stagingPath
    });
  }

  return metadata;
}

async function readMetadataOrUndefined(stagingPath: string): Promise<NasGatewaySessionMetadata | undefined> {
  try {
    const raw = await readFile(metadataPath(stagingPath), "utf8");
    const parsed = JSON.parse(raw) as NasGatewaySessionMetadata;

    if (parsed.schemaVersion !== "large-image-ingest.nas-session.v0.1") {
      return undefined;
    }

    return parsed;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return undefined;
    }

    throw error;
  }
}

async function writeMetadata(
  stagingPath: string,
  metadata: NasGatewaySessionMetadata
): Promise<void> {
  await mkdir(stagingPath, { recursive: true });
  await writeFile(metadataPath(stagingPath), `${JSON.stringify(metadata, null, 2)}\n`);
}

function toMetadata(
  snapshot: NasGatewaySessionSnapshot,
  update: Partial<NasGatewaySessionMetadata>
): NasGatewaySessionMetadata {
  return {
    schemaVersion: snapshot.schemaVersion,
    sessionId: snapshot.sessionId,
    status: snapshot.status,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    expiresAt: snapshot.expiresAt,
    targetRelativePath: snapshot.targetRelativePath,
    totalBytes: snapshot.totalBytes,
    expectedChunks: snapshot.expectedChunks,
    metadata: snapshot.metadata,
    chunks: snapshot.chunks,
    finalizedAt: snapshot.finalizedAt,
    canceledAt: snapshot.canceledAt,
    ...update
  };
}

async function toUint8Array(body: NasGatewayChunkBody): Promise<Uint8Array> {
  if (body instanceof Blob) {
    return new Uint8Array(await body.arrayBuffer());
  }

  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body);
  }

  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }

  throw createNasError("nas.invalid_chunk", "Unsupported NAS chunk body type.");
}

function createSha256(bytes: Uint8Array): NasGatewayChecksum {
  return {
    algorithm: "sha256",
    value: createHash("sha256").update(bytes).digest("hex")
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return false;
    }

    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function createNasError(
  code: NasGatewayErrorCode,
  message: string,
  details?: Record<string, unknown>
): NasGatewayError {
  const error = new Error(message) as NasGatewayError;
  error.code = code;

  if (details) {
    error.details = details;
  }

  return error;
}

function isNasGatewayError(error: unknown): error is NasGatewayError {
  return Boolean(error && typeof error === "object" && "code" in error);
}

function isNodeError(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === code);
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return fallback;
}
