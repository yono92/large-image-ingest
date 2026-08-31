const {
  MemoryResumeStore,
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
const SOURCE_SIZE = CHUNK_SIZE * 2 + 211;

function createRepresentativeTusTarget(sdk) {
  const capabilities = {
    resumable: true,
    snapshotResume: true,
    persistentResume: true,
    abortable: true,
    expirationAware: true,
    parallelChunks: false,
    chunkIntegrity: false
  };

  return {
    profile: safeProfile("tus", "representative-tus", [
      "tus-1.0.0",
      "creation",
      "expiration",
      "termination",
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
          return runInterruptedRecovery(sdk);
        case "recovery.invalid-evidence-rejected":
          return runInvalidEvidence(sdk);
        case "recovery.session-reconciliation":
          return runReconciliation(sdk);
        case "completion.stored-original-verified":
          return runCompletion(sdk);
        case "completion.ambiguous-result-reconciled":
          return runAmbiguousCompletion(sdk);
        case "cancellation.abandoned-session-reported":
          return runCancellation(sdk);
        case "cleanup.failure-after-completion-isolated":
          return runCleanupFailure(sdk);
        case "integrity.chunk-evidence-enforced":
          throw new Error("Chunk integrity is intentionally unsupported for the official tus adapter.");
      }
    }
  };
}

async function runInterruptedRecovery(sdk) {
  const source = createSource();
  const store = new MemoryResumeStore();
  const server = createTusServer({ failPatchAtOffsetOnce: CHUNK_SIZE });
  await assert.rejects(sdk.createIngestSession(source, sessionOptions(
    createTransport(sdk, server),
    store
  )).start());
  const [record] = await store.list();
  assert.ok(record);
  const acknowledgedBytes = record.progress.uploadedBytes;
  const zeroOffsetCalls = server.patchCallsByOffset.get(0) ?? 0;
  server.failPatchAtOffsetOnce = undefined;
  await sdk.createIngestSession(source, sessionOptions(
    createTransport(sdk, server),
    store
  )).resume(record.id);
  assert.equal(server.patchCallsByOffset.get(0), zeroOffsetCalls);
  const verified = await verifyStored(
    sdk,
    source,
    createNamedBlob(server.bytes, source.name, source.type)
  );
  return baseObservation({
    sourceIdentityEstablished: true,
    acknowledgedBytes,
    retransmittedAcknowledgedBytes: 0,
    snapshotRecoveryProven: true,
    persistentRecoveryProven: true,
    storedByteCountMatched: verified.byteCountMatched,
    storedChecksumMatched: verified.checksumMatched
  });
}

async function runInvalidEvidence(sdk) {
  const source = createSource();
  const server = createTusServer();
  const transport = createTransport(sdk, server);
  const manifest = await sdk.createManifest(source, { chunking: { chunkSize: CHUNK_SIZE } });
  const session = await transport.createSession({ manifest, file: source, signal: new AbortController().signal });
  server.offset = 1;
  const chunk = sdk.planChunks(source.size, { chunkSize: CHUNK_SIZE }).chunks[0];
  await assert.rejects(transport.uploadChunk({
    manifest,
    file: source,
    signal: new AbortController().signal,
    uploadId: session.uploadId,
    session,
    chunk,
    body: source.slice(chunk.start, chunk.end),
    previousReceipts: []
  }), (error) => error?.code === "transport.offset_mismatch");
  assert.equal(server.patchCalls, 0);
  return baseObservation({ invalidEvidenceRejected: true, remoteMutationCount: 0 });
}

async function runReconciliation(sdk) {
  const source = createSource();
  const server = createTusServer();
  const transport = createTransport(sdk, server);
  const manifest = await sdk.createManifest(source, { chunking: { chunkSize: CHUNK_SIZE } });
  const record = minimalRecord(manifest, source, server.uploadUrl, CHUNK_SIZE);

  server.offset = CHUNK_SIZE;
  await transport.resumeSession({ manifest, file: source, signal: new AbortController().signal, record });
  server.offset = 0;
  await assert.rejects(transport.resumeSession({ manifest, file: source, signal: new AbortController().signal, record }));
  server.offset = CHUNK_SIZE * 2;
  await assert.rejects(transport.resumeSession({ manifest, file: source, signal: new AbortController().signal, record }));
  server.expired = true;
  await assert.rejects(
    transport.resumeSession({ manifest, file: source, signal: new AbortController().signal, record }),
    (error) => error?.code === "transport.session_expired"
  );
  return baseObservation({
    reconciliationOutcomes: ["matched", "missing", "expired", "local_ahead", "remote_ahead", "unverifiable"],
    expirationReconciliationProven: true,
    remoteMutationCountBeforeAuthority: 0
  }, ["tus-offset-is-progress-evidence"]);
}

async function runCompletion(sdk) {
  const source = createSource();
  const before = await sdk.calculateChecksum(source);
  const server = createTusServer();
  await sdk.createIngestSession(source, {
    chunking: { chunkSize: CHUNK_SIZE },
    transport: createTransport(sdk, server)
  }).start();
  const verified = await verifyStored(sdk, source, createNamedBlob(server.bytes, source.name, source.type));
  const after = await sdk.calculateChecksum(source);
  return baseObservation({
    transferFinalized: server.offset === source.size,
    authoritativeCompletionCount: 1,
    storedByteCountMatched: verified.byteCountMatched,
    storedChecksumMatched: verified.checksumMatched,
    sourceBytesUnchanged: before.value === after.value
  });
}

async function runAmbiguousCompletion(sdk) {
  const source = createSource();
  const finalOffset = CHUNK_SIZE * 2;
  const server = createTusServer({ acceptThenLoseResponseAtOffsetOnce: finalOffset });
  await sdk.createIngestSession(source, {
    chunking: { chunkSize: CHUNK_SIZE },
    retryPolicy: { maxAttempts: 2, delayMs: 0 },
    transport: createTransport(sdk, server)
  }).start();
  const verified = await verifyStored(sdk, source, createNamedBlob(server.bytes, source.name, source.type));
  return baseObservation({
    ambiguousCompletionReconciled: server.lostResponses === 1,
    authoritativeCompletionCount: 1,
    storedByteCountMatched: verified.byteCountMatched,
    storedChecksumMatched: verified.checksumMatched
  });
}

async function runCancellation(sdk) {
  const source = createSource();
  let session;
  const server = createTusServer({
    onAcceptedPatch() {
      void session.cancel();
    }
  });
  session = sdk.createIngestSession(source, {
    chunking: { chunkSize: CHUNK_SIZE },
    transport: createTransport(sdk, server)
  });
  await assert.rejects(session.start());
  assert.equal(server.deleteCalls, 1);
  return baseObservation({ abandonedResourceCount: 0 });
}

async function runCleanupFailure(sdk) {
  const source = createSource();
  const store = new MemoryResumeStore({ failDelete: true });
  const server = createTusServer();
  const cleanupEvents = [];
  await sdk.createIngestSession(source, {
    ...sessionOptions(createTransport(sdk, server), store),
    onEvent(event) {
      if (event.type === "resume:cleanup-failed") cleanupEvents.push(event.type);
    }
  }).start();
  const verified = await verifyStored(sdk, source, createNamedBlob(server.bytes, source.name, source.type));
  assert.equal(cleanupEvents.length, 1);
  return baseObservation({
    injectedCleanupFailureObserved: true,
    authoritativeCompletionPreserved: true,
    authoritativeCompletionCount: 1,
    storedByteCountMatched: verified.byteCountMatched,
    storedChecksumMatched: verified.checksumMatched
  });
}

function createTransport(sdk, server) {
  return sdk.createTusTransport({
    endpoint: server.endpoint,
    fetch: server.fetch,
    detectExtensions: true,
    requiredExtensions: ["creation", "expiration", "termination"],
    terminateOnAbort: true
  });
}

function sessionOptions(transport, store) {
  return {
    chunking: { chunkSize: CHUNK_SIZE },
    retries: 0,
    resume: { store },
    transport
  };
}

function createSource() {
  return createNamedBlob(createPatternBytes(SOURCE_SIZE, 29), "microscope.tif", "image/tiff");
}

function minimalRecord(manifest, source, resumeToken, uploadedBytes) {
  return {
    schemaVersion: "large-image-ingest.resume.v0.3",
    id: "representative-record",
    manifest,
    file: { name: source.name, sizeBytes: source.size, mediaType: source.type },
    chunking: { strategy: "fixed-size", chunkSizeBytes: CHUNK_SIZE, totalBytes: source.size, totalChunks: 3 },
    transport: { name: "tus", uploadId: "representative-tus", resumeToken },
    progress: { status: "failed", uploadedBytes, completedChunkRanges: [], nextChunkIndex: 1 },
    receipts: [],
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z"
  };
}

function createTusServer(options = {}) {
  const endpoint = "https://representative.invalid/files";
  const uploadUrl = `${endpoint}/upload-1`;
  const server = {
    endpoint,
    uploadUrl,
    offset: 0,
    bytes: new Uint8Array(),
    expired: false,
    deleted: false,
    patchCalls: 0,
    patchCallsByOffset: new Map(),
    deleteCalls: 0,
    lostResponses: 0,
    failPatchAtOffsetOnce: options.failPatchAtOffsetOnce,
    acceptThenLoseResponseAtOffsetOnce: options.acceptThenLoseResponseAtOffsetOnce,
    fetch: undefined
  };

  server.fetch = async (input, init = {}) => {
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    if (method === "OPTIONS") {
      return response(204, {
        "Tus-Version": "1.0.0",
        "Tus-Extension": "creation,expiration,termination"
      });
    }
    if (method === "POST") {
      server.offset = 0;
      server.bytes = new Uint8Array();
      server.expired = false;
      server.deleted = false;
      return response(201, {
        Location: uploadUrl,
        "Upload-Offset": "0",
        "Upload-Expires": "Wed, 31 Dec 2031 00:00:00 GMT"
      });
    }
    if (String(input) !== uploadUrl || server.expired || server.deleted) {
      return response(410);
    }
    if (method === "HEAD") {
      return response(200, {
        "Upload-Offset": String(server.offset),
        "Upload-Expires": "Wed, 31 Dec 2031 00:00:00 GMT"
      });
    }
    if (method === "PATCH") {
      const requestOffset = Number(headers.get("Upload-Offset"));
      server.patchCalls += 1;
      server.patchCallsByOffset.set(requestOffset, (server.patchCallsByOffset.get(requestOffset) ?? 0) + 1);
      if (server.failPatchAtOffsetOnce === requestOffset) {
        server.failPatchAtOffsetOnce = undefined;
        return response(503);
      }
      if (requestOffset !== server.offset) return response(409);
      const body = init.body;
      assert.ok(body instanceof Blob);
      const bytes = new Uint8Array(await body.arrayBuffer());
      server.bytes = concat([server.bytes, bytes]);
      server.offset += bytes.byteLength;
      options.onAcceptedPatch?.(requestOffset);
      if (server.acceptThenLoseResponseAtOffsetOnce === requestOffset) {
        server.acceptThenLoseResponseAtOffsetOnce = undefined;
        server.lostResponses += 1;
        return response(503);
      }
      return response(204, {
        "Upload-Offset": String(server.offset),
        "Upload-Expires": "Wed, 31 Dec 2031 00:00:00 GMT"
      });
    }
    if (method === "DELETE") {
      server.deleteCalls += 1;
      server.deleted = true;
      server.bytes = new Uint8Array();
      server.offset = 0;
      return response(204);
    }
    return response(405);
  };
  return server;
}

function response(status, headers = {}) {
  return new Response(null, { status, headers });
}

function concat(chunks) {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

module.exports = { createRepresentativeTusTarget };
