import { describe, expect, it } from "vitest";
import { createVerifiedIngestWorkflow } from "../src/workflow.js";
import { workflowFile, workflowOptions } from "./workflow-fixtures.js";

describe("verified workflow original preservation", () => {
  it("passes the exact source object to the authoritative core session", async () => {
    const file = workflowFile();
    const calls = { create: 0, upload: 0, complete: 0, verify: 0, source: undefined as typeof file | undefined };
    const result = await createVerifiedIngestWorkflow(file, await workflowOptions(calls)).start();
    expect(result.status).toBe("evidence_persisted");
    expect(calls.source).toBe(file);
  });
});
