import { describe, expect, it } from "vitest";
import { createVerifiedIngestController } from "../src/react.js";
import { createVerifiedIngestWorkflow } from "../src/workflow.js";
import { workflowFile, workflowOptions } from "./workflow-fixtures.js";

describe("verified ingest React controller", () => {
  it("projects workflow authority and actions without owning another state machine", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const workflow = createVerifiedIngestWorkflow(workflowFile(), await workflowOptions(calls));
    const controller = createVerifiedIngestController(workflow);
    const statuses: string[] = [];
    controller.subscribe(() => statuses.push(controller.getState().status));

    const result = await controller.start();
    expect(result.status).toBe("evidence_persisted");
    expect(controller.getState()).toEqual(workflow.getState());
    expect(statuses).toContain("uploaded_unverified");
    expect(statuses).toContain("verified");
    expect(statuses.at(-1)).toBe("evidence_persisted");
  });

  it("coalesces concurrent operations at workflow authority and isolates subscribers", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const workflow = createVerifiedIngestWorkflow(workflowFile(), await workflowOptions(calls));
    const controller = createVerifiedIngestController(workflow);
    let safeSubscriberCalls = 0;
    controller.subscribe(() => { throw new Error("subscriber secret"); });
    controller.subscribe(() => { safeSubscriberCalls += 1; });

    const first = controller.start();
    const second = controller.start();
    expect(second).toBe(first);
    await first;
    expect(safeSubscriberCalls).toBeGreaterThan(0);
    expect(controller.getState().status).toBe("evidence_persisted");
    controller.dispose();
  });
});
