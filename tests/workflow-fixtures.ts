import { loadBundledDomainProfile } from "../src/profiles.js";
import type {
  CreateVerifiedIngestWorkflowOptions,
  IngestEvidenceBundleV1,
  WorkflowCheckpointStore,
  WorkflowCheckpointV1,
  WorkflowEvidenceSink
} from "../src/workflow-types.js";
import type {
  IngestFileLike,
  ResumeRecord,
  ResumeStore,
  TransportSession,
  UploadChunkReceipt,
  UploadTransport
} from "../src/types.js";

export class MemoryResumeStore implements ResumeStore {
  readonly values = new Map<string, ResumeRecord>();

  async get(recordId: string): Promise<ResumeRecord | undefined> {
    const value = this.values.get(recordId);
    return value ? structuredClone(value) : undefined;
  }

  async put(record: ResumeRecord): Promise<void> {
    this.values.set(record.id, structuredClone(record));
  }

  async list(): Promise<ResumeRecord[]> {
    return [...this.values.values()].map((value) => structuredClone(value));
  }

  async delete(recordId: string): Promise<void> {
    this.values.delete(recordId);
  }
}

export class MemoryWorkflowCheckpointStore implements WorkflowCheckpointStore {
  readonly values = new Map<string, WorkflowCheckpointV1>();

  async get(workflowId: string): Promise<WorkflowCheckpointV1 | undefined> {
    const value = this.values.get(workflowId);
    return value ? structuredClone(value) : undefined;
  }

  async put(
    checkpoint: WorkflowCheckpointV1,
    options: { expectedRevision: number | "absent" }
  ): Promise<"stored" | "conflict"> {
    const current = this.values.get(checkpoint.workflowId);
    if ((options.expectedRevision === "absent" && current) ||
        (typeof options.expectedRevision === "number" && current?.revision !== options.expectedRevision)) {
      return "conflict";
    }
    this.values.set(checkpoint.workflowId, structuredClone(checkpoint));
    return "stored";
  }

  async delete(workflowId: string): Promise<void> {
    this.values.delete(workflowId);
  }
}

export class MemoryWorkflowEvidenceSink implements WorkflowEvidenceSink {
  readonly calls: Array<{
    operationId: string;
    evidenceId: string;
    revision: number;
    bundle: IngestEvidenceBundleV1;
  }> = [];
  readonly values = new Map<string, {
    provenance: Parameters<WorkflowEvidenceSink["persist"]>[0]["provenance"];
    bundle: IngestEvidenceBundleV1;
    reference: string;
  }>();

  async persist(input: Parameters<WorkflowEvidenceSink["persist"]>[0]): Promise<{
    status: "persisted";
    reference: string;
    revision: number;
  }> {
    this.calls.push({
      operationId: input.operationId,
      evidenceId: input.evidenceId,
      revision: input.revision,
      bundle: structuredClone(input.bundle)
    });
    const reference = `evidence-reference-${input.revision}`;
    this.values.set(`${input.evidenceId}:${input.revision}`, {
      provenance: structuredClone(input.provenance),
      bundle: structuredClone(input.bundle),
      reference
    });
    return {
      status: "persisted",
      reference,
      revision: input.revision
    };
  }

  async get(input: { evidenceId: string; revision: number }) {
    const value = this.values.get(`${input.evidenceId}:${input.revision}`);
    return value ? structuredClone(value) : undefined;
  }

  async reconcile(input: { operationId: string; evidenceId: string; revision: number }) {
    const value = this.values.get(`${input.evidenceId}:${input.revision}`);
    if (!value) return { status: "not_found" as const };
    const call = this.calls.find((candidate) =>
      candidate.operationId === input.operationId && candidate.evidenceId === input.evidenceId &&
      candidate.revision === input.revision
    );
    return call
      ? { status: "persisted" as const, reference: value.reference, revision: input.revision }
      : { status: "not_found" as const };
  }
}

export function workflowFile(value = "verified-workflow-source"): IngestFileLike {
  const blob = new Blob([value], { type: "image/tiff" });
  Object.defineProperties(blob, {
    name: { value: "inspection.tif" },
    lastModified: { value: 0 }
  });
  return blob as IngestFileLike;
}

export function workflowTransport(calls: {
  create: number;
  upload: number;
  complete: number;
  source?: IngestFileLike;
}): UploadTransport {
  return {
    capabilities: {
      name: "workflow-fixture",
      resumable: true,
      abortable: true,
      expires: false,
      supportsParallelChunks: false,
      supportsChunkChecksum: false,
      supportsSnapshotResume: false,
      supportsPersistentResume: true
    },
    async createSession({ file }): Promise<TransportSession> {
      calls.create += 1;
      calls.source = file;
      return {
        uploadId: "upload-workflow-fixture",
        transportName: "workflow-fixture",
        createdAt: "2026-09-07T00:00:00.000Z"
      };
    },
    async resumeSession({ file, record }): Promise<TransportSession> {
      calls.source = file;
      return {
        uploadId: record.transport.uploadId,
        transportName: "workflow-fixture",
        createdAt: "2026-09-07T00:00:00.000Z"
      };
    },
    async uploadChunk({ chunk, body }): Promise<UploadChunkReceipt> {
      calls.upload += 1;
      return {
        chunkIndex: chunk.index,
        sizeBytes: body.size,
        completedAt: "2026-09-07T00:00:00.000Z",
        transport: { name: "workflow-fixture" }
      };
    },
    async completeSession(): Promise<void> {
      calls.complete += 1;
    }
  };
}

export async function workflowOptions(
  calls: { create: number; upload: number; complete: number; verify: number; source?: IngestFileLike },
  evidenceSink = new MemoryWorkflowEvidenceSink(),
  checkpointStore = new MemoryWorkflowCheckpointStore()
): Promise<CreateVerifiedIngestWorkflowOptions> {
  const profile = await loadBundledDomainProfile("semiconductor-inspection");
  let operation = 0;
  return {
    profile: {
      definition: profile,
      structuralEvidence: {
        source: "sdk_observed",
        format: "tiff",
        width: 4096,
        height: 2048,
        bitDepth: 16
      }
    },
    session: {
      transport: workflowTransport(calls),
      resume: { store: new MemoryResumeStore(), cleanup: "delete-on-complete" },
      metadata: {
        lotId: "LOT-2026-001",
        waferId: "W12",
        inspectionTimestamp: "2026-09-07T00:00:00.000Z"
      },
      image: { width: 4096, height: 2048, colorDepth: 16 }
    },
    verifier: {
      category: "stored-original",
      async verify() {
        calls.verify += 1;
        return {
          status: "verified",
          checkedAt: "2026-09-07T00:00:00.000Z",
          expectedEvidenceCategories: ["whole-file-sha256", "size"],
          observedEvidenceCategories: ["whole-file-sha256", "size"]
        };
      }
    },
    checkpointStore,
    evidenceSink,
    now: () => new Date("2026-09-07T00:00:00.000Z"),
    createId(kind) {
      operation += 1;
      return `${kind}-${operation}`;
    }
  };
}
