import { describe, expect, it } from "vitest";
import { createVerifiedIngestWorkflow } from "../src/workflow.js";
import { forbiddenWorkflowValues } from "./fixtures/workflow-evidence.js";
import { workflowFile, workflowOptions } from "./workflow-fixtures.js";

describe("workflow safe diagnostics and observer isolation", () => {
  it("does not expose seeded restricted values and ignores observer exceptions", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const observerFailures: string[] = [];
    const options = await workflowOptions(calls);
    const workflow = createVerifiedIngestWorkflow(workflowFile(), {
      ...options,
      session: {
        ...options.session,
        metadata: { ...options.session.metadata, customer: forbiddenWorkflowValues.customerMetadata }
      },
      onEvent() {
        throw new Error(forbiddenWorkflowValues.rawProviderError);
      },
      onObserverError({ observer }) {
        observerFailures.push(observer);
      }
    });
    workflow.subscribe(() => {
      throw new Error(forbiddenWorkflowValues.credential);
    });
    const result = await workflow.start();
    const summary = JSON.stringify(await import("../src/workflow.js").then(({ createSafeWorkflowStateSummary }) =>
      createSafeWorkflowStateSummary(workflow.getState())
    ));

    expect(result.status).toBe("evidence_persisted");
    expect(observerFailures).toContain("event");
    expect(observerFailures).toContain("subscriber");
    expect(calls).toMatchObject({ create: 1, complete: 1, verify: 1 });
    for (const secret of Object.values(forbiddenWorkflowValues)) expect(summary).not.toContain(secret);
  });
});
