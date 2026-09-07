import { describe, expect, it } from "vitest";
import { createVerifiedIngestWorkflow } from "../src/workflow.js";
import { workflowFile, workflowOptions } from "./workflow-fixtures.js";

describe("verified workflow authority", () => {
  it("never reports verified before the stored-object verifier succeeds", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const options = await workflowOptions(calls);
    options.verifier.verify = async () => {
      calls.verify += 1;
      return {
        status: "failed",
        checkedAt: "2026-09-07T00:00:00.000Z",
        issueCodes: ["verification.checksum_mismatch"],
        retryable: true
      };
    };
    const result = await createVerifiedIngestWorkflow(workflowFile(), options).start();
    expect(result).toMatchObject({
      status: "verification_failed",
      lastAuthoritativeState: "uploaded_unverified"
    });
    expect(calls).toMatchObject({ create: 1, complete: 1, verify: 1 });
  });

  it("blocks failed profile evaluation before transport mutation", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const options = await workflowOptions(calls);
    options.session.metadata = {};
    const result = await createVerifiedIngestWorkflow(workflowFile(), options).start();
    expect(result.status).toBe("preparation_failed");
    expect(calls).toMatchObject({ create: 0, upload: 0, complete: 0, verify: 0 });
  });
});
