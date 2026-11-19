// Part of nas.ts, split out to keep modules under 500 lines; public exports stay on nas.ts.
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { NasFileLockProviderOptions, NasGateway, NasGatewayLock, NasGatewayLockProvider, NasGatewayOptions, NasGatewaySessionMetadata } from "./nas.js";
import { acquireSessionMutationLock, assertNoSymlinkEscape, chunkFileNameForIndex, concatenateChunks, ensureNotExpired, ensureSessionOpen, fileLockMetadataPath, fileLockPath, isExpired, normalizeExpiresAt, releaseFileLock, releaseSessionMutationLock, removeStaleFileLock, resolveTargetPath, resolveWithinRoot, sessionPath, validateLockScope, validateSessionId, validateSessionShape, verifyAllChunks, verifyFinalizedTarget } from "./nas-integrity.js";
import { cleanupMetadataCandidates, cleanupUnreferencedChunkArtifacts, createNasError, createSha256, exists, isNasGatewayError, isNodeError, readMetadataOrUndefined, readSnapshot, toErrorMessage, toMetadata, toUint8Array, writeMetadata } from "./nas-metadata.js";
import { chunksDirectoryName, defaultLockRootDirectoryName, lockMetadataSchemaVersion, sessionIdPattern } from "./nas-shared.js";
import type { NasFileLockMetadata } from "./nas-shared.js";

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
      const lock = await acquireSessionMutationLock(lockProvider, safeSessionId, clock, "skip");

      if (!lock) {
        return readSnapshot(stagingRoot, targetRoot, safeSessionId);
      }

      let operationError: unknown;

      try {
        await cleanupMetadataCandidates(sessionPath(stagingRoot, safeSessionId));
        return await readSnapshot(stagingRoot, targetRoot, safeSessionId);
      } catch (error) {
        operationError = error;
        throw error;
      } finally {
        await releaseSessionMutationLock(lock, safeSessionId, operationError);
      }
    },

    async stageChunk(stageOptions) {
      const safeSessionId = validateSessionId(stageOptions.sessionId);
      if (!Number.isSafeInteger(stageOptions.index) || stageOptions.index < 0) {
        throw createNasError("nas.invalid_chunk", "Chunk index must be a non-negative safe integer.", {
          index: stageOptions.index
        });
      }
      const body = await toUint8Array(stageOptions.body);
      const checksum = createSha256(body);

      if (stageOptions.checksum && stageOptions.checksum.value !== checksum.value) {
        throw createNasError("nas.checksum_mismatch", "Chunk checksum does not match expected value.", {
          index: stageOptions.index
        });
      }
      const lock = await acquireSessionMutationLock(lockProvider, safeSessionId, clock, "wait");
      if (!lock) {
        throw createNasError("nas.lock_failed", "NAS session lock was not acquired.", {
          sessionId: safeSessionId
        });
      }
      let operationError: unknown;

      try {
        const stagingPath = sessionPath(stagingRoot, safeSessionId);
        await cleanupMetadataCandidates(stagingPath);
        const snapshot = await readSnapshot(stagingRoot, targetRoot, safeSessionId);
        ensureSessionOpen(snapshot);
        ensureNotExpired(snapshot, clock());

        if (stageOptions.index >= snapshot.expectedChunks) {
          throw createNasError("nas.invalid_chunk", "Chunk index exceeds expected chunk count.", {
            index: stageOptions.index,
            expectedChunks: snapshot.expectedChunks
          });
        }

        await cleanupUnreferencedChunkArtifacts(stagingPath, snapshot.chunks);

        const chunkFileName = chunkFileNameForIndex(stageOptions.index, randomUUID());
        const relativeChunkPath = join(chunksDirectoryName, chunkFileName);
        const chunkPath = join(stagingPath, relativeChunkPath);
        const tempChunkPath = `${chunkPath}.${randomUUID()}.tmp`;
        const previousChunk = snapshot.chunks.find((chunk) => chunk.index === stageOptions.index);

        try {
          await writeFile(tempChunkPath, body);
          await rename(tempChunkPath, chunkPath);
        } finally {
          await rm(tempChunkPath, { force: true }).catch(() => {});
        }

        const existing = new Map(snapshot.chunks.map((chunk) => [chunk.index, chunk]));
        existing.set(stageOptions.index, {
          checksum,
          index: stageOptions.index,
          path: relativeChunkPath,
          sizeBytes: body.byteLength,
          stagedAt: clock().toISOString()
        });

        const metadata = toMetadata(snapshot, {
          chunks: Array.from(existing.values()).sort((left, right) => left.index - right.index),
          updatedAt: clock().toISOString()
        });

        try {
          await writeMetadata(stagingPath, metadata);
        } catch (error) {
          await rm(chunkPath, { force: true }).catch(() => {});
          throw error;
        }

        if (previousChunk && previousChunk.path !== relativeChunkPath) {
          await rm(resolveWithinRoot(stagingPath, previousChunk.path), { force: true }).catch(() => {});
        }

        return {
          ...metadata,
          stagingPath,
          targetPath: resolveTargetPath(targetRoot, metadata.targetRelativePath)
        };
      } catch (error) {
        operationError = error;
        throw error;
      } finally {
        await releaseSessionMutationLock(lock, safeSessionId, operationError);
      }
    },

    async finalizeSession(finalizeOptions) {
      const safeSessionId = validateSessionId(finalizeOptions.sessionId);
      const lock = await acquireFinalizeLock(lockProvider, safeSessionId, clock());
      let finalizeError: unknown;

      try {
        const stagingPath = sessionPath(stagingRoot, safeSessionId);
        await cleanupMetadataCandidates(stagingPath);
        const snapshot = await readSnapshot(stagingRoot, targetRoot, safeSessionId);
        if (snapshot.status === "finalized") {
          await verifyFinalizedTarget(stagingPath, snapshot);
          return snapshot;
        }
        ensureSessionOpen(snapshot);
        ensureNotExpired(snapshot, clock());
        await cleanupUnreferencedChunkArtifacts(stagingPath, snapshot.chunks);
        await verifyAllChunks(stagingPath, snapshot);

        const targetPath = resolveTargetPath(targetRoot, snapshot.targetRelativePath);
        const tempTargetPath = `${targetPath}.tmp-${safeSessionId}`;

        await assertNoSymlinkEscape(targetRoot, dirname(targetPath));
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
      const lock = await acquireSessionMutationLock(lockProvider, safeSessionId, clock, "wait");
      if (!lock) {
        throw createNasError("nas.lock_failed", "NAS session lock was not acquired.", {
          sessionId: safeSessionId
        });
      }
      let operationError: unknown;

      try {
        const stagingPath = sessionPath(stagingRoot, safeSessionId);
        await cleanupMetadataCandidates(stagingPath);
        const snapshot = await readSnapshot(stagingRoot, targetRoot, safeSessionId);
        ensureSessionOpen(snapshot);
        const canceledAt = clock().toISOString();
        const metadata = toMetadata(snapshot, {
          canceledAt,
          status: "canceled",
          updatedAt: canceledAt
        });

        await writeMetadata(stagingPath, metadata);
        await rm(stagingPath, { force: true, recursive: true });
      } catch (error) {
        operationError = error;
        throw error;
      } finally {
        await releaseSessionMutationLock(lock, safeSessionId, operationError);
      }
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
          const lock = await acquireSessionMutationLock(lockProvider, entry.name, clock, "skip");
          if (!lock) {
            continue;
          }

          let cleanupError: unknown;
          try {
            await cleanupMetadataCandidates(stagingPath);
            const currentMetadata = await readMetadataOrUndefined(stagingPath);

            if (currentMetadata && (currentMetadata.status === "canceled" || isExpired(currentMetadata, now))) {
              await rm(stagingPath, { force: true, recursive: true });
              removedSessionIds.push(entry.name);
            }
          } catch (error) {
            cleanupError = error;
            throw createNasError("nas.cleanup_failed", toErrorMessage(error, "NAS cleanup failed."), {
              sessionId: entry.name
            });
          } finally {
            await releaseSessionMutationLock(lock, entry.name, cleanupError);
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
          if (isNodeError(error, "EPERM") || isNodeError(error, "ENOTEMPTY")) {
            return undefined;
          }

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
  const lock = await acquireSessionMutationLock(lockProvider, sessionId, () => now, "fail");

  if (!lock) {
    throw createNasError("nas.finalize_locked", "NAS session is already finalizing.", {
      sessionId
    });
  }

  return lock;
}
