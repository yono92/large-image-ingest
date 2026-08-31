const { chunksFor, sha256 } = require("../reference-target.cjs");

const descriptor = {
  id: "raw-tus",
  version: "tus-protocol-1.0-style",
  transportStyle: "tus-offset",
  dependencies: [{ id: "generic-tus-client", version: "representative-1.0" }],
  configurationDecisions: [
    "chunk-size", "retry-policy", "metadata-validation", "checksum-policy",
    "manifest-schema", "resume-store", "source-binding", "offset-reconciliation",
    "receipt-validation", "completion-reconciliation", "stored-verifier", "safe-errors"
  ],
  publicBoundaries: ["selection-handler", "tus-endpoint", "resume-store", "verification-endpoint"],
  responsibilities: {
    validation: "application", checksum: "application", manifest: "application", chunking: "application",
    retry: "application", sourceIdentity: "application", recoveryPersistence: "application",
    reconciliation: "application", progress: "application", completion: "application",
    storedVerification: "application", safeDiagnostics: "application", cleanup: "application",
    brokerIntegration: "application"
  }
};

function createController({ target }) {
  let record;
  let failDelete = false;
  let safeOutput = [];

  function validateSource(source) {
    if (!source || source.bytes.byteLength === 0) throw coded("validation.empty");
    if (source.type !== "image/tiff" || !source.name.toLowerCase().endsWith(".tif")) throw coded("validation.type");
  }

  function createManifest(source) {
    return {
      schemaVersion: "raw-reference-manifest.v1",
      original: { name: source.name, type: source.type, sizeBytes: source.bytes.byteLength },
      checksum: { algorithm: "sha256", value: sha256(source.bytes) },
      chunking: { sizeBytes: chunksFor(source)[0].bytes.byteLength, totalChunks: chunksFor(source).length }
    };
  }

  function save(next) {
    record = structuredClone(next);
  }

  function validateRecord(source) {
    if (!record) throw coded("resume.record_not_found");
    if (record.sourceChecksum !== sha256(source.bytes)) throw coded("resume.source_mismatch");
    if (new Set(record.receipts.map((receipt) => receipt.index)).size !== record.receipts.length) throw coded("receipt.duplicate");
    if (record.receipts.length !== record.acknowledgedCount) throw coded("receipt.missing");
  }

  async function reconcileRemote() {
    const remote = await target.inspect(record.sessionId);
    for (const receipt of record.receipts) {
      const observed = remote.receipts.find((candidate) => candidate.index === receipt.index);
      if (!observed || observed.digest !== receipt.digest || observed.sizeBytes !== receipt.sizeBytes) throw coded("transport.remote_behind");
    }
    return remote;
  }

  async function sendChunk(chunk) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await target.putChunk({ sessionId: record.sessionId, index: chunk.index, bytes: chunk.bytes });
      } catch (error) {
        const observed = target.getReceipt(chunk.index);
        if (observed && observed.digest === sha256(chunk.bytes) && observed.sizeBytes === chunk.bytes.byteLength) return observed;
        if (attempt === 1) throw error;
      }
    }
    throw coded("transport.retry_exhausted");
  }

  async function finish() {
    try {
      await target.complete({ sessionId: record.sessionId, receipts: record.receipts });
    } catch (error) {
      const remote = await target.inspect(record.sessionId).catch(() => undefined);
      if (!remote?.completed) throw error;
    }
    record.status = "completed";
    save(record);
    if (failDelete) {
      safeOutput.push({ code: "resume.store_failed", operation: "delete" });
      return { status: "completed_with_warning", manifest: record.manifest };
    }
    record = undefined;
    return { status: "completed", manifest: undefined };
  }

  async function transfer(source, isResume) {
    validateSource(source);
    if (isResume) {
      validateRecord(source);
      await reconcileRemote();
    } else {
      const manifest = createManifest(source);
      const created = await target.create({ totalBytes: source.bytes.byteLength, totalChunks: manifest.chunking.totalChunks });
      save({
        sessionId: created.sessionId, sourceChecksum: manifest.checksum.value,
        manifest, receipts: [], acknowledgedCount: 0, uploadedBytes: 0, status: "uploading"
      });
    }
    for (const chunk of chunksFor(source)) {
      let receipt = record.receipts.find((candidate) => candidate.index === chunk.index);
      if (!receipt) {
        const observed = target.getReceipt(chunk.index);
        if (observed && observed.digest === sha256(chunk.bytes) && observed.sizeBytes === chunk.bytes.byteLength) receipt = observed;
      }
      if (!receipt) receipt = await sendChunk(chunk);
      if (!record.receipts.some((candidate) => candidate.index === receipt.index)) {
        record.receipts.push(receipt);
        record.receipts.sort((left, right) => left.index - right.index);
        record.acknowledgedCount = record.receipts.length;
        record.uploadedBytes = record.receipts.reduce((total, item) => total + item.sizeBytes, 0);
        save(record);
      }
    }
    return finish();
  }

  async function guarded(action) {
    try { return await action(); }
    catch (error) {
      safeOutput.push({ code: typeof error?.code === "string" ? error.code : "transport.failed" });
      throw error;
    }
  }

  return {
    async start(source) { return guarded(() => transfer(source, false)); },
    async resume(source) { return guarded(() => transfer(source, true)); },
    async verify(source) { return target.verify(source); },
    async tamperRecord(kind) {
      if (!record || record.receipts.length === 0) return;
      if (kind === "missing") record.receipts = [];
      if (kind === "duplicate") record.receipts.push(structuredClone(record.receipts[0]));
    },
    async latestRecord() { return record ? structuredClone(record) : undefined; },
    setCleanupFailure(value) { failDelete = value; },
    safeOutput() { return structuredClone(safeOutput); },
    clearSafeOutput() { safeOutput = []; },
    chunks(source) { return chunksFor(source); }
  };
}

function coded(code) {
  const error = new Error("Upload coordination failed safely.");
  error.code = code;
  return error;
}

module.exports = { createController, descriptor };
