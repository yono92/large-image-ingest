import { describe, expect, it } from "vitest";
import { createVerifiedIngestWorkflow } from "../src/workflow.js";
import type { WorkflowEvidenceSink } from "../src/workflow.js";
import {
  MemoryWorkflowEvidenceSink,
  workflowFile,
  workflowOptions
} from "./workflow-fixtures.js";

describe("workflow evidence persistence", () => {
  it("commits revision 1 as absent and exposes only the sink-confirmed reference", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const delegate = new MemoryWorkflowEvidenceSink();
    let captured: Parameters<WorkflowEvidenceSink["persist"]>[0] | undefined;
    const sink: WorkflowEvidenceSink = {
      get: delegate.get.bind(delegate),
      reconcile: delegate.reconcile.bind(delegate),
      async persist(input) {
        captured = structuredClone(input);
        return delegate.persist(input);
      }
    };

    const result = await createVerifiedIngestWorkflow(
      workflowFile(),
      await workflowOptions(calls, sink)
    ).start();
    if (result.status !== "evidence_persisted" || result.terminal !== true || !captured) {
      throw new Error("expected persisted evidence");
    }
    expect(captured.expectedRevision).toBe("absent");
    expect(captured.evidenceId).toBe(captured.bundle.id);
    expect(captured.revision).toBe(1);
    expect(result.evidenceReference).toBe("evidence-reference-1");
  });

  it("does not expose an unconfirmed bundle when the sink rejects", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const delegate = new MemoryWorkflowEvidenceSink();
    const sink: WorkflowEvidenceSink = {
      get: delegate.get.bind(delegate),
      async persist() { throw new Error("restricted provider response"); },
      async reconcile() { return { status: "not_found" }; }
    };
    const result = await createVerifiedIngestWorkflow(
      workflowFile(),
      await workflowOptions(calls, sink)
    ).start();

    expect(result.status).toBe("evidence_persistence_failed");
    expect("bundle" in result).toBe(false);
    expect("evidenceReference" in result).toBe(false);
  });

  it("reconciles a lost acknowledgement under the same operation without replay", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const delegate = new MemoryWorkflowEvidenceSink();
    let persistCalls = 0;
    let reconcileCalls = 0;
    let operationId = "";
    const sink: WorkflowEvidenceSink = {
      get: delegate.get.bind(delegate),
      async persist(input) {
        persistCalls += 1;
        operationId = input.operationId;
        await delegate.persist(input);
        throw new Error("lost acknowledgement");
      },
      async reconcile(input) {
        reconcileCalls += 1;
        expect(input.operationId).toBe(operationId);
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

  it("rejects a sink receipt for a different revision", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const delegate = new MemoryWorkflowEvidenceSink();
    const sink: WorkflowEvidenceSink = {
      get: delegate.get.bind(delegate),
      async persist() {
        return { status: "persisted", reference: "wrong-revision", revision: 2 };
      }
    };
    const result = await createVerifiedIngestWorkflow(
      workflowFile(),
      await workflowOptions(calls, sink)
    ).start();
    expect(result.status).toBe("evidence_persistence_failed");
    expect("bundle" in result).toBe(false);
  });
});
