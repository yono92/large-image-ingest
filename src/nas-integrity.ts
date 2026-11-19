// Part of nas.ts, split out to keep modules under 500 lines; public exports stay on nas.ts.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  realpath,
  rm,
  stat
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep
} from "node:path";
import { pipeline } from "node:stream/promises";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import type { CreateNasSessionOptions, NasGatewayLock, NasGatewayLockProvider, NasGatewayLockScope, NasGatewaySessionMetadata, NasGatewaySessionSnapshot } from "./nas.js";
import { createNasError, createSha256, exists, isNasGatewayError, isNodeError, isRecord, toErrorMessage } from "./nas-metadata.js";
import { lockMetadataFileName, lockMetadataSchemaVersion, metadataFileName, sessionIdPattern, sessionLockWaitTimeoutMs } from "./nas-shared.js";
import type { NasFileLockMetadata, SessionLockContentionMode } from "./nas-shared.js";

export async function acquireSessionMutationLock(
  lockProvider: NasGatewayLockProvider,
  sessionId: string,
  clock: () => Date,
  contentionMode: SessionLockContentionMode
): Promise<NasGatewayLock | undefined> {
  const startedAt = Date.now();

  while (true) {
    let lock: NasGatewayLock | undefined;

    try {
      lock = await lockProvider.acquireLock({
        now: clock(),
        scope: "finalize",
        sessionId
      });
    } catch (error) {
      if (isNasGatewayError(error)) {
        throw error;
      }

      throw createNasError("nas.lock_failed", toErrorMessage(error, "NAS session lock acquire failed."), {
        sessionId
      });
    }

    if (lock) {
      return lock;
    }

    if (contentionMode === "skip") {
      return undefined;
    }

    if (contentionMode === "fail") {
      throw createNasError("nas.finalize_locked", "NAS session is already finalizing.", {
        sessionId
      });
    }

    if (Date.now() - startedAt >= sessionLockWaitTimeoutMs) {
      throw createNasError("nas.lock_failed", "Timed out waiting for the NAS session lock.", {
        sessionId
      });
    }

    await yieldToEventLoop();
  }
}

export async function releaseSessionMutationLock(
  lock: NasGatewayLock,
  sessionId: string,
  operationError: unknown
): Promise<void> {
  try {
    await lock.release();
  } catch (releaseError) {
    if (!operationError) {
      throw createNasError("nas.lock_failed", toErrorMessage(releaseError, "NAS session lock release failed."), {
        sessionId
      });
    }
  }
}

export async function verifyAllChunks(stagingPath: string, snapshot: NasGatewaySessionSnapshot): Promise<void> {
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

export async function verifyFinalizedTarget(
  stagingPath: string,
  snapshot: NasGatewaySessionSnapshot
): Promise<void> {
  await verifyAllChunks(stagingPath, snapshot);

  let targetInfo;
  try {
    targetInfo = await stat(snapshot.targetPath);
  } catch {
    throw createNasError("nas.finalize_failed", "Finalized NAS target is unavailable.");
  }

  if (!targetInfo.isFile() || targetInfo.size !== snapshot.totalBytes) {
    throw createNasError("nas.checksum_mismatch", "Finalized NAS target size changed after completion.");
  }

  const stagedHash = createHash("sha256");
  for (const chunk of [...snapshot.chunks].sort((left, right) => left.index - right.index)) {
    const chunkPath = resolveWithinRoot(stagingPath, chunk.path);
    for await (const bytes of createReadStream(chunkPath)) {
      stagedHash.update(bytes);
    }
  }

  const targetHash = createHash("sha256");
  for await (const bytes of createReadStream(snapshot.targetPath)) {
    targetHash.update(bytes);
  }

  if (stagedHash.digest("hex") !== targetHash.digest("hex")) {
    throw createNasError("nas.checksum_mismatch", "Finalized NAS target bytes changed after completion.");
  }
}

export async function concatenateChunks(
  stagingPath: string,
  snapshot: NasGatewaySessionSnapshot,
  tempTargetPath: string
): Promise<void> {
  async function* readChunks(): AsyncGenerator<Buffer> {
    for (const chunk of snapshot.chunks) {
      const chunkPath = resolveWithinRoot(stagingPath, chunk.path);
      for await (const bytes of createReadStream(chunkPath)) {
        yield bytes as Buffer;
      }
    }
  }

  await pipeline(readChunks(), createWriteStream(tempTargetPath, { flags: "w" }));
}

export function validateSessionShape(options: CreateNasSessionOptions): void {
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

export function validateSessionId(sessionId: string): string {
  if (!sessionIdPattern.test(sessionId)) {
    throw createNasError("nas.invalid_session", "NAS session IDs must be URL-safe tokens.", {
      sessionId
    });
  }

  return sessionId;
}

export function resolveTargetPath(targetRoot: string, targetRelativePath: string): string {
  return resolveWithinRoot(targetRoot, targetRelativePath);
}

export function resolveWithinRoot(root: string, relativePath: string): string {
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

  if (escapesRoot(rootRelativePath)) {
    throw createNasError("nas.unsafe_path", "Resolved path escapes the configured root.", {
      relativePath
    });
  }

  return resolvedPath;
}

function escapesRoot(rootRelativePath: string): boolean {
  return rootRelativePath === ".." || rootRelativePath.startsWith(`..${sep}`) || isAbsolute(rootRelativePath);
}

/**
 * Lexical checks cannot see symlinks. Before creating or writing under
 * `directory`, resolve its deepest existing ancestor and require it to stay
 * inside the real root.
 */
export async function assertNoSymlinkEscape(root: string, directory: string): Promise<void> {
  await mkdir(root, { recursive: true });
  const realRoot = await realpath(root);
  let existing = directory;
  while (!(await exists(existing))) {
    const parent = dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  if (escapesRoot(relative(realRoot, await realpath(existing)))) {
    throw createNasError("nas.unsafe_path", "Resolved path escapes the configured root.");
  }
}

export function normalizeExpiresAt(
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

export function ensureSessionOpen(snapshot: NasGatewaySessionSnapshot): void {
  if (snapshot.status !== "staging") {
    throw createNasError("nas.session_closed", "NAS session is no longer open for writes.", {
      sessionId: snapshot.sessionId,
      status: snapshot.status
    });
  }
}

export function ensureNotExpired(snapshot: NasGatewaySessionSnapshot, now: Date): void {
  if (isExpired(snapshot, now)) {
    throw createNasError("nas.session_expired", "NAS session is expired.", {
      sessionId: snapshot.sessionId
    });
  }
}

export function isExpired(metadata: NasGatewaySessionMetadata, now: Date): boolean {
  return Boolean(metadata.expiresAt && new Date(metadata.expiresAt).getTime() <= now.getTime());
}

export function sessionPath(stagingRoot: string, sessionId: string): string {
  return join(stagingRoot, validateSessionId(sessionId));
}

export function chunkFileNameForIndex(index: number, generation: string): string {
  return `${index.toString().padStart(8, "0")}-${generation}.part`;
}

export function metadataPath(stagingPath: string): string {
  return join(stagingPath, metadataFileName);
}

export function fileLockPath(lockRoot: string, scope: NasGatewayLockScope, sessionId: string): string {
  return join(lockRoot, scope, `${validateSessionId(sessionId)}.lock`);
}

export function fileLockMetadataPath(lockPath: string): string {
  return join(lockPath, lockMetadataFileName);
}

export function validateLockScope(scope: NasGatewayLockScope): NasGatewayLockScope {
  if (scope !== "finalize") {
    throw createNasError("nas.lock_failed", "Unsupported NAS lock scope.", {
      scope
    });
  }

  return scope;
}

export async function removeStaleFileLock(
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

export async function releaseFileLock(lockPath: string, ownerId: string): Promise<void> {
  const metadata = await readFileLockMetadata(lockPath);

  if (!metadata || metadata.ownerId !== ownerId) {
    return;
  }

  await rm(lockPath, { force: true, recursive: true });
}
