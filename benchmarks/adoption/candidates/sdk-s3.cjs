const { chunksFor } = require("../reference-target.cjs");

const descriptor = {
  id: "sdk-s3",
  version: "1.0.0",
  transportStyle: "s3-multipart",
  dependencies: [{ id: "large-image-ingest", version: "1.6.0" }],
  configurationDecisions: [
    "chunk-size", "retry-policy", "resume-store", "broker-boundary", "stored-verifier"
  ],
  publicBoundaries: ["sdk-session", "multipart-broker", "resume-store", "stored-verifier"],
  responsibilities: {
    validation: "dependency", checksum: "dependency", manifest: "dependency", chunking: "dependency",
    retry: "dependency", sourceIdentity: "dependency", recoveryPersistence: "dependency",
    reconciliation: "dependency", progress: "dependency", completion: "dependency",
    storedVerification: "application", safeDiagnostics: "dependency", cleanup: "dependency",
    brokerIntegration: "application"
  }
};

function createController({ sdk, target }) {
  const records = new Map();
  let failDelete = false;
  let safeOutput = [];
  const store = {
    async get(id) { return records.get(id); },
    async put(record) { records.set(record.id, structuredClone(record)); },
    async list() { return [...records.values()].map((record) => structuredClone(record)); },
    async delete(id) {
      if (failDelete) throw new Error("customer-secret cleanup path");
      records.delete(id);
    }
  };

  function toFile(source) {
    const blob = new Blob([source.bytes], { type: source.type });
    Object.defineProperties(blob, {
      name: { value: source.name },
      lastModified: { value: source.lastModified }
    });
    return blob;
  }

  function createTransport() {
    return {
      capabilities: {
        name: "adoption-reference-s3", resumable: true, abortable: true, expires: true,
        supportsParallelChunks: false, supportsChunkChecksum: true,
        supportsSnapshotResume: true, supportsPersistentResume: true
      },
      async createSession({ manifest }) {
        const created = await target.create({
          totalBytes: manifest.original.sizeBytes,
          totalChunks: manifest.chunking.totalChunks
        });
        return {
          uploadId: created.sessionId,
          transportName: "adoption-reference-s3",
          createdAt: "2026-08-31T00:00:00.000Z"
        };
      },
      async resumeSession({ record }) {
        const remote = await target.inspect(record.transport.uploadId);
        const local = new Map((record.receipts ?? []).map((receipt) => [receipt.chunkIndex, receipt]));
        for (const [index, receipt] of local) {
          const observed = remote.receipts.find((candidate) => candidate.index === index);
          if (!observed || observed.sizeBytes !== receipt.sizeBytes) throw safeError("transport.remote_behind");
        }
        return {
          uploadId: record.transport.uploadId,
          transportName: "adoption-reference-s3",
          createdAt: record.createdAt
        };
      },
      async uploadChunk({ uploadId, chunk, body }) {
        const existing = target.getReceipt(chunk.index);
        if (existing) return toSdkReceipt(existing);
        try {
          return toSdkReceipt(await target.putChunk({
            sessionId: uploadId,
            index: chunk.index,
            bytes: new Uint8Array(await body.arrayBuffer())
          }));
        } catch (error) {
          const reconciled = target.getReceipt(chunk.index);
          if (reconciled) return toSdkReceipt(reconciled);
          throw error;
        }
      },
      async completeSession({ uploadId, receipts }) {
        try {
          await target.complete({
            sessionId: uploadId,
            receipts: receipts.map((receipt) => ({
              index: receipt.chunkIndex,
              sizeBytes: receipt.sizeBytes,
              digest: receipt.checksum?.value
            }))
          });
        } catch (error) {
          const state = await target.inspect(uploadId).catch(() => undefined);
          if (state?.completed) return;
          throw error;
        }
      }
    };
  }

  async function run(source, resumeId) {
    const file = toFile(source);
    const options = {
      chunking: { chunkSize: 256 * 1024 },
      retryPolicy: { maxAttempts: 2, delayMs: 0 },
      resume: { store, cleanup: "delete-on-complete" },
      transport: createTransport(),
      onEvent(event) {
        if (event.type === "resume:cleanup-failed") safeOutput.push({ code: event.code });
      }
    };
    try {
      return resumeId
        ? await sdk.createIngestSession(file, options).resume(resumeId)
        : await sdk.createIngestSession(file, options).start();
    } catch (error) {
      safeOutput.push({ code: typeof error?.code === "string" ? error.code : "transport.failed" });
      throw error;
    }
  }

  return {
    async start(source) { return run(source); },
    async resume(source) {
      const [record] = await store.list();
      if (!record) throw safeError("resume.record_not_found");
      return run(source, record.id);
    },
    async verify(source) {
      const stored = target.stored
        ? toFile({ ...source, bytes: target.stored })
        : undefined;
      if (!stored) return false;
      const manifest = await sdk.createManifest(toFile(source), { chunking: { chunkSize: 256 * 1024 } });
      return (await sdk.verifyIngestIntegrity({ manifest, file: stored })).ok;
    },
    async tamperRecord(kind) {
      const [record] = await store.list();
      if (!record || !Array.isArray(record.receipts) || record.receipts.length === 0) return;
      if (kind === "missing") record.receipts = [];
      if (kind === "duplicate") record.receipts.push(structuredClone(record.receipts[0]));
      await store.put(record);
    },
    async latestRecord() { return (await store.list())[0]; },
    setCleanupFailure(value) { failDelete = value; },
    safeOutput() { return structuredClone(safeOutput); },
    clearSafeOutput() { safeOutput = []; },
    chunks(source) { return chunksFor(source); }
  };
}

function toSdkReceipt(receipt) {
  return {
    chunkIndex: receipt.index,
    sizeBytes: receipt.sizeBytes,
    completedAt: "2026-08-31T00:00:00.000Z",
    checksum: { algorithm: "sha256", value: receipt.digest },
    transport: { name: "adoption-reference-s3", partNumber: receipt.index + 1 }
  };
}

function safeError(code) {
  const error = new Error("Upload recovery failed safely.");
  error.code = code;
  return error;
}

module.exports = { createController, descriptor };
