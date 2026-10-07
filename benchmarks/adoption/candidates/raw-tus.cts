import type { ReferenceTarget, SourceFixture, TargetReceipt, FixtureChunk } from "../reference-target.cjs";
import { chunksFor, sha256 } from "../reference-target.cjs";

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

function createController({ target }: { target: ReferenceTarget }) {
  type RawRecord = {
    sessionId: string;
    sourceChecksum: string;
    manifest: ReturnType<typeof createManifest>;
    receipts: TargetReceipt[];
    acknowledgedCount: number; uploadedBytes: number;
    
    status: string;
  };
  let record: RawRecord | undefined;
  function currentRecord(): RawRecord {
    if (!record) throw coded("resume.record_not_found");
    return record;
  }
  let failDelete = false;
  let safeOutput: { code: string; operation?: string }[] = [];

  function validateSource(source: { bytes: { byteLength: number; }; type: string; name: string; }) {
    if (!source || source.bytes.byteLength === 0) throw coded("validation.empty");
    if (source.type !== "image/tiff" || !source.name.toLowerCase().endsWith(".tif")) throw coded("validation.type");
  }

  function createManifest(source: SourceFixture) {
    return {
      schemaVersion: "raw-reference-manifest.v1",
      original: { name: source.name, type: source.type, sizeBytes: source.bytes.byteLength },
      checksum: { algorithm: "sha256", value: sha256(source.bytes) },
      chunking: { sizeBytes: chunksFor(source)[0]!.bytes.byteLength, totalChunks: chunksFor(source).length }
    };
  }

  function save(next: RawRecord) {
    record = structuredClone(next);
  }

  function validateRecord(source: SourceFixture) {
    if (!record) throw coded("resume.record_not_found");
    if (currentRecord().sourceChecksum !== sha256(source.bytes)) throw coded("resume.source_mismatch");
    if (new Set(currentRecord().receipts.map((receipt) => receipt.index)).size !== currentRecord().receipts.length) throw coded("receipt.duplicate");
    if (currentRecord().receipts.length !== currentRecord().acknowledgedCount) throw coded("receipt.missing");
  }

  async function reconcileRemote() {
    const remote = await target.inspect(currentRecord().sessionId);
    for (const receipt of currentRecord().receipts) {
      const observed = remote.receipts.find((candidate) => candidate.index === receipt.index);
      if (!observed || observed.digest !== receipt.digest || observed.sizeBytes !== receipt.sizeBytes) throw coded("transport.remote_behind");
    }
    return remote;
  }

  async function sendChunk(chunk: FixtureChunk) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await target.putChunk({ sessionId: currentRecord().sessionId, index: chunk.index, bytes: chunk.bytes });
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
      await target.complete({ sessionId: currentRecord().sessionId, receipts: currentRecord().receipts });
    } catch (error) {
      const remote = await target.inspect(currentRecord().sessionId).catch(() => undefined);
      if (!remote?.completed) throw error;
    }
    currentRecord().status = "completed";
    save(currentRecord());
    if (failDelete) {
      safeOutput.push({ code: "resume.store_failed", operation: "delete" });
      return { status: "completed_with_warning", manifest: currentRecord().manifest };
    }
    record = undefined;
    return { status: "completed", manifest: undefined };
  }

  async function transfer(source: SourceFixture, isResume: boolean) {
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
      let receipt = currentRecord().receipts.find((candidate: { index: number; }) => candidate.index === chunk.index);
      if (!receipt) {
        const observed = target.getReceipt(chunk.index);
        if (observed && observed.digest === sha256(chunk.bytes) && observed.sizeBytes === chunk.bytes.byteLength) receipt = observed;
      }
      if (!receipt) receipt = await sendChunk(chunk);
      if (!currentRecord().receipts.some((candidate) => candidate.index === receipt.index)) {
        currentRecord().receipts.push(receipt);
        currentRecord().receipts.sort((left: { index: number; }, right: { index: number; }) => left.index - right.index);
        currentRecord().acknowledgedCount = currentRecord().receipts.length;
        currentRecord().uploadedBytes = currentRecord().receipts.reduce((total, item) => total + item.sizeBytes, 0);
        save(currentRecord());
      }
    }
    return finish();
  }

  async function guarded<T>(action: () => Promise<T>) {
    try { return await action(); }
    catch (error) {
      safeOutput.push({ code: error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "transport.failed" });
      throw error;
    }
  }

  return {
    async start(source: SourceFixture) { return guarded(() => transfer(source, false)); },
    async resume(source: SourceFixture) { return guarded(() => transfer(source, true)); },
    async verify(source: SourceFixture) { return target.verify(source); },
    async tamperRecord(kind: string) {
      if (!record || currentRecord().receipts.length === 0) return;
      if (kind === "missing") currentRecord().receipts = [];
      if (kind === "duplicate") currentRecord().receipts.push(structuredClone(currentRecord().receipts[0]!));
    },
    async latestRecord() { return record ? structuredClone(record) : undefined; },
    setCleanupFailure(value: boolean) { failDelete = value; },
    safeOutput() { return structuredClone(safeOutput); },
    clearSafeOutput() { safeOutput = []; },
    chunks(source: SourceFixture) { return chunksFor(source); }
  };
}

function coded(code: string) {
  return Object.assign(new Error("Upload coordination failed safely."), { code });
}

export { createController, descriptor };
