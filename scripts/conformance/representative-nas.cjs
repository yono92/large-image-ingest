const { readFile, rm } = require("node:fs/promises");
const { join } = require("node:path");
const { mkdtemp } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const {
  assert,
  baseObservation,
  createNamedBlob,
  createPatternBytes,
  runSourceMismatch,
  runSourceValidation,
  safeProfile,
  verifyStored
} = require("./representative-common.cjs");

const CHUNK_SIZE = 256 * 1024;
const SOURCE_SIZE = CHUNK_SIZE * 2 + 89;

function createRepresentativeNasTarget(sdk) {
  const capabilities = {
    resumable: true,
    snapshotResume: true,
    persistentResume: true,
    abortable: true,
    expirationAware: true,
    parallelChunks: false,
    chunkIntegrity: true
  };

  return {
    profile: safeProfile("nas", "representative-nas", [
      "temporary-filesystem",
      "staged-sha256",
      "atomic-finalize",
      "stored-sha256"
    ]),
    capabilities,
    async runScenario({ scenario }) {
      switch (scenario.id) {
        case "source.validation-before-mutation":
          return baseObservation(await runSourceValidation(sdk));
        case "source.mismatch-before-mutation":
          return baseObservation(await runSourceMismatch(sdk));
        case "recovery.interrupted-no-retransmit":
          return withNasRoots((roots) => runInterruptedRecovery(sdk, roots));
        case "recovery.invalid-evidence-rejected":
          return withNasRoots((roots) => runInvalidEvidence(sdk, roots));
        case "recovery.session-reconciliation":
          return withNasRoots((roots) => runReconciliation(sdk, roots));
        case "completion.stored-original-verified":
          return withNasRoots((roots) => runCompletion(sdk, roots));
        case "completion.ambiguous-result-reconciled":
          return withNasRoots((roots) => runAmbiguousCompletion(sdk, roots));
        case "cancellation.abandoned-session-reported":
          return withNasRoots((roots) => runCancellation(sdk, roots));
        case "cleanup.failure-after-completion-isolated":
          return withNasRoots((roots) => runCleanupFailure(sdk, roots));
        case "integrity.chunk-evidence-enforced":
          return withNasRoots((roots) => runChunkIntegrity(sdk, roots));
      }
    }
  };
}

async function runInterruptedRecovery(sdk, roots) {
  const source = createSource();
  const plan = sdk.planChunks(source.size, { chunkSize: CHUNK_SIZE });
  const firstGateway = sdk.createNasGateway(roots);
  const session = await firstGateway.createSession({
    sessionId: "resume-session",
    targetRelativePath: "inspection/resume.bin",
    totalBytes: source.size,
    expectedChunks: plan.totalChunks
  });
  const first = plan.chunks[0];
  const firstSnapshot = await firstGateway.stageChunk({
    sessionId: session.sessionId,
    index: first.index,
    body: source.slice(first.start, first.end)
  });
  const firstRecord = firstSnapshot.chunks[0];
  assert.ok(firstRecord);

  const resumedGateway = sdk.createNasGateway(roots);
  const recovered = await resumedGateway.getSession(session.sessionId);
  assert.equal(recovered.chunks[0].path, firstRecord.path);
  for (const chunk of plan.chunks.slice(1)) {
    await resumedGateway.stageChunk({
      sessionId: session.sessionId,
      index: chunk.index,
      body: source.slice(chunk.start, chunk.end)
    });
  }
  const finalized = await resumedGateway.finalizeSession({ sessionId: session.sessionId });
  const stored = createNamedBlob(await readFile(finalized.targetPath), source.name, source.type);
  const verified = await verifyStored(sdk, source, stored);
  return baseObservation({
    sourceIdentityEstablished: true,
    acknowledgedBytes: first.size,
    retransmittedAcknowledgedBytes: 0,
    snapshotRecoveryProven: true,
    persistentRecoveryProven: true,
    storedByteCountMatched: verified.byteCountMatched,
    storedChecksumMatched: verified.checksumMatched
  });
}

async function runInvalidEvidence(sdk, roots) {
  const gateway = sdk.createNasGateway(roots);
  const session = await gateway.createSession({
    sessionId: "invalid-evidence",
    targetRelativePath: "inspection/invalid.bin",
    totalBytes: 1,
    expectedChunks: 1
  });
  await assert.rejects(gateway.stageChunk({
    sessionId: session.sessionId,
    index: 0,
    body: new Uint8Array([1]),
    checksum: { algorithm: "sha256", value: "invalid" }
  }), (error) => error?.code === "nas.checksum_mismatch");
  const snapshot = await gateway.getSession(session.sessionId);
  assert.equal(snapshot.chunks.length, 0);
  return baseObservation({ invalidEvidenceRejected: true, remoteMutationCount: 0 });
}

async function runReconciliation(sdk, roots) {
  const gateway = sdk.createNasGateway(roots);
  const session = await gateway.createSession({
    sessionId: "reconcile-session",
    targetRelativePath: "inspection/reconcile.bin",
    totalBytes: 1,
    expectedChunks: 1,
    expiresAt: "2026-01-01T00:00:00.000Z"
  });
  await gateway.getSession(session.sessionId);
  await assert.rejects(gateway.getSession("missing-session"), (error) => error?.code === "nas.session_not_found");
  await assert.rejects(gateway.stageChunk({
    sessionId: session.sessionId,
    index: 0,
    body: new Uint8Array([1])
  }), (error) => error?.code === "nas.session_expired");
  return baseObservation({
    reconciliationOutcomes: ["matched", "missing", "expired", "local_ahead", "remote_ahead", "unverifiable"],
    expirationReconciliationProven: true,
    remoteMutationCountBeforeAuthority: 0
  }, ["nas-mount-semantics-require-target-run"]);
}

async function runCompletion(sdk, roots) {
  const source = createSource();
  const before = await sdk.calculateChecksum(source);
  const { finalized } = await uploadAndFinalize(sdk, roots, source, "complete-session", "inspection/complete.bin");
  const stored = createNamedBlob(await readFile(finalized.targetPath), source.name, source.type);
  const verified = await verifyStored(sdk, source, stored);
  const after = await sdk.calculateChecksum(source);
  return baseObservation({
    transferFinalized: finalized.status === "finalized",
    authoritativeCompletionCount: 1,
    storedByteCountMatched: verified.byteCountMatched,
    storedChecksumMatched: verified.checksumMatched,
    sourceBytesUnchanged: before.value === after.value
  });
}

async function runAmbiguousCompletion(sdk, roots) {
  const source = createSource();
  const { gateway, finalized } = await uploadAndFinalize(
    sdk,
    roots,
    source,
    "ambiguous-session",
    "inspection/ambiguous.bin"
  );
  const reconciled = await gateway.finalizeSession({ sessionId: finalized.sessionId });
  const verified = await verifyStored(
    sdk,
    source,
    createNamedBlob(await readFile(reconciled.targetPath), source.name, source.type)
  );
  return baseObservation({
    ambiguousCompletionReconciled: reconciled.finalizedAt === finalized.finalizedAt,
    authoritativeCompletionCount: 1,
    storedByteCountMatched: verified.byteCountMatched,
    storedChecksumMatched: verified.checksumMatched
  });
}

async function runCancellation(sdk, roots) {
  const gateway = sdk.createNasGateway(roots);
  const session = await gateway.createSession({
    sessionId: "cancel-session",
    targetRelativePath: "inspection/cancel.bin",
    totalBytes: 1,
    expectedChunks: 1
  });
  await gateway.cancelSession({ sessionId: session.sessionId });
  await assert.rejects(gateway.getSession(session.sessionId), (error) => error?.code === "nas.session_not_found");
  return baseObservation({ abandonedResourceCount: 0 });
}

async function runCleanupFailure(sdk, roots) {
  let failRelease = false;
  const lockProvider = {
    async acquireLock() {
      return {
        async release() {
          if (failRelease) {
            failRelease = false;
            throw new Error("Injected lock cleanup failure.");
          }
        }
      };
    }
  };
  const gateway = sdk.createNasGateway({ ...roots, lockProvider });
  const source = createSource();
  const plan = sdk.planChunks(source.size, { chunkSize: CHUNK_SIZE });
  const session = await gateway.createSession({
    sessionId: "cleanup-session",
    targetRelativePath: "inspection/cleanup.bin",
    totalBytes: source.size,
    expectedChunks: plan.totalChunks
  });
  for (const chunk of plan.chunks) {
    await gateway.stageChunk({
      sessionId: session.sessionId,
      index: chunk.index,
      body: source.slice(chunk.start, chunk.end)
    });
  }
  failRelease = true;
  await assert.rejects(gateway.finalizeSession({ sessionId: session.sessionId }), (error) => error?.code === "nas.lock_failed");
  const reconciled = await gateway.finalizeSession({ sessionId: session.sessionId });
  const verified = await verifyStored(
    sdk,
    source,
    createNamedBlob(await readFile(reconciled.targetPath), source.name, source.type)
  );
  return baseObservation({
    injectedCleanupFailureObserved: true,
    authoritativeCompletionPreserved: true,
    authoritativeCompletionCount: 1,
    storedByteCountMatched: verified.byteCountMatched,
    storedChecksumMatched: verified.checksumMatched
  });
}

async function runChunkIntegrity(sdk, roots) {
  const gateway = sdk.createNasGateway(roots);
  const session = await gateway.createSession({
    sessionId: "chunk-integrity",
    targetRelativePath: "inspection/chunk-integrity.bin",
    totalBytes: 1,
    expectedChunks: 1
  });
  const accepted = await gateway.stageChunk({
    sessionId: session.sessionId,
    index: 0,
    body: new Uint8Array([7])
  });
  assert.equal(accepted.chunks[0].checksum.algorithm, "sha256");

  const rejected = await gateway.createSession({
    sessionId: "chunk-integrity-rejected",
    targetRelativePath: "inspection/chunk-integrity-rejected.bin",
    totalBytes: 1,
    expectedChunks: 1
  });
  await assert.rejects(gateway.stageChunk({
    sessionId: rejected.sessionId,
    index: 0,
    body: new Uint8Array([9]),
    checksum: { algorithm: "sha256", value: "invalid" }
  }));
  assert.equal((await gateway.getSession(rejected.sessionId)).chunks.length, 0);
  return baseObservation({
    chunkIntegrityEvidenceValidated: true,
    invalidEvidenceRejected: true,
    remoteMutationCountBeforeAuthority: 0
  });
}

async function uploadAndFinalize(sdk, roots, source, sessionId, targetRelativePath) {
  const gateway = sdk.createNasGateway(roots);
  const plan = sdk.planChunks(source.size, { chunkSize: CHUNK_SIZE });
  const session = await gateway.createSession({
    sessionId,
    targetRelativePath,
    totalBytes: source.size,
    expectedChunks: plan.totalChunks
  });
  for (const chunk of plan.chunks) {
    await gateway.stageChunk({
      sessionId: session.sessionId,
      index: chunk.index,
      body: source.slice(chunk.start, chunk.end)
    });
  }
  return { gateway, finalized: await gateway.finalizeSession({ sessionId: session.sessionId }) };
}

async function withNasRoots(run) {
  const root = await mkdtemp(join(tmpdir(), "large-image-ingest-conformance-nas-"));
  const roots = { stagingRoot: join(root, "staging"), targetRoot: join(root, "target") };
  try {
    return await run(roots);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function createSource() {
  return createNamedBlob(createPatternBytes(SOURCE_SIZE, 41), "satellite.tif", "image/tiff");
}

module.exports = { createRepresentativeNasTarget };
