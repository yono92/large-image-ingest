import { describe, expect, it } from "vitest";
import { createVerifiedIngestWorkflow } from "../src/workflow.js";
import {
  MemoryWorkflowEvidenceSink,
  workflowFile,
  workflowOptions
} from "./workflow-fixtures.js";

describe("workflow idempotency", () => {
  it("reuses the evidence operation, identity, and bytes after a definite sink failure", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const delegate = new MemoryWorkflowEvidenceSink();
    const attempts: Parameters<typeof delegate.persist>[0][] = [];
    let fail = true;
    const sink = {
      get: delegate.get.bind(delegate),
      reconcile: delegate.reconcile.bind(delegate),
      async persist(input: Parameters<typeof delegate.persist>[0]) {
        attempts.push(structuredClone(input));
        if (fail) {
          fail = false;
          throw new Error("seeded provider secret");
        }
        return delegate.persist(input);
      }
    };
    const workflow = createVerifiedIngestWorkflow(
      workflowFile(),
      await workflowOptions(calls, sink)
    );
    const failed = await workflow.start();
    expect(failed.status).toBe("evidence_persistence_failed");
    const uploadCounts = { create: calls.create, upload: calls.upload, complete: calls.complete };
    const completed = await workflow.retry();

    expect(completed.status).toBe("evidence_persisted");
    expect(attempts).toHaveLength(2);
    expect(attempts[1]?.operationId).toBe(attempts[0]?.operationId);
    expect(attempts[1]?.evidenceId).toBe(attempts[0]?.evidenceId);
    expect(attempts[1]?.bundle.integrity.value).toBe(attempts[0]?.bundle.integrity.value);
    expect({ create: calls.create, upload: calls.upload, complete: calls.complete }).toEqual(uploadCounts);
  });

  it("reconciles a persisted evidence write whose acknowledgement was lost", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const delegate = new MemoryWorkflowEvidenceSink();
    let persistCalls = 0;
    let reconcileCalls = 0;
    const sink = {
      get: delegate.get.bind(delegate),
      async persist(input: Parameters<typeof delegate.persist>[0]) {
        persistCalls += 1;
        await delegate.persist(input);
        throw new Error("acknowledgement lost");
      },
      async reconcile(input: Parameters<typeof delegate.reconcile>[0]) {
        reconcileCalls += 1;
        return delegate.reconcile(input);
      }
    };
    const result = await createVerifiedIngestWorkflow(
      workflowFile(),
      await workflowOptions(calls, sink)
    ).start();

    expect(result.status).toBe("evidence_persisted");
    expect({ persistCalls, reconcileCalls }).toEqual({ persistCalls: 1, reconcileCalls: 1 });
  });
});
