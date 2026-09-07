import { describe, expect, it, vi } from "vitest";
import { createVerifiedIngestWorkflow } from "../src/workflow.js";
import type { TransportSession, UploadChunkReceipt, UploadTransport } from "../src/types.js";
import { loadBundledDomainProfile } from "../src/profiles.js";
import {
  MemoryResumeStore,
  MemoryWorkflowCheckpointStore,
  workflowFile,
  workflowOptions
} from "./workflow-fixtures.js";

describe("workflow restart source identity", () => {
  it("rejects metadata-equal different bytes before remote resume", async () => {
    const calls = { create: 0, resume: 0, upload: 0, complete: 0, verify: 0 };
    const checkpointStore = new MemoryWorkflowCheckpointStore();
    const resumeStore = new MemoryResumeStore();
    const base = await workflowOptions(calls, undefined, checkpointStore);
    const transport: UploadTransport = {
      capabilities: {
        name: "workflow-source-check",
        resumable: true,
        abortable: true,
        expires: false,
        supportsParallelChunks: false,
        supportsChunkChecksum: false,
        supportsSnapshotResume: true,
        supportsPersistentResume: true
      },
      async createSession(): Promise<TransportSession> {
        calls.create += 1;
        return { uploadId: "source-upload", transportName: "workflow-source-check", createdAt: "2026-09-07T00:00:00.000Z" };
      },
      async resumeSession({ record }): Promise<TransportSession> {
        calls.resume += 1;
        return { uploadId: record.transport.uploadId, transportName: "workflow-source-check", createdAt: "2026-09-07T00:00:00.000Z" };
      },
      async uploadChunk({ signal, chunk, body }): Promise<UploadChunkReceipt> {
        calls.upload += 1;
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
        return { chunkIndex: chunk.index, sizeBytes: body.size, completedAt: "2026-09-07T00:00:00.000Z", transport: { name: "workflow-source-check" } };
      },
      async completeSession() { calls.complete += 1; }
    };
    const options = {
      ...base,
      session: { ...base.session, transport, resume: { store: resumeStore, cleanup: "mark-complete" as const } }
    };
    const first = createVerifiedIngestWorkflow(workflowFile("original-bytes"), options);
    const running = first.start();
    await vi.waitFor(() => expect(first.getState().status).toBe("uploading"));
    first.pause();
    const paused = await running;
    expect(paused.status).toBe("paused");

    const before = { resume: calls.resume, upload: calls.upload, complete: calls.complete };
    const second = createVerifiedIngestWorkflow(workflowFile("different-byte"), options);
    const rejected = await second.resume(paused.workflowId);
    expect(rejected).toMatchObject({ status: "preparation_failed", issueCodes: ["workflow.source_mismatch"] });
    expect({ resume: calls.resume, upload: calls.upload, complete: calls.complete }).toEqual(before);

    const stored = await checkpointStore.get(paused.workflowId);
    if (!stored) throw new Error("checkpoint missing");
    const chunkMismatch = await createVerifiedIngestWorkflow(workflowFile("original-bytes"), {
      ...options,
      session: { ...options.session, chunking: { chunkSize: 512 * 1024 } }
    }).resume(paused.workflowId);
    expect(chunkMismatch.status).toBe("upload_failed");
    expect(calls.resume).toBe(0);

    checkpointStore.values.set(paused.workflowId, stored);
    const transportMismatch: UploadTransport = {
      ...transport,
      capabilities: { ...transport.capabilities!, name: "different-transport" }
    };
    const mismatched = await createVerifiedIngestWorkflow(workflowFile("original-bytes"), {
      ...options,
      session: { ...options.session, transport: transportMismatch }
    }).resume(paused.workflowId);
    expect(mismatched.status).toBe("upload_failed");
    expect(calls.resume).toBe(0);
  });

  it("rejects a profile mismatch before reading source bytes", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const base = await workflowOptions(calls);
    const failed = await createVerifiedIngestWorkflow(workflowFile(), {
      ...base,
      verifier: {
        category: "stored-original",
        async verify() {
          calls.verify += 1;
          return {
            status: "failed",
            checkedAt: "2026-09-07T00:00:00.000Z",
            issueCodes: ["verification.checksum_mismatch"],
            retryable: true
          } as const;
        }
      }
    }).start();
    const microscopy = await loadBundledDomainProfile("microscopy-acquisition");
    class NoReadBlob extends Blob {
      override slice(): Blob {
        throw new Error("source bytes must not be read");
      }
    }
    const selected = new NoReadBlob(["verified-workflow-source"], { type: "image/tiff" });
    Object.defineProperties(selected, {
      name: { value: "inspection.tif" },
      lastModified: { value: 0 }
    });
    const resumed = await createVerifiedIngestWorkflow(selected as import("../src/types.js").IngestFileLike, {
      ...base,
      profile: { definition: microscopy }
    }).resume(failed.workflowId);
    expect(resumed).toMatchObject({ status: "preparation_failed", issueCodes: ["workflow.profile_mismatch"] });
  });
});
