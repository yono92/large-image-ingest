import type { ReferenceTarget, SourceFixture, TargetReceipt, FixtureChunk } from "../reference-target.cjs";
import { chunksFor, sha256 } from "../reference-target.cjs";

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

function createController({ target }: { target: ReferenceTarget }) {
  type RawRecord = {
    uploadId: string;
    sourceChecksum: string;
    manifest: ReturnType<typeof buildManifest>;
    partReceipts: TargetReceipt[];
    acknowledgedCount: number;
    uploadedBytes: number;
    status: string;
  };
  let uploadRecord: RawRecord | undefined;
  function currentRecord(): RawRecord {
    if (!uploadRecord) throw coded("resume.record_not_found");
    return uploadRecord;
  }
  let failDelete = false;
  let safeOutput: { code: string; operation?: string }[] = [];

  function validateSource(source: { bytes: { byteLength: number; }; type: string; name: string; }) {
    if (!source || source.bytes.byteLength === 0) throw coded("validation.empty");
    if (source.type !== "image/tiff" || !source.name.toLowerCase().endsWith(".tif")) throw coded("validation.type");
  }

  function buildManifest(source: SourceFixture) {
    const parts = chunksFor(source);
    return {
      schemaVersion: "raw-reference-manifest.v1",
      original: { name: source.name, type: source.type, sizeBytes: source.bytes.byteLength },
      checksum: { algorithm: "sha256", value: sha256(source.bytes) },
      chunking: { sizeBytes: parts[0]!.bytes.byteLength, totalChunks: parts.length }
    };
  }

  function persist(next: RawRecord) {
    uploadRecord = structuredClone(next);
  }

  function validateResumeRecord(source: SourceFixture) {
    if (!uploadRecord) throw coded("resume.record_not_found");
    if (currentRecord().sourceChecksum !== sha256(source.bytes)) throw coded("resume.source_mismatch");
    const uniqueParts = new Set(currentRecord().partReceipts.map((receipt) => receipt.index));
    if (uniqueParts.size !== currentRecord().partReceipts.length) throw coded("receipt.duplicate");
    if (currentRecord().partReceipts.length !== currentRecord().acknowledgedCount) throw coded("receipt.missing");
  }

  async function reconcileParts() {
    const remote = await target.inspect(currentRecord().uploadId);
    for (const receipt of currentRecord().partReceipts) {
      const observed = remote.receipts.find((candidate) => candidate.index === receipt.index);
      if (!observed || observed.digest !== receipt.digest || observed.sizeBytes !== receipt.sizeBytes) throw coded("transport.remote_behind");
    }
    return remote;
  }

  async function uploadPart(part: FixtureChunk) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await target.putChunk({ sessionId: currentRecord().uploadId, index: part.index, bytes: part.bytes });
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
      await target.complete({ sessionId: currentRecord().uploadId, receipts: currentRecord().partReceipts });
    } catch (error) {
      const remote = await target.inspect(currentRecord().uploadId).catch(() => undefined);
      if (!remote?.completed) throw error;
    }
    currentRecord().status = "completed";
    persist(currentRecord());
    if (failDelete) {
      safeOutput.push({ code: "resume.store_failed", operation: "delete" });
      return { status: "completed_with_warning", manifest: currentRecord().manifest };
    }
    uploadRecord = undefined;
    return { status: "completed", manifest: undefined };
  }

  async function execute(source: SourceFixture, isResume: boolean) {
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
      let receipt = currentRecord().partReceipts.find((candidate: { index: number; }) => candidate.index === part.index);
      if (!receipt) {
        const listed = target.getReceipt(part.index);
        if (listed && listed.digest === sha256(part.bytes) && listed.sizeBytes === part.bytes.byteLength) receipt = listed;
      }
      if (!receipt) receipt = await uploadPart(part);
      if (!currentRecord().partReceipts.some((candidate) => candidate.index === receipt.index)) {
        currentRecord().partReceipts.push(receipt);
        currentRecord().partReceipts.sort((left: { index: number; }, right: { index: number; }) => left.index - right.index);
        currentRecord().acknowledgedCount = currentRecord().partReceipts.length;
        currentRecord().uploadedBytes = currentRecord().partReceipts.reduce((total, item) => total + item.sizeBytes, 0);
        persist(currentRecord());
      }
    }
    return completeMultipart();
  }

  async function guarded<T>(action: () => Promise<T>) {
    try { return await action(); }
    catch (error) {
      safeOutput.push({ code: error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "transport.failed" });
      throw error;
    }
  }

  return {
    async start(source: SourceFixture) { return guarded(() => execute(source, false)); },
    async resume(source: SourceFixture) { return guarded(() => execute(source, true)); },
    async verify(source: SourceFixture) { return target.verify(source); },
    async tamperRecord(kind: string) {
      if (!uploadRecord || currentRecord().partReceipts.length === 0) return;
      if (kind === "missing") currentRecord().partReceipts = [];
      if (kind === "duplicate") currentRecord().partReceipts.push(structuredClone(currentRecord().partReceipts[0]!));
    },
    async latestRecord() { return uploadRecord ? structuredClone(uploadRecord) : undefined; },
    setCleanupFailure(value: boolean) { failDelete = value; },
    safeOutput() { return structuredClone(safeOutput); },
    clearSafeOutput() { safeOutput = []; },
    chunks(source: SourceFixture) { return chunksFor(source); }
  };
}

function coded(code: string) {
  return Object.assign(new Error("Multipart coordination failed safely."), { code });
}

export { createController, descriptor };
