import { describe, expect, it, vi } from "vitest";
import { createVerifiedIngestWorkflow } from "../src/workflow.js";
import type { TransportSession, UploadChunkReceipt, UploadTransport } from "../src/types.js";
import { workflowFile, workflowOptions } from "./workflow-fixtures.js";

describe("workflow pause and transition races", () => {
  it("delegates pause and retry to core persistent resume", async () => {
    const calls = { create: 0, resume: 0, upload: 0, complete: 0, verify: 0 };
    const base = await workflowOptions(calls);
    const transport: UploadTransport = {
      capabilities: {
        name: "workflow-pause",
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
        return { uploadId: "pause-upload", transportName: "workflow-pause", createdAt: "2026-09-07T00:00:00.000Z" };
      },
      async resumeSession({ record }): Promise<TransportSession> {
        calls.resume += 1;
        return { uploadId: record.transport.uploadId, transportName: "workflow-pause", createdAt: "2026-09-07T00:00:00.000Z" };
      },
      async uploadChunk({ chunk, body, signal }): Promise<UploadChunkReceipt> {
        calls.upload += 1;
        if (calls.upload === 1) {
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          });
        }
        return {
          chunkIndex: chunk.index,
          sizeBytes: body.size,
          completedAt: "2026-09-07T00:00:00.000Z",
          transport: { name: "workflow-pause" }
        };
      },
      async completeSession() { calls.complete += 1; }
    };
    const workflow = createVerifiedIngestWorkflow(workflowFile(), {
      ...base,
      session: { ...base.session, transport }
    });
    const running = workflow.start();
    await vi.waitFor(() => expect(workflow.getState().status).toBe("uploading"));
    workflow.pause();
    await expect(running).resolves.toMatchObject({ status: "paused" });
    await expect(workflow.retry()).resolves.toMatchObject({ status: "evidence_persisted" });
    expect(calls).toMatchObject({ create: 1, resume: 1, complete: 1, verify: 1 });
  });

  it("rejects invalid actions without external mutation", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const workflow = createVerifiedIngestWorkflow(workflowFile(), await workflowOptions(calls));
    expect(() => workflow.pause()).toThrowError(expect.objectContaining({ code: "workflow.transition_invalid" }));
    await expect(workflow.retry()).rejects.toMatchObject({ code: "workflow.transition_invalid" });
    expect(calls).toMatchObject({ create: 0, upload: 0, complete: 0, verify: 0 });
  });

  it("cancels an active upload without starting verification", async () => {
    const calls = { create: 0, resume: 0, upload: 0, complete: 0, verify: 0 };
    const base = await workflowOptions(calls);
    const transport: UploadTransport = {
      ...base.session.transport,
      async uploadChunk({ signal }) {
        calls.upload += 1;
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      }
    };
    const workflow = createVerifiedIngestWorkflow(workflowFile(), {
      ...base,
      session: { ...base.session, transport }
    });
    const running = workflow.start();
    await vi.waitFor(() => expect(workflow.getState().status).toBe("uploading"));
    await expect(workflow.cancel()).resolves.toMatchObject({ status: "canceled" });
    await expect(running).resolves.toMatchObject({ status: "canceled" });
    expect(calls.verify).toBe(0);
  });

  it("stops after upload authority and ignores a late verifier result", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const base = await workflowOptions(calls);
    let release: (() => void) | undefined;
    const verifierStarted = new Promise<void>((resolve) => {
      release = resolve;
    });
    let finish: (() => void) | undefined;
    const verifierBlocked = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const workflow = createVerifiedIngestWorkflow(workflowFile(), {
      ...base,
      verifier: {
        category: "stored-original",
        async verify() {
          calls.verify += 1;
          release?.();
          await verifierBlocked;
          return {
            status: "verified",
            checkedAt: "2026-09-07T00:00:00.000Z",
            expectedEvidenceCategories: ["whole-file-sha256"],
            observedEvidenceCategories: ["whole-file-sha256"]
          } as const;
        }
      }
    });
    const running = workflow.start();
    await verifierStarted;
    await expect(workflow.cancel()).resolves.toMatchObject({
      status: "stopped",
      lastAuthoritativeState: "uploaded_unverified"
    });
    finish?.();
    await expect(running).resolves.toMatchObject({ status: "stopped" });
    expect(workflow.getState().status).toBe("stopped");
  });
});
