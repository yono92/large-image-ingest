import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNasFileLockProvider, createNasGateway } from "../src/nas";

const metadataIoControl = vi.hoisted(() => ({
  candidateWriteFailure: false,
  promotionFailure: false,
  promotionPause: undefined as Promise<void> | undefined,
  notifyPromotion: undefined as (() => void) | undefined
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();

  return {
    ...actual,
    async writeFile(...args: Parameters<typeof actual.writeFile>) {
      if (metadataIoControl.candidateWriteFailure && String(args[0]).includes("metadata.json.candidate-")) {
        const error = new Error("Injected metadata candidate write failure.") as NodeJS.ErrnoException;
        error.code = "EIO";
        throw error;
      }

      return Reflect.apply(actual.writeFile, actual, args);
    },
    async rename(oldPath: Parameters<typeof actual.rename>[0], newPath: Parameters<typeof actual.rename>[1]) {
      if (String(newPath).endsWith("metadata.json")) {
        metadataIoControl.notifyPromotion?.();
        if (metadataIoControl.promotionPause) {
          await metadataIoControl.promotionPause;
        }
      }

      if (metadataIoControl.promotionFailure && String(newPath).endsWith("metadata.json")) {
        const error = new Error("Injected metadata promotion failure.") as NodeJS.ErrnoException;
        error.code = "EIO";
        throw error;
      }

      return actual.rename(oldPath, newPath);
    }
  };
});

const tempRoots: string[] = [];

describe("createNasGateway", () => {
  afterEach(async () => {
    metadataIoControl.candidateWriteFailure = false;
    metadataIoControl.promotionFailure = false;
    metadataIoControl.promotionPause = undefined;
    metadataIoControl.notifyPromotion = undefined;
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

  it("preserves all chunks staged concurrently through shared gateway instances", async () => {
    const { root, stagingRoot, targetRoot } = await createTempRoots();
    const gatewayA = createNasGateway({ stagingRoot, targetRoot });
    const gatewayB = createNasGateway({ stagingRoot, targetRoot });
    const expectedBytes = Uint8Array.from({ length: 16 }, (_, index) => index);
    const runCount = readConcurrencyRunCount();

    for (let run = 0; run < runCount; run += 1) {
      const sessionId = `session-concurrent-${run}`;
      await gatewayA.createSession({
        sessionId,
        targetRelativePath: `inspection/concurrent-${run}.bin`,
        totalBytes: expectedBytes.byteLength,
        expectedChunks: expectedBytes.byteLength
      });

      await Promise.all(Array.from(expectedBytes, (byte, index) => (
        index % 2 === 0 ? gatewayA : gatewayB
      ).stageChunk({
        sessionId,
        index,
        body: new Uint8Array([byte])
      })));

      const snapshot = await gatewayA.getSession(sessionId);
      expect(snapshot.chunks.map((chunk) => chunk.index)).toEqual(
        Array.from({ length: expectedBytes.byteLength }, (_, index) => index)
      );

      await gatewayB.finalizeSession({ sessionId });
      expect(await readFile(join(targetRoot, `inspection/concurrent-${run}.bin`))).toEqual(
        Buffer.from(expectedBytes)
      );
    }

    await rm(root, { force: true, recursive: true });
  }, 120_000);

  it("keeps same-index replacement bytes and metadata consistent", async () => {
    const { stagingRoot, targetRoot } = await createTempRoots();
    const gatewayA = createNasGateway({ stagingRoot, targetRoot });
    const gatewayB = createNasGateway({ stagingRoot, targetRoot });
    const session = await gatewayA.createSession({
      sessionId: "session-same-index",
      targetRelativePath: "inspection/same-index.bin",
      totalBytes: 3,
      expectedChunks: 1
    });
    const candidates = [new Uint8Array([1, 2, 3]), new Uint8Array([7, 8, 9])];

    await Promise.all([
      gatewayA.stageChunk({ sessionId: session.sessionId, index: 0, body: candidates[0] }),
      gatewayB.stageChunk({ sessionId: session.sessionId, index: 0, body: candidates[1] })
    ]);

    const snapshot = await gatewayA.getSession(session.sessionId);
    const record = snapshot.chunks[0];
    expect(record).toBeDefined();
    const stored = await readFile(join(stagingRoot, session.sessionId, record?.path ?? ""));
    expect(candidates.some((candidate) => stored.equals(Buffer.from(candidate)))).toBe(true);
    expect(record?.checksum?.value).toBe(createHash("sha256").update(stored).digest("hex"));
  });

  it("does not block mutations for a different session", async () => {
    const { root, stagingRoot, targetRoot } = await createTempRoots();
    const lockProvider = createNasFileLockProvider({ lockRoot: join(root, "locks") });
    const gateway = createNasGateway({ stagingRoot, targetRoot, lockProvider });
    await gateway.createSession({
      sessionId: "session-blocked",
      targetRelativePath: "inspection/blocked.bin",
      totalBytes: 1,
      expectedChunks: 1
    });
    await gateway.createSession({
      sessionId: "session-free",
      targetRelativePath: "inspection/free.bin",
      totalBytes: 1,
      expectedChunks: 1
    });
    const heldLock = await lockProvider.acquireLock({ scope: "finalize", sessionId: "session-blocked" });
    const blockedStage = gateway.stageChunk({
      sessionId: "session-blocked",
      index: 0,
      body: new Uint8Array([1])
    });

    await expect(Promise.race([
      gateway.stageChunk({ sessionId: "session-free", index: 0, body: new Uint8Array([2]) }),
      rejectAfter(1000, "Independent session was blocked.")
    ])).resolves.toMatchObject({ sessionId: "session-free" });

    await heldLock?.release();
    await expect(blockedStage).resolves.toMatchObject({ sessionId: "session-blocked" });
  });

  it("orders stage against finalize and cancel without post-terminal mutation", async () => {
    const { root, stagingRoot, targetRoot } = await createTempRoots();
    const lockProvider = createNasFileLockProvider({ lockRoot: join(root, "locks") });
    const gatewayA = createNasGateway({ stagingRoot, targetRoot, lockProvider });
    const gatewayB = createNasGateway({ stagingRoot, targetRoot, lockProvider });
    const finalizeSession = await gatewayA.createSession({
      sessionId: "session-stage-finalize",
      targetRelativePath: "inspection/stage-finalize.bin",
      totalBytes: 1,
      expectedChunks: 1
    });
    const finalizeLock = await lockProvider.acquireLock({
      scope: "finalize",
      sessionId: finalizeSession.sessionId
    });
    const waitingStage = gatewayA.stageChunk({
      sessionId: finalizeSession.sessionId,
      index: 0,
      body: new Uint8Array([1])
    });

    await expect(gatewayB.finalizeSession({ sessionId: finalizeSession.sessionId })).rejects.toMatchObject({
      code: "nas.finalize_locked"
    });
    await finalizeLock?.release();
    await waitingStage;
    await gatewayB.finalizeSession({ sessionId: finalizeSession.sessionId });
    await expect(gatewayA.stageChunk({
      sessionId: finalizeSession.sessionId,
      index: 0,
      body: new Uint8Array([2])
    })).rejects.toMatchObject({ code: "nas.session_closed" });

    const cancelSession = await gatewayA.createSession({
      sessionId: "session-stage-cancel",
      targetRelativePath: "inspection/stage-cancel.bin",
      totalBytes: 1,
      expectedChunks: 1
    });
    const cancelLock = await lockProvider.acquireLock({
      scope: "finalize",
      sessionId: cancelSession.sessionId
    });
    const stageResult = gatewayA.stageChunk({
      sessionId: cancelSession.sessionId,
      index: 0,
      body: new Uint8Array([1])
    });
    const cancelResult = gatewayB.cancelSession({ sessionId: cancelSession.sessionId });

    await cancelLock?.release();
    const results = await Promise.allSettled([stageResult, cancelResult]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    await expect(stat(join(stagingRoot, cancelSession.sessionId))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(gatewayA.stageChunk({
      sessionId: cancelSession.sessionId,
      index: 0,
      body: new Uint8Array([2])
    })).rejects.toMatchObject({ code: "nas.session_not_found" });
  });

  it("repeatedly produces valid outcomes for direct lifecycle races", async () => {
    const { stagingRoot, targetRoot } = await createTempRoots();
    const gatewayA = createNasGateway({ stagingRoot, targetRoot });
    const gatewayB = createNasGateway({ stagingRoot, targetRoot });

    for (let run = 0; run < 10; run += 1) {
      const finalizeSessionId = `session-direct-finalize-${run}`;
      const finalizeTarget = join(targetRoot, `inspection/direct-finalize-${run}.bin`);
      await gatewayA.createSession({
        sessionId: finalizeSessionId,
        targetRelativePath: `inspection/direct-finalize-${run}.bin`,
        totalBytes: 1,
        expectedChunks: 1
      });
      await gatewayA.stageChunk({ sessionId: finalizeSessionId, index: 0, body: new Uint8Array([1]) });

      const [stageResult, finalizeResult] = await Promise.allSettled([
        gatewayA.stageChunk({ sessionId: finalizeSessionId, index: 0, body: new Uint8Array([2]) }),
        gatewayB.finalizeSession({ sessionId: finalizeSessionId })
      ]);

      if (finalizeResult.status === "fulfilled") {
        expect([1, 2]).toContain((await readFile(finalizeTarget))[0]);
        if (stageResult.status === "rejected") {
          expect(["nas.session_closed", "nas.session_not_found"]).toContain(stageResult.reason.code);
        }
      } else {
        expect(finalizeResult.reason).toMatchObject({ code: "nas.finalize_locked" });
        expect(stageResult.status).toBe("fulfilled");
        const snapshot = await gatewayA.getSession(finalizeSessionId);
        const stored = await readFile(join(stagingRoot, finalizeSessionId, snapshot.chunks[0]?.path ?? ""));
        expect(snapshot.chunks[0]?.checksum?.value).toBe(createHash("sha256").update(stored).digest("hex"));
        await gatewayB.finalizeSession({ sessionId: finalizeSessionId });
      }

      const cancelSessionId = `session-direct-cancel-${run}`;
      await gatewayA.createSession({
        sessionId: cancelSessionId,
        targetRelativePath: `inspection/direct-cancel-${run}.bin`,
        totalBytes: 1,
        expectedChunks: 1
      });

      const [cancelStageResult, cancelResult] = await Promise.allSettled([
        gatewayA.stageChunk({ sessionId: cancelSessionId, index: 0, body: new Uint8Array([3]) }),
        gatewayB.cancelSession({ sessionId: cancelSessionId })
      ]);

      expect(cancelResult.status).toBe("fulfilled");
      if (cancelStageResult.status === "rejected") {
        expect(["nas.session_closed", "nas.session_not_found"]).toContain(cancelStageResult.reason.code);
      }
      await expect(stat(join(stagingRoot, cancelSessionId))).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("skips expired cleanup while a session mutation lock is live", async () => {
    const { root, stagingRoot, targetRoot } = await createTempRoots();
    const lockProvider = createNasFileLockProvider({ lockRoot: join(root, "locks") });
    const gateway = createNasGateway({ stagingRoot, targetRoot, lockProvider });
    const session = await gateway.createSession({
      sessionId: "session-cleanup-locked",
      targetRelativePath: "inspection/cleanup-locked.bin",
      totalBytes: 1,
      expectedChunks: 1,
      expiresAt: "2026-01-01T00:00:00.000Z"
    });
    const heldLock = await lockProvider.acquireLock({ scope: "finalize", sessionId: session.sessionId });

    const firstCleanup = await gateway.cleanupExpiredSessions({ now: new Date("2026-01-02T00:00:00.000Z") });
    expect(firstCleanup.removedSessionIds).not.toContain(session.sessionId);
    await expect(gateway.getSession(session.sessionId)).resolves.toBeDefined();

    await heldLock?.release();
    const secondCleanup = await gateway.cleanupExpiredSessions({ now: new Date("2026-01-02T00:00:00.000Z") });
    expect(secondCleanup.removedSessionIds).toContain(session.sessionId);
  });

  it("preserves committed metadata when promotion fails and cleans abandoned candidates", async () => {
    const { stagingRoot, targetRoot } = await createTempRoots();
    const gateway = createNasGateway({ stagingRoot, targetRoot });
    const session = await gateway.createSession({
      sessionId: "session-metadata-failure",
      targetRelativePath: "inspection/metadata-failure.bin",
      totalBytes: 2,
      expectedChunks: 2
    });
    await gateway.stageChunk({ sessionId: session.sessionId, index: 0, body: new Uint8Array([1]) });
    const sessionRoot = join(stagingRoot, session.sessionId);
    const metadataPath = join(sessionRoot, "metadata.json");
    const beforeFailure = await readFile(metadataPath, "utf8");

    metadataIoControl.candidateWriteFailure = true;
    await expect(gateway.stageChunk({
      sessionId: session.sessionId,
      index: 1,
      body: new Uint8Array([2])
    })).rejects.toThrow("Injected metadata candidate write failure");
    metadataIoControl.candidateWriteFailure = false;

    expect(await readFile(metadataPath, "utf8")).toBe(beforeFailure);
    expect((await readdir(sessionRoot)).filter(isMetadataCandidate)).toEqual([]);

    metadataIoControl.promotionFailure = true;
    await expect(gateway.stageChunk({
      sessionId: session.sessionId,
      index: 1,
      body: new Uint8Array([2])
    })).rejects.toThrow("Injected metadata promotion failure");
    metadataIoControl.promotionFailure = false;

    expect(await readFile(metadataPath, "utf8")).toBe(beforeFailure);
    await expect(gateway.getSession(session.sessionId)).resolves.toMatchObject({
      chunks: [{ index: 0 }]
    });
    expect((await readdir(sessionRoot)).filter(isMetadataCandidate)).toEqual([]);

    const abandonedCandidate = join(sessionRoot, "metadata.json.candidate-abandoned.tmp");
    await writeFile(abandonedCandidate, "abandoned");
    await gateway.getSession(session.sessionId);
    expect((await readdir(sessionRoot)).filter(isMetadataCandidate)).toEqual([]);
    await gateway.stageChunk({ sessionId: session.sessionId, index: 1, body: new Uint8Array([2]) });
    expect((await readdir(sessionRoot)).filter(isMetadataCandidate)).toEqual([]);
  });

  it("shows readers only committed metadata while promotion is paused", async () => {
    const { stagingRoot, targetRoot } = await createTempRoots();
    const gatewayA = createNasGateway({ stagingRoot, targetRoot });
    const gatewayB = createNasGateway({ stagingRoot, targetRoot });
    const session = await gatewayA.createSession({
      sessionId: "session-reader-visibility",
      targetRelativePath: "inspection/reader-visibility.bin",
      totalBytes: 2,
      expectedChunks: 2
    });
    await gatewayA.stageChunk({ sessionId: session.sessionId, index: 0, body: new Uint8Array([1]) });

    let releasePromotion!: () => void;
    let notifyPromotion!: () => void;
    metadataIoControl.promotionPause = new Promise<void>((resolvePromise) => {
      releasePromotion = resolvePromise;
    });
    const promotionEntered = new Promise<void>((resolvePromise) => {
      notifyPromotion = resolvePromise;
    });
    metadataIoControl.notifyPromotion = notifyPromotion;

    const staging = gatewayA.stageChunk({
      sessionId: session.sessionId,
      index: 1,
      body: new Uint8Array([2])
    });
    await promotionEntered;

    const duringPromotion = await gatewayB.getSession(session.sessionId);
    expect(duringPromotion.chunks.map((chunk) => chunk.index)).toEqual([0]);
    expect((await readdir(join(stagingRoot, session.sessionId))).filter(isMetadataCandidate)).toHaveLength(1);

    releasePromotion();
    await staging;
    metadataIoControl.promotionPause = undefined;
    metadataIoControl.notifyPromotion = undefined;

    const afterPromotion = await gatewayB.getSession(session.sessionId);
    expect(afterPromotion.chunks.map((chunk) => chunk.index)).toEqual([0, 1]);
    expect((await readdir(join(stagingRoot, session.sessionId))).filter(isMetadataCandidate)).toEqual([]);
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

function isMetadataCandidate(fileName: string): boolean {
  return fileName.startsWith("metadata.json.candidate-") && fileName.endsWith(".tmp");
}

function readConcurrencyRunCount(): number {
  const value = Number(process.env.LII_NAS_CONCURRENCY_RUNS ?? 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("LII_NAS_CONCURRENCY_RUNS must be a positive safe integer.");
  }

  return value;
}

async function rejectAfter(milliseconds: number, message: string): Promise<never> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
  throw new Error(message);
}

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
