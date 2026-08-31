const { chunksFor, sha256 } = require("../reference-target.cjs");

const descriptor = {
  id: "raw-s3",
  version: "presigned-multipart-style-1.0",
  transportStyle: "s3-multipart",
  dependencies: [{ id: "generic-http-client", version: "native-fetch" }],
  configurationDecisions: [
    "part-size", "retry-policy", "metadata-validation", "checksum-policy",
    "manifest-schema", "upload-id-store", "source-binding", "part-reconciliation",
    "etag-receipts", "completion-reconciliation", "stored-verifier", "safe-errors"
  ],
  publicBoundaries: ["selection-handler", "multipart-broker", "resume-store", "verification-endpoint"],
  responsibilities: {
    validation: "application", checksum: "application", manifest: "application", chunking: "application",
    retry: "application", sourceIdentity: "application", recoveryPersistence: "application",
    reconciliation: "application", progress: "application", completion: "application",
    storedVerification: "application", safeDiagnostics: "application", cleanup: "application",
    brokerIntegration: "application"
  }
};

function createController({ target }) {
  let uploadRecord;
  let failDelete = false;
  let safeOutput = [];

  function validateSource(source) {
    if (!source || source.bytes.byteLength === 0) throw coded("validation.empty");
    if (source.type !== "image/tiff" || !source.name.toLowerCase().endsWith(".tif")) throw coded("validation.type");
  }

  function buildManifest(source) {
    const parts = chunksFor(source);
    return {
      schemaVersion: "raw-reference-manifest.v1",
      original: { name: source.name, type: source.type, sizeBytes: source.bytes.byteLength },
      checksum: { algorithm: "sha256", value: sha256(source.bytes) },
      chunking: { sizeBytes: parts[0].bytes.byteLength, totalChunks: parts.length }
    };
  }

  function persist(next) {
    uploadRecord = structuredClone(next);
  }

  function validateResumeRecord(source) {
    if (!uploadRecord) throw coded("resume.record_not_found");
    if (uploadRecord.sourceChecksum !== sha256(source.bytes)) throw coded("resume.source_mismatch");
    const uniqueParts = new Set(uploadRecord.partReceipts.map((receipt) => receipt.index));
    if (uniqueParts.size !== uploadRecord.partReceipts.length) throw coded("receipt.duplicate");
    if (uploadRecord.partReceipts.length !== uploadRecord.acknowledgedCount) throw coded("receipt.missing");
  }

  async function reconcileParts() {
    const remote = await target.inspect(uploadRecord.uploadId);
    for (const receipt of uploadRecord.partReceipts) {
      const observed = remote.receipts.find((candidate) => candidate.index === receipt.index);
      if (!observed || observed.digest !== receipt.digest || observed.sizeBytes !== receipt.sizeBytes) throw coded("transport.remote_behind");
    }
    return remote;
  }

  async function uploadPart(part) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await target.putChunk({ sessionId: uploadRecord.uploadId, index: part.index, bytes: part.bytes });
      } catch (error) {
        const listed = target.getReceipt(part.index);
        if (listed && listed.digest === sha256(part.bytes) && listed.sizeBytes === part.bytes.byteLength) return listed;
        if (attempt === 1) throw error;
      }
    }
    throw coded("transport.retry_exhausted");
  }

  async function completeMultipart() {
    try {
      await target.complete({ sessionId: uploadRecord.uploadId, receipts: uploadRecord.partReceipts });
    } catch (error) {
      const remote = await target.inspect(uploadRecord.uploadId).catch(() => undefined);
      if (!remote?.completed) throw error;
    }
    uploadRecord.status = "completed";
    persist(uploadRecord);
    if (failDelete) {
      safeOutput.push({ code: "resume.store_failed", operation: "delete" });
      return { status: "completed_with_warning", manifest: uploadRecord.manifest };
    }
    uploadRecord = undefined;
    return { status: "completed", manifest: undefined };
  }

  async function execute(source, isResume) {
    validateSource(source);
    if (isResume) {
      validateResumeRecord(source);
      await reconcileParts();
    } else {
      const manifest = buildManifest(source);
      const created = await target.create({ totalBytes: source.bytes.byteLength, totalChunks: manifest.chunking.totalChunks });
      persist({
        uploadId: created.sessionId, sourceChecksum: manifest.checksum.value,
        manifest, partReceipts: [], acknowledgedCount: 0, uploadedBytes: 0, status: "uploading"
      });
    }
    for (const part of chunksFor(source)) {
      let receipt = uploadRecord.partReceipts.find((candidate) => candidate.index === part.index);
      if (!receipt) {
        const listed = target.getReceipt(part.index);
        if (listed && listed.digest === sha256(part.bytes) && listed.sizeBytes === part.bytes.byteLength) receipt = listed;
      }
      if (!receipt) receipt = await uploadPart(part);
      if (!uploadRecord.partReceipts.some((candidate) => candidate.index === receipt.index)) {
        uploadRecord.partReceipts.push(receipt);
        uploadRecord.partReceipts.sort((left, right) => left.index - right.index);
        uploadRecord.acknowledgedCount = uploadRecord.partReceipts.length;
        uploadRecord.uploadedBytes = uploadRecord.partReceipts.reduce((total, item) => total + item.sizeBytes, 0);
        persist(uploadRecord);
      }
    }
    return completeMultipart();
  }

  async function guarded(action) {
    try { return await action(); }
    catch (error) {
      safeOutput.push({ code: typeof error?.code === "string" ? error.code : "transport.failed" });
      throw error;
    }
  }

  return {
    async start(source) { return guarded(() => execute(source, false)); },
    async resume(source) { return guarded(() => execute(source, true)); },
    async verify(source) { return target.verify(source); },
    async tamperRecord(kind) {
      if (!uploadRecord || uploadRecord.partReceipts.length === 0) return;
      if (kind === "missing") uploadRecord.partReceipts = [];
      if (kind === "duplicate") uploadRecord.partReceipts.push(structuredClone(uploadRecord.partReceipts[0]));
    },
    async latestRecord() { return uploadRecord ? structuredClone(uploadRecord) : undefined; },
    setCleanupFailure(value) { failDelete = value; },
    safeOutput() { return structuredClone(safeOutput); },
    clearSafeOutput() { safeOutput = []; },
    chunks(source) { return chunksFor(source); }
  };
}

function coded(code) {
  const error = new Error("Multipart coordination failed safely.");
  error.code = code;
  return error;
}

module.exports = { createController, descriptor };
