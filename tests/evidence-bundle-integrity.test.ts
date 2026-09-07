import { describe, expect, it } from "vitest";
import {
  createVerifiedIngestWorkflow,
  validateIngestEvidenceBundle
} from "../src/workflow.js";
import { workflowFile, workflowOptions } from "./workflow-fixtures.js";

describe("evidence integrity and trust", () => {
  it("reports a valid self-hash without claiming an actor or trusted time", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const result = await createVerifiedIngestWorkflow(
      workflowFile(),
      await workflowOptions(calls)
    ).start();
    if (result.status !== "evidence_persisted" || result.terminal !== true) {
      throw new Error("expected terminal evidence");
    }

    const validation = await validateIngestEvidenceBundle(result.bundle);
    expect(validation).toMatchObject({ ok: true, integrity: "valid", actorTrust: "unsigned" });
    expect(result.bundle.trust).toEqual({
      integrity: "self_hashed",
      actorTrust: "unsigned",
      timeTrust: "untrusted"
    });
    expect(JSON.stringify(result.bundle)).not.toMatch(/trusted_timestamp|non.?repudiation|regulatory_compliance/i);
  });

  it("treats a changed trust claim as tampering, not as upgraded trust", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const result = await createVerifiedIngestWorkflow(
      workflowFile(),
      await workflowOptions(calls)
    ).start();
    if (result.status !== "evidence_persisted" || result.terminal !== true) {
      throw new Error("expected terminal evidence");
    }
    const changed = structuredClone(result.bundle) as any;
    changed.trust.actorTrust = "externally_attested";
    changed.trust.timeTrust = "externally_attested";

    await expect(validateIngestEvidenceBundle(changed)).resolves.toMatchObject({
      ok: false,
      integrity: "invalid",
      actorTrust: "unknown"
    });
  });
});
