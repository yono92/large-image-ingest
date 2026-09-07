import { describe, expect, it } from "vitest";
import { createVerifiedIngestWorkflow } from "../src/workflow.js";
import type {
  IngestEvidenceBundleV1,
  PreservationHandoffAdapter,
  WorkflowEvidenceSink
} from "../src/workflow.js";
import {
  MemoryWorkflowEvidenceSink,
  workflowFile,
  workflowOptions
} from "./workflow-fixtures.js";

describe("verified workflow preservation", () => {
  it("treats absent preservation as complete evidence success", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const result = await createVerifiedIngestWorkflow(
      workflowFile(),
      await workflowOptions(calls)
    ).start();
    expect(result.status).toBe("evidence_persisted");
    if (result.status === "evidence_persisted" && result.terminal) {
      expect(result.bundle.preservation).toEqual({ status: "not_requested" });
    }
  });

  it("persists pending revision 1 before handoff and final revision 2 after success", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const sink = new MemoryWorkflowEvidenceSink();
    const observed: string[] = [];
    const options = await workflowOptions(calls, sink);
    options.preservation = {
      category: "fixture-preservation",
      async handoff({ evidence }) {
        observed.push(`handoff-after-${sink.calls.length}-writes-${evidence.preservation.status}`);
        return { status: "preserved", profile: "bagit-1.0-sha256", reference: "safe-handoff" };
      }
    };

    const result = await createVerifiedIngestWorkflow(workflowFile(), options).start();
    expect(result.status).toBe("preserved");
    expect(observed).toEqual(["handoff-after-1-writes-pending"]);
    expect(sink.calls.map((call) => call.revision)).toEqual([1, 2]);
    expect(sink.calls[0]?.bundle.preservation.status).toBe("pending");
    expect(sink.calls[1]?.bundle.preservation.status).toBe("preserved");
    expect(sink.calls[1]?.bundle.id).toBe(sink.calls[0]?.bundle.id);
    expect(sink.calls[1]?.bundle.provenance.persistence.operationId)
      .toBe(sink.calls[0]?.bundle.provenance.persistence.operationId);
    expect(sink.calls[1]?.bundle.stages.find(({ stage }) => stage === "evidence_finalization")?.operationId)
      .toBe(sink.calls[1]?.operationId);
  });

  it("retries a transient handoff failure without replacing revision 1", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const sink = new MemoryWorkflowEvidenceSink();
    let handoffs = 0;
    const operationIds: string[] = [];
    const options = await workflowOptions(calls, sink);
    options.preservation = {
      category: "fixture-preservation",
      async handoff({ operationId }) {
        handoffs += 1;
        operationIds.push(operationId);
        return handoffs === 1
          ? { status: "failed", issueCodes: ["preservation.temporary"], retryable: true }
          : { status: "preserved", reference: "safe-handoff" };
      }
    };
    const workflow = createVerifiedIngestWorkflow(workflowFile(), options);

    const failed = await workflow.start();
    expect(failed.status).toBe("preservation_failed");
    expect(sink.calls.map((call) => call.revision)).toEqual([1]);
    const completed = await workflow.retry();
    expect(completed.status).toBe("preserved");
    expect(operationIds).toEqual([operationIds[0], operationIds[0]]);
    expect(sink.calls.map((call) => call.revision)).toEqual([1, 2]);
  });

  it("records a permanent handoff failure in immutable revision 2", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const sink = new MemoryWorkflowEvidenceSink();
    const options = await workflowOptions(calls, sink);
    options.preservation = {
      category: "fixture-preservation",
      async handoff() {
        return { status: "failed", issueCodes: ["preservation.blocked"], retryable: false };
      }
    };
    const result = await createVerifiedIngestWorkflow(workflowFile(), options).start();

    expect(result.status).toBe("preservation_failed");
    expect(result).toMatchObject({ retryability: "terminal", lastAuthoritativeState: "evidence_persisted" });
    expect(sink.calls.map((call) => call.bundle.preservation.status)).toEqual(["pending", "failed"]);
  });

  it("reconciles ambiguous handoff and never repeats preservation during finalization retry", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const delegate = new MemoryWorkflowEvidenceSink();
    let handoffs = 0;
    let failFinalization = true;
    const finalizationAttempts: IngestEvidenceBundleV1[] = [];
    const sink: WorkflowEvidenceSink = {
      get: delegate.get.bind(delegate),
      async persist(input) {
        if (input.revision === 2 && failFinalization) {
          finalizationAttempts.push(structuredClone(input.bundle));
          failFinalization = false;
          throw new Error("finalization unavailable");
        }
        if (input.revision === 2) finalizationAttempts.push(structuredClone(input.bundle));
        return delegate.persist(input);
      },
      async reconcile(input) {
        return delegate.reconcile(input);
      }
    };
    const options = await workflowOptions(calls, sink);
    const preservation: PreservationHandoffAdapter = {
      category: "fixture-preservation",
      async handoff() {
        handoffs += 1;
        throw new Error("handoff acknowledgement lost");
      },
      async reconcile() {
        return { status: "preserved", reference: "safe-handoff" };
      }
    };
    options.preservation = preservation;
    const workflow = createVerifiedIngestWorkflow(workflowFile(), options);

    const failed = await workflow.start();
    expect(failed.status).toBe("evidence_finalization_failed");
    const completed = await workflow.retry();
    expect(completed.status).toBe("preserved");
    expect(handoffs).toBe(1);
    expect(delegate.calls.map((call) => call.revision)).toEqual([1, 2]);
    expect(finalizationAttempts.map(({ integrity }) => integrity.value)).toEqual([
      finalizationAttempts[0]?.integrity.value,
      finalizationAttempts[0]?.integrity.value
    ]);
  });
});
