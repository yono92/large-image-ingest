const { chunksFor } = require("../reference-target.cjs");

const descriptor = {
  id: "sdk-s3",
  version: "2.0.0-workflow",
  transportStyle: "s3-multipart",
  dependencies: [{ id: "large-image-ingest", version: "1.7.0" }],
  configurationDecisions: [
    "domain-profile", "resume-store", "broker-boundary", "stored-verifier", "evidence-sink"
  ],
  publicBoundaries: ["verified-workflow", "multipart-broker", "resume-store", "stored-verifier", "evidence-sink"],
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
  const checkpoints = new Map();
  const evidence = new Map();
  let failDelete = false;
  let safeOutput = [];
  let activeWorkflowId;
  let id = 0;
  const store = {
    async get(id) { return records.get(id); },
    async put(record) { records.set(record.id, structuredClone(record)); },
    async list() { return [...records.values()].map((record) => structuredClone(record)); },
    async delete(id) {
      if (failDelete) {
        safeOutput.push({ code: "resume.store_failed" });
        throw new Error("customer-secret cleanup path");
      }
      records.delete(id);
    }
  };
  const checkpointStore = {
    async get(workflowId) { return checkpoints.get(workflowId); },
    async put(checkpoint, options) {
      const current = checkpoints.get(checkpoint.workflowId);
      if ((options.expectedRevision === "absent" && current) ||
          (typeof options.expectedRevision === "number" && current?.revision !== options.expectedRevision)) {
        return "conflict";
      }
      checkpoints.set(checkpoint.workflowId, structuredClone(checkpoint));
      return "stored";
    },
    async delete(workflowId) { checkpoints.delete(workflowId); }
  };
  const evidenceSink = {
    async persist(input) {
      const reference = `adoption-evidence-${input.revision}`;
      evidence.set(`${input.evidenceId}:${input.revision}`, {
        provenance: structuredClone(input.provenance),
        bundle: structuredClone(input.bundle),
        reference,
        operationId: input.operationId
      });
      return { status: "persisted", reference, revision: input.revision };
    },
    async reconcile(input) {
      const value = evidence.get(`${input.evidenceId}:${input.revision}`);
      return value?.operationId === input.operationId
        ? { status: "persisted", reference: value.reference, revision: input.revision }
        : { status: "not_found" };
    },
    async get(input) {
      const value = evidence.get(`${input.evidenceId}:${input.revision}`);
      return value && {
        provenance: structuredClone(value.provenance),
        bundle: structuredClone(value.bundle),
        reference: value.reference
      };
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

  async function run(source, workflowId) {
    const file = toFile(source);
    const profile = await sdk.loadBundledDomainProfile("semiconductor-inspection");
    const workflow = sdk.createVerifiedIngestWorkflow(file, {
      profile: {
        definition: profile,
        structuralEvidence: {
          source: "sdk_observed", format: "tiff", width: 4096, height: 2048, bitDepth: 16
        }
      },
      session: {
        chunking: { chunkSize: 256 * 1024 },
        retryPolicy: { maxAttempts: 2, delayMs: 0 },
        resume: { store, cleanup: "delete-on-complete" },
        transport: createTransport(),
        metadata: {
          lotId: "ADOPTION", waferId: "W1", inspectionTimestamp: "2026-09-07T00:00:00.000Z"
        },
        image: { width: 4096, height: 2048, colorDepth: 16 }
      },
      verifier: {
        category: "adoption-stored-original",
        async verify({ manifest }) {
          if (!target.stored) {
            return {
              status: "unavailable", checkedAt: "2026-09-07T00:00:00.000Z",
              issueCodes: ["verification.file_not_found"], retryable: true
            };
          }
          const stored = toFile({ ...source, bytes: target.stored });
          const verification = await sdk.verifyIngestIntegrity({ manifest, file: stored });
          return verification.ok
            ? {
                status: "verified", checkedAt: "2026-09-07T00:00:00.000Z",
                expectedEvidenceCategories: ["whole-file-sha256", "size"],
                observedEvidenceCategories: ["whole-file-sha256", "size"]
              }
            : {
                status: "failed", checkedAt: "2026-09-07T00:00:00.000Z",
                issueCodes: verification.issues.map((issue) => issue.code), retryable: false
              };
        }
      },
      checkpointStore,
      evidenceSink,
      now: () => new Date("2026-09-07T00:00:00.000Z"),
      createId: (kind) => `${kind}-adoption-${++id}`
    });
    const result = workflowId ? await workflow.resume(workflowId) : await workflow.start();
    activeWorkflowId = result.workflowId;
    if (result.status !== "evidence_persisted") {
      const code = result.issueCodes?.[0] ?? `workflow.${result.status}`;
      safeOutput.push({ code });
      throw safeError(code);
    }
    return result;
  }

  return {
    async start(source) { return run(source); },
    async resume(source) {
      if (!activeWorkflowId) throw safeError("resume.record_not_found");
      return run(source, activeWorkflowId);
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
