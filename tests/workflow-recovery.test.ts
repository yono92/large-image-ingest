import { describe, expect, it } from "vitest";
import { createNodeChecksumExecutor } from "../src/node.js";
import type { ChecksumExecutor } from "../src/types.js";
import { createVerifiedIngestWorkflow } from "../src/workflow.js";
import {
  MemoryResumeStore,
  MemoryWorkflowCheckpointStore,
  MemoryWorkflowEvidenceSink,
  workflowFile,
  workflowOptions
} from "./workflow-fixtures.js";

describe("workflow process restart", () => {
  it("continues at verification without repeating an authoritative upload", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const checkpointStore = new MemoryWorkflowCheckpointStore();
    const evidenceSink = new MemoryWorkflowEvidenceSink();
    const resumeStore = new MemoryResumeStore();
    const firstBase = await workflowOptions(calls, evidenceSink, checkpointStore);
    const operationIds: string[] = [];
    const firstOptions = {
      ...firstBase,
      session: { ...firstBase.session, resume: { store: resumeStore, cleanup: "delete-on-complete" as const } },
      verifier: {
        category: "stored-original",
        async verify({ operationId }: { operationId: string }) {
          calls.verify += 1;
          operationIds.push(operationId);
          return {
            status: "failed" as const,
            checkedAt: "2026-09-07T00:00:00.000Z",
            issueCodes: ["verification.checksum_mismatch"],
            retryable: true
          };
        }
      }
    };
    const failed = await createVerifiedIngestWorkflow(workflowFile(), firstOptions).start();
    expect(failed.status).toBe("verification_failed");
    const uploadCounts = { create: calls.create, upload: calls.upload, complete: calls.complete };

    const secondBase = await workflowOptions(calls, evidenceSink, checkpointStore);
    const secondOptions = {
      ...secondBase,
      session: { ...secondBase.session, resume: { store: resumeStore, cleanup: "delete-on-complete" as const } },
      verifier: {
        category: "stored-original",
        async verify({ operationId }: { operationId: string }) {
          calls.verify += 1;
          operationIds.push(operationId);
          return {
            status: "verified" as const,
            checkedAt: "2026-09-07T00:00:00.000Z",
            expectedEvidenceCategories: ["whole-file-sha256"],
            observedEvidenceCategories: ["whole-file-sha256"]
          };
        }
      }
    };
    const completed = await createVerifiedIngestWorkflow(workflowFile(), secondOptions)
      .resume(failed.workflowId);

    expect(completed.status).toBe("evidence_persisted");
    expect({ create: calls.create, upload: calls.upload, complete: calls.complete }).toEqual(uploadCounts);
    expect(operationIds[1]).toBe(operationIds[0]);
    expect(await resumeStore.list()).toHaveLength(0);
  });

  it("restarts evidence persistence without recreating upload or verification", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const checkpointStore = new MemoryWorkflowCheckpointStore();
    const resumeStore = new MemoryResumeStore();
    const persisted = new MemoryWorkflowEvidenceSink();
    let fail = true;
    const sink = {
      get: persisted.get.bind(persisted),
      reconcile: persisted.reconcile.bind(persisted),
      async persist(input: Parameters<typeof persisted.persist>[0]) {
        if (fail) {
          fail = false;
          throw new Error("definite write failure");
        }
        return persisted.persist(input);
      }
    };
    const firstBase = await workflowOptions(calls, sink, checkpointStore);
    const firstOptions = {
      ...firstBase,
      session: { ...firstBase.session, resume: { store: resumeStore, cleanup: "delete-on-complete" as const } }
    };
    const failed = await createVerifiedIngestWorkflow(workflowFile(), firstOptions).start();
    expect(failed.status).toBe("evidence_persistence_failed");
    const fixedCounts = { create: calls.create, upload: calls.upload, complete: calls.complete, verify: calls.verify };

    const secondBase = await workflowOptions(calls, sink, checkpointStore);
    const completed = await createVerifiedIngestWorkflow(workflowFile(), {
      ...secondBase,
      session: { ...secondBase.session, resume: { store: resumeStore, cleanup: "delete-on-complete" as const } }
    }).resume(failed.workflowId);

    expect(completed.status).toBe("evidence_persisted");
    expect({ create: calls.create, upload: calls.upload, complete: calls.complete, verify: calls.verify })
      .toEqual(fixedCounts);
    if (completed.status !== "evidence_persisted") throw new Error("unexpected result");
    expect(completed.bundle.stages.find(({ stage }) => stage === "evidence_persistence")?.attempts).toBe(2);
  });
});

describe("workflow restart checksum executor", () => {
  it("re-hashes the source on restart with the configured executor", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const checkpointStore = new MemoryWorkflowCheckpointStore();
    const evidenceSink = new MemoryWorkflowEvidenceSink();
    const resumeStore = new MemoryResumeStore();
    const native = createNodeChecksumExecutor();
    let executorCalls = 0;
    const executor: ChecksumExecutor = {
      calculate(file, options) {
        executorCalls += 1;
        return native.calculate(file, options);
      }
    };
    const withExecutor = async (status: "failed" | "verified") => {
      const base = await workflowOptions(calls, evidenceSink, checkpointStore);
      return {
        ...base,
        session: {
          ...base.session,
          checksum: { executor },
          resume: { store: resumeStore, cleanup: "delete-on-complete" as const }
        },
        verifier: {
          category: "stored-original",
          async verify() {
            return status === "failed"
              ? { status, checkedAt: "2026-09-07T00:00:00.000Z", issueCodes: ["verification.checksum_mismatch" as const], retryable: true }
              : {
                  status,
                  checkedAt: "2026-09-07T00:00:00.000Z",
                  expectedEvidenceCategories: ["whole-file-sha256"],
                  observedEvidenceCategories: ["whole-file-sha256"]
                };
          }
        }
      };
    };
    const failed = await createVerifiedIngestWorkflow(workflowFile(), await withExecutor("failed")).start();
    const afterStart = executorCalls;
    expect(afterStart).toBeGreaterThan(0);
    const completed = await createVerifiedIngestWorkflow(workflowFile(), await withExecutor("verified"))
      .resume(failed.workflowId);
    expect(completed.status).toBe("evidence_persisted");
    expect(executorCalls).toBeGreaterThan(afterStart);
  });
});
