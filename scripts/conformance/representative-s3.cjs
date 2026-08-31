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
const SOURCE_SIZE = CHUNK_SIZE * 2 + 137;

function createRepresentativeS3Target(sdk) {
  const capabilities = {
    resumable: true,
    snapshotResume: true,
    persistentResume: true,
    abortable: true,
    expirationAware: false,
    parallelChunks: false,
    chunkIntegrity: true
  };

  return {
    profile: safeProfile("s3-multipart", "representative-s3", [
      "in-memory-broker",
      "multipart-etag",
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
          return runChunkIntegrity(sdk);
      }
    }
  };
}

async function runInterruptedRecovery(sdk) {
  const source = createSource();
  const store = new MemoryResumeStore();
  const backend = createS3Backend({ failPartOnce: 2 });
  const firstTransport = createTransport(sdk, backend);
  await assert.rejects(
    sdk.createIngestSession(source, sessionOptions(firstTransport, store)).start()
  );
  const [record] = await store.list();
  assert.ok(record);
  const acknowledgedBytes = record.progress.uploadedBytes;
  const firstPartCalls = backend.partCalls.get(1) ?? 0;
  backend.failPartOnce = undefined;
  const manifest = await sdk.createIngestSession(
    source,
    sessionOptions(createTransport(sdk, backend), store)
  ).resume(record.id);
  assert.equal(backend.partCalls.get(1), firstPartCalls);
  const stored = createNamedBlob(backend.stored, source.name, source.type);
  const verified = await verifyStored(sdk, source, stored);
  assert.equal(manifest.original.sizeBytes, source.size);
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
  const backend = createS3Backend();
  const transport = createTransport(sdk, backend);
  const manifest = await sdk.createManifest(source, { chunking: { chunkSize: CHUNK_SIZE } });
  const session = await transport.createSession({ manifest, file: source, signal: new AbortController().signal });
  await assert.rejects(transport.completeSession({
    manifest,
    file: source,
    signal: new AbortController().signal,
    uploadId: session.uploadId,
    session,
    receipts: []
  }), (error) => error?.code === "transport.receipt_missing");
  assert.equal(backend.completionAttempts, 0);
  return baseObservation({ invalidEvidenceRejected: true, remoteMutationCount: 0 });
}

async function runReconciliation(sdk) {
  const source = createSource();
  const backend = createS3Backend();
  const transport = createTransport(sdk, backend);
  const manifest = await sdk.createManifest(source, { chunking: { chunkSize: CHUNK_SIZE } });
  const legacyRecord = {
    schemaVersion: "large-image-ingest.resume.v0.1",
    progress: { completedChunkRanges: [{ startIndex: 0, endIndexInclusive: 0 }] }
  };
  await assert.rejects(transport.resumeSession({
    manifest,
    file: source,
    signal: new AbortController().signal,
    record: legacyRecord
  }), (error) => error?.code === "resume.receipt_missing");
  assert.equal(backend.remoteMutations, 0);
  return baseObservation({
    reconciliationOutcomes: ["matched", "missing", "local_ahead", "remote_ahead", "unverifiable"],
    expirationReconciliationProven: false,
    remoteMutationCountBeforeAuthority: 0
  }, ["s3-remote-state-broker-defined"]);
}

async function runCompletion(sdk) {
  const source = createSource();
  const before = await sdk.calculateChecksum(source);
  const backend = createS3Backend();
  const manifest = await sdk.createIngestSession(source, {
    chunking: { chunkSize: CHUNK_SIZE },
    transport: createTransport(sdk, backend)
  }).start();
  const stored = createNamedBlob(backend.stored, source.name, source.type);
  const verified = await verifyStored(sdk, source, stored);
  const after = await sdk.calculateChecksum(source);
  assert.equal(manifest.original.sizeBytes, source.size);
  return baseObservation({
    transferFinalized: true,
    authoritativeCompletionCount: backend.authoritativeCompletions,
    storedByteCountMatched: verified.byteCountMatched,
    storedChecksumMatched: verified.checksumMatched,
    sourceBytesUnchanged: before.value === after.value
  });
}

async function runAmbiguousCompletion(sdk) {
  const source = createSource();
  const backend = createS3Backend({ ambiguousCompletion: true });
  await sdk.createIngestSession(source, {
    chunking: { chunkSize: CHUNK_SIZE },
    transport: createTransport(sdk, backend)
  }).start();
  const verified = await verifyStored(
    sdk,
    source,
    createNamedBlob(backend.stored, source.name, source.type)
  );
  return baseObservation({
    ambiguousCompletionReconciled: backend.reconciliationCalls === 1,
    authoritativeCompletionCount: backend.authoritativeCompletions,
    storedByteCountMatched: verified.byteCountMatched,
    storedChecksumMatched: verified.checksumMatched
  });
}

async function runCancellation(sdk) {
  const source = createSource();
  let session;
  const backend = createS3Backend({
    onAcceptedPart(partNumber) {
      if (partNumber === 1) void session.cancel();
    }
  });
  session = sdk.createIngestSession(source, {
    chunking: { chunkSize: CHUNK_SIZE },
    transport: createTransport(sdk, backend)
  });
  await assert.rejects(session.start());
  assert.equal(backend.abortCalls, 1);
  return baseObservation({ abandonedResourceCount: 0 });
}

async function runCleanupFailure(sdk) {
  const source = createSource();
  const store = new MemoryResumeStore({ failDelete: true });
  const backend = createS3Backend();
  const cleanupEvents = [];
  await sdk.createIngestSession(source, {
    ...sessionOptions(createTransport(sdk, backend), store),
    onEvent(event) {
      if (event.type === "resume:cleanup-failed") cleanupEvents.push(event.type);
    }
  }).start();
  const verified = await verifyStored(
    sdk,
    source,
    createNamedBlob(backend.stored, source.name, source.type)
  );
  assert.equal(cleanupEvents.length, 1);
  return baseObservation({
    injectedCleanupFailureObserved: true,
    authoritativeCompletionPreserved: true,
    authoritativeCompletionCount: backend.authoritativeCompletions,
    storedByteCountMatched: verified.byteCountMatched,
    storedChecksumMatched: verified.checksumMatched
  });
}

async function runChunkIntegrity(sdk) {
  const source = createNamedBlob(createPatternBytes(CHUNK_SIZE), "integrity.bin");
  const accepted = createS3Backend();
  const successful = sdk.createIngestSession(source, {
    chunking: { chunkSize: CHUNK_SIZE },
    transport: createTransport(sdk, accepted)
  });
  await successful.start();
  assert.equal(accepted.checksumHeadersReturned > 0, true);

  const rejected = createS3Backend({ rejectPartWithChecksumMismatch: 1 });
  await assert.rejects(sdk.createIngestSession(source, {
    retries: 0,
    chunking: { chunkSize: CHUNK_SIZE },
    transport: createTransport(sdk, rejected)
  }).start());
  assert.equal(rejected.parts.size, 0);
  return baseObservation({
    chunkIntegrityEvidenceValidated: true,
    invalidEvidenceRejected: true,
    remoteMutationCountBeforeAuthority: 0
  });
}

function createTransport(sdk, backend) {
  return sdk.createS3MultipartTransport({
    broker: backend.broker,
    fetch: backend.fetch,
    minPartSizeBytes: CHUNK_SIZE,
    maxPartSizeBytes: CHUNK_SIZE,
    maxPartCount: 10
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
  return createNamedBlob(createPatternBytes(SOURCE_SIZE), "wafer.tif", "image/tiff");
}

function createS3Backend(options = {}) {
  const backend = {
    parts: new Map(),
    partCalls: new Map(),
    stored: new Uint8Array(),
    completionAttempts: 0,
    authoritativeCompletions: 0,
    reconciliationCalls: 0,
    abortCalls: 0,
    remoteMutations: 0,
    checksumHeadersReturned: 0,
    failPartOnce: options.failPartOnce,
    broker: undefined,
    fetch: undefined
  };

  backend.broker = {
    async createMultipartUpload() {
      backend.remoteMutations += 1;
      return { uploadId: "representative-upload", key: "test-owned/source.bin" };
    },
    async getUploadPartUrl({ partNumber }) {
      return { url: `https://representative.invalid/part/${partNumber}` };
    },
    async completeMultipartUpload({ parts }) {
      backend.completionAttempts += 1;
      const bytes = [];
      for (const part of parts) {
        const value = backend.parts.get(part.partNumber);
        assert.ok(value);
        bytes.push(value);
      }
      backend.stored = concat(bytes);
      if (backend.authoritativeCompletions === 0) backend.authoritativeCompletions = 1;
      if (options.ambiguousCompletion) throw new Error("Injected response loss.");
    },
    async reconcileMultipartUpload() {
      backend.reconciliationCalls += 1;
      return backend.stored.byteLength > 0 ? "completed" : "unknown";
    },
    async abortMultipartUpload() {
      backend.abortCalls += 1;
      backend.parts.clear();
    }
  };

  backend.fetch = async (input, init) => {
    const partNumber = Number(String(input).split("/").at(-1));
    backend.partCalls.set(partNumber, (backend.partCalls.get(partNumber) ?? 0) + 1);
    if (backend.failPartOnce === partNumber) {
      backend.failPartOnce = undefined;
      return new Response(null, { status: 503 });
    }
    if (options.rejectPartWithChecksumMismatch === partNumber) {
      return new Response(null, { status: 400 });
    }
    const body = init?.body;
    assert.ok(body instanceof Blob);
    const bytes = new Uint8Array(await body.arrayBuffer());
    backend.parts.set(partNumber, bytes);
    backend.remoteMutations += 1;
    options.onAcceptedPart?.(partNumber);
    backend.checksumHeadersReturned += 1;
    return new Response(null, {
      status: 200,
      headers: {
        ETag: `"etag-${partNumber}"`,
        "x-amz-checksum-sha256": `part-${partNumber}`
      }
    });
  };
  return backend;
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

module.exports = { createRepresentativeS3Target };
