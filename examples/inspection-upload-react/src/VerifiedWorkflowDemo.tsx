import { useEffect, useState } from "react";
import type { ResumeRecord, ResumeStore, UploadTransport } from "large-image-ingest/core";
import { loadBundledDomainProfile } from "large-image-ingest/profiles";
import { createVerifiedIngestController, type VerifiedIngestController } from "large-image-ingest/react";
import { VerifiedIngestPanel } from "large-image-ingest/react-ui";
import {
  createVerifiedIngestWorkflow,
  type WorkflowCheckpointStore,
  type WorkflowCheckpointV1,
  type WorkflowEvidenceSink
} from "large-image-ingest/workflow";

export function VerifiedWorkflowDemo() {
  const [controller, setController] = useState<VerifiedIngestController>();
  useEffect(() => {
    let active = true;
    let created: VerifiedIngestController | undefined;
    void createDemoController().then((value) => {
      created = value;
      if (active) setController(value);
      else value.dispose();
    });
    return () => {
      active = false;
      created?.dispose();
    };
  }, []);
  return controller
    ? <VerifiedIngestPanel controller={controller} />
    : <p className="lii-live-region" aria-live="polite">Preparing verified workflow…</p>;
}

async function createDemoController(): Promise<VerifiedIngestController> {
  const profile = await loadBundledDomainProfile("semiconductor-inspection");
  const file = new File([new Uint8Array(128)], "verified-ui-demo.tif", { type: "image/tiff" });
  const resume = new MemoryResumeStore();
  const checkpoints = new MemoryCheckpointStore();
  const evidence = new MemoryEvidenceSink();
  let id = 0;
  const workflow = createVerifiedIngestWorkflow(file, {
    profile: {
      definition: profile,
      structuralEvidence: { source: "sdk_observed", format: "tiff", width: 4096, height: 2048, bitDepth: 16 }
    },
    session: {
      transport: memoryTransport(),
      resume: { store: resume, cleanup: "delete-on-complete" },
      metadata: { lotId: "DEMO", waferId: "W1", inspectionTimestamp: "2026-09-07T00:00:00.000Z" },
      image: { width: 4096, height: 2048, colorDepth: 16 }
    },
    verifier: {
      category: "credential-free-demo",
      async verify() {
        return {
          status: "verified",
          checkedAt: new Date().toISOString(),
          expectedEvidenceCategories: ["whole-file-sha256", "size"],
          observedEvidenceCategories: ["whole-file-sha256", "size"]
        };
      }
    },
    checkpointStore: checkpoints,
    evidenceSink: evidence,
    createId: (kind) => `${kind}-ui-${++id}`
  });
  return createVerifiedIngestController(workflow);
}

function memoryTransport(): UploadTransport {
  return {
    capabilities: {
      name: "credential-free-demo", resumable: true, abortable: true, expires: false,
      supportsParallelChunks: false, supportsChunkChecksum: false,
      supportsSnapshotResume: false, supportsPersistentResume: true
    },
    async createSession() {
      return { uploadId: "demo-upload", transportName: "credential-free-demo", createdAt: new Date().toISOString() };
    },
    async uploadChunk({ chunk, body }) {
      return { chunkIndex: chunk.index, sizeBytes: body.size, completedAt: new Date().toISOString(), transport: { name: "credential-free-demo" } };
    },
    async completeSession() {}
  };
}

class MemoryResumeStore implements ResumeStore {
  private values = new Map<string, ResumeRecord>();
  async get(id: string) { return this.values.get(id); }
  async put(value: ResumeRecord) { this.values.set(value.id, structuredClone(value)); }
  async list() { return [...this.values.values()].map((value) => structuredClone(value)); }
  async delete(id: string) { this.values.delete(id); }
}

class MemoryCheckpointStore implements WorkflowCheckpointStore {
  private values = new Map<string, WorkflowCheckpointV1>();
  async get(id: string) { return this.values.get(id); }
  async put(value: WorkflowCheckpointV1, options: { expectedRevision: number | "absent" }) {
    const current = this.values.get(value.workflowId);
    if ((options.expectedRevision === "absent" && current) ||
        (typeof options.expectedRevision === "number" && current?.revision !== options.expectedRevision)) return "conflict" as const;
    this.values.set(value.workflowId, structuredClone(value));
    return "stored" as const;
  }
  async delete(id: string) { this.values.delete(id); }
}

class MemoryEvidenceSink implements WorkflowEvidenceSink {
  private values = new Map<string, Awaited<ReturnType<WorkflowEvidenceSink["get"]>>>();
  async persist(input: Parameters<WorkflowEvidenceSink["persist"]>[0]) {
    const reference = `evidence-ui-${input.revision}`;
    this.values.set(`${input.evidenceId}:${input.revision}`, {
      provenance: structuredClone(input.provenance), bundle: structuredClone(input.bundle), reference
    });
    return { status: "persisted" as const, reference, revision: input.revision };
  }
  async get(input: { evidenceId: string; revision: number }) {
    return this.values.get(`${input.evidenceId}:${input.revision}`);
  }
}
