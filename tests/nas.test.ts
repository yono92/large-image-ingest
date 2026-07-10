import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createNasFileLockProvider, createNasGateway } from "../src/nas";

const tempRoots: string[] = [];

describe("createNasGateway", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
  });

  it("stages chunks and finalizes them atomically into the target root", async () => {
    const { gateway, targetRoot } = await createTempGateway();

    const session = await gateway.createSession({
      sessionId: "session-finalize",
      targetRelativePath: "inspection/wafer.bin",
      totalBytes: 11,
      expectedChunks: 3,
      metadata: {
        lotId: "LOT-1"
      }
    });

    await gateway.stageChunk({
      sessionId: session.sessionId,
      index: 0,
      body: new TextEncoder().encode("hello")
    });
    await gateway.stageChunk({
      sessionId: session.sessionId,
      index: 1,
      body: new TextEncoder().encode(" ")
    });
    await gateway.stageChunk({
      sessionId: session.sessionId,
      index: 2,
      body: new TextEncoder().encode("world")
    });

    const finalized = await gateway.finalizeSession({
      sessionId: session.sessionId
    });
    const finalBytes = await readFile(join(targetRoot, "inspection", "wafer.bin"), "utf8");

    expect(finalBytes).toBe("hello world");
    expect(finalized.status).toBe("finalized");
    expect(finalized.finalizedAt).toBeTruthy();
    expect(finalized.metadata).toEqual({ lotId: "LOT-1" });
  });

  it("rejects path traversal before creating a staging session", async () => {
    const { gateway, stagingRoot } = await createTempGateway();

    await expect(
      gateway.createSession({
        sessionId: "session-traversal",
        targetRelativePath: "../escape.bin",
        totalBytes: 1,
        expectedChunks: 1
      })
    ).rejects.toMatchObject({
      code: "nas.unsafe_path"
    });

    await expect(stat(join(stagingRoot, "session-traversal"))).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("rejects duplicate session IDs without replacing staged state", async () => {
    const { gateway } = await createTempGateway();
    await gateway.createSession({
      sessionId: "session-duplicate",
      targetRelativePath: "inspection/original.bin",
      totalBytes: 1,
      expectedChunks: 1,
      metadata: { lotId: "LOT-ORIGINAL" }
    });

    await expect(gateway.createSession({
      sessionId: "session-duplicate",
      targetRelativePath: "inspection/replacement.bin",
      totalBytes: 2,
      expectedChunks: 1,
      metadata: { lotId: "LOT-REPLACEMENT" }
    })).rejects.toMatchObject({ code: "nas.invalid_session" });

    await expect(gateway.getSession("session-duplicate")).resolves.toMatchObject({
      targetRelativePath: "inspection/original.bin",
      totalBytes: 1,
      metadata: { lotId: "LOT-ORIGINAL" }
    });
  });

  it("rejects finalize when a staged chunk is missing", async () => {
    const { gateway } = await createTempGateway();
    const session = await gateway.createSession({
      sessionId: "session-missing",
      targetRelativePath: "inspection/missing.bin",
      totalBytes: 2,
      expectedChunks: 2
    });

    await gateway.stageChunk({
      sessionId: session.sessionId,
      index: 0,
      body: new Uint8Array([1])
    });

    await expect(gateway.finalizeSession({ sessionId: session.sessionId })).rejects.toMatchObject({
      code: "nas.chunk_missing"
    });
  });

  it("rejects chunk checksum mismatch", async () => {
    const { gateway } = await createTempGateway();
    const session = await gateway.createSession({
      sessionId: "session-checksum",
      targetRelativePath: "inspection/checksum.bin",
      totalBytes: 1,
      expectedChunks: 1
    });

    await expect(
      gateway.stageChunk({
        sessionId: session.sessionId,
        index: 0,
        body: new Uint8Array([1]),
        checksum: {
          algorithm: "sha256",
          value: "not-the-real-checksum"
        }
      })
    ).rejects.toMatchObject({
      code: "nas.checksum_mismatch"
    });
  });

  it("does not overwrite an existing finalized target by default", async () => {
    const { gateway, targetRoot } = await createTempGateway();
    const first = await gateway.createSession({
      sessionId: "session-target-first",
      targetRelativePath: "inspection/existing.bin",
      totalBytes: 1,
      expectedChunks: 1
    });
    await gateway.stageChunk({ sessionId: first.sessionId, index: 0, body: new Uint8Array([1]) });
    await gateway.finalizeSession({ sessionId: first.sessionId });

    const second = await gateway.createSession({
      sessionId: "session-target-second",
      targetRelativePath: "inspection/existing.bin",
      totalBytes: 1,
      expectedChunks: 1
    });
    await gateway.stageChunk({ sessionId: second.sessionId, index: 0, body: new Uint8Array([2]) });

    await expect(gateway.finalizeSession({ sessionId: second.sessionId })).rejects.toMatchObject({
      code: "nas.target_exists"
    });
    expect(await readFile(join(targetRoot, "inspection", "existing.bin"))).toEqual(Buffer.from([1]));
  });

  it("uses shared file locks so another gateway cannot finalize the same session", async () => {
    const { root, stagingRoot, targetRoot } = await createTempRoots();
    const lockRoot = join(root, "locks");
    const lockProviderA = createNasFileLockProvider({ lockRoot });
    const lockProviderB = createNasFileLockProvider({ lockRoot });
    const gateway = createNasGateway({
      stagingRoot,
      targetRoot,
      lockProvider: lockProviderA
    });
    const otherGateway = createNasGateway({
      stagingRoot,
      targetRoot,
      lockProvider: lockProviderB
    });
    const session = await gateway.createSession({
      sessionId: "session-lock",
      targetRelativePath: "inspection/lock.bin",
      totalBytes: 1,
      expectedChunks: 1
    });

    await gateway.stageChunk({
      sessionId: session.sessionId,
      index: 0,
      body: new Uint8Array([1])
    });

    const heldLock = await lockProviderA.acquireLock({
      scope: "finalize",
      sessionId: session.sessionId
    });

    expect(heldLock).toBeDefined();

    await expect(otherGateway.finalizeSession({ sessionId: session.sessionId })).rejects.toMatchObject({
      code: "nas.finalize_locked"
    });

    await heldLock?.release();

    const finalized = await otherGateway.finalizeSession({
      sessionId: session.sessionId
    });

    expect(finalized.status).toBe("finalized");
  });

  it("can replace stale file locks without letting an old owner release the new lock", async () => {
    const { root } = await createTempRoots();
    const lockRoot = join(root, "locks");
    const oldProvider = createNasFileLockProvider({
      clock: () => new Date("2026-01-01T00:00:00.000Z"),
      lockRoot
    });
    const newProvider = createNasFileLockProvider({
      clock: () => new Date("2026-01-01T00:00:02.000Z"),
      lockRoot,
      staleLockMs: 1000
    });
    const observerProvider = createNasFileLockProvider({ lockRoot });

    const oldLock = await oldProvider.acquireLock({
      scope: "finalize",
      sessionId: "session-stale"
    });
    const newLock = await newProvider.acquireLock({
      scope: "finalize",
      sessionId: "session-stale"
    });

    expect(oldLock).toBeDefined();
    expect(newLock).toBeDefined();

    await oldLock?.release();

    await expect(observerProvider.acquireLock({
      scope: "finalize",
      sessionId: "session-stale"
    })).resolves.toBeUndefined();

    await newLock?.release();

    await expect(observerProvider.acquireLock({
      scope: "finalize",
      sessionId: "session-stale"
    })).resolves.toBeDefined();
  });

  it("removes canceled sessions and expired staging sessions during cleanup", async () => {
    const { gateway, stagingRoot } = await createTempGateway();
    const canceled = await gateway.createSession({
      sessionId: "session-cancel",
      targetRelativePath: "inspection/cancel.bin",
      totalBytes: 1,
      expectedChunks: 1
    });
    const expired = await gateway.createSession({
      sessionId: "session-expired",
      targetRelativePath: "inspection/expired.bin",
      totalBytes: 1,
      expectedChunks: 1,
      expiresAt: "2026-01-01T00:00:00.000Z"
    });

    await gateway.cancelSession({ sessionId: canceled.sessionId });
    const cleanup = await gateway.cleanupExpiredSessions({
      now: new Date("2026-01-02T00:00:00.000Z")
    });

    expect(cleanup.removedSessionIds).toContain(expired.sessionId);
    await expect(stat(join(stagingRoot, canceled.sessionId))).rejects.toMatchObject({
      code: "ENOENT"
    });
    await expect(stat(join(stagingRoot, expired.sessionId))).rejects.toMatchObject({
      code: "ENOENT"
    });
  });
});

async function createTempGateway(): Promise<{
  gateway: ReturnType<typeof createNasGateway>;
  root: string;
  stagingRoot: string;
  targetRoot: string;
}> {
  const { root, stagingRoot, targetRoot } = await createTempRoots();

  return {
    gateway: createNasGateway({
      stagingRoot,
      targetRoot
    }),
    root,
    stagingRoot,
    targetRoot
  };
}

async function createTempRoots(): Promise<{
  root: string;
  stagingRoot: string;
  targetRoot: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "large-image-ingest-nas-"));
  tempRoots.push(root);

  const stagingRoot = join(root, "staging");
  const targetRoot = join(root, "target");

  return {
    root,
    stagingRoot,
    targetRoot
  };
}
