import { describe, expect, it } from "vitest";
import { createVerifiedIngestWorkflow, validateIngestEvidenceBundle } from "../src/workflow.js";
import {
  MemoryWorkflowEvidenceSink,
  workflowFile,
  workflowOptions
} from "./workflow-fixtures.js";

describe("verified workflow happy path", () => {
  it("completes one source through durable evidence in authority order", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const evidenceSink = new MemoryWorkflowEvidenceSink();
    const options = await workflowOptions(calls, evidenceSink);
    const statuses: string[] = [];
    options.onEvent = (event) => {
      if (event.type === "workflow:state") statuses.push(event.summary.status);
    };
    const result = await createVerifiedIngestWorkflow(workflowFile(), options).start();

    expect(result.status).toBe("evidence_persisted");
    expect(calls).toMatchObject({ create: 1, upload: 1, complete: 1, verify: 1 });
    expect(statuses).toEqual(expect.arrayContaining([
      "prepared", "uploading", "uploaded_unverified", "verifying", "verified",
      "persisting_evidence", "evidence_persisted"
    ]));
    expect(statuses.indexOf("uploaded_unverified")).toBeLessThan(statuses.indexOf("verified"));
    expect(evidenceSink.calls).toHaveLength(1);
    if (result.status !== "evidence_persisted" || result.terminal !== true) throw new Error("unexpected result");
    await expect(validateIngestEvidenceBundle(result.bundle)).resolves.toMatchObject({ ok: true });
  });
});
