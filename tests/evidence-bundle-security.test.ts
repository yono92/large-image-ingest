import { describe, expect, it } from "vitest";
import {
  createSafeWorkflowSummary,
  createVerifiedIngestWorkflow,
  exportIngestEvidenceBundle,
  validateIngestEvidenceBundle
} from "../src/workflow.js";
import { forbiddenWorkflowValues } from "./fixtures/workflow-evidence.js";
import { workflowFile, workflowOptions } from "./workflow-fixtures.js";

describe("evidence bundle disclosure", () => {
  it("keeps the default summary bounded and omits restricted evidence", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const result = await createVerifiedIngestWorkflow(
      workflowFile(),
      await workflowOptions(calls)
    ).start();
    if (result.status !== "evidence_persisted" || result.terminal !== true) {
      throw new Error("expected terminal evidence");
    }

    const summary = await createSafeWorkflowSummary(result.bundle);
    expect(Object.keys(summary).sort()).toEqual([
      "evidenceRevision", "preservationStatus", "schemaVersion", "status",
      "terminal", "verificationStatus", "workflowId"
    ]);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain(result.bundle.subject.sourceIdentity.value);
    expect(serialized).not.toContain(result.bundle.provenance.persistence.operationId);
    for (const forbidden of Object.values(forbiddenWorkflowValues)) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("requires an explicit supported disclosure profile for full export", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const result = await createVerifiedIngestWorkflow(
      workflowFile(),
      await workflowOptions(calls)
    ).start();
    if (result.status !== "evidence_persisted" || result.terminal !== true) {
      throw new Error("expected terminal evidence");
    }

    const exported = await exportIngestEvidenceBundle(result.bundle, { disclosureProfile: "audit" });
    expect(exported).toEqual(result.bundle);
    expect(exported).not.toBe(result.bundle);
    await expect(exportIngestEvidenceBundle(result.bundle, {
      disclosureProfile: "unsupported" as "audit"
    })).rejects.toThrow("Unsupported evidence disclosure profile");
  });

  it("rejects unsupported versions without echoing rejected content", async () => {
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const result = await createVerifiedIngestWorkflow(
      workflowFile(),
      await workflowOptions(calls)
    ).start();
    if (result.status !== "evidence_persisted" || result.terminal !== true) {
      throw new Error("expected terminal evidence");
    }
    const unsupported = structuredClone(result.bundle) as any;
    unsupported.schemaVersion = forbiddenWorkflowValues.presignedUrl;

    const validation = await validateIngestEvidenceBundle(unsupported);
    expect(validation).toEqual({
      ok: false,
      issues: ["workflow.evidence_bundle_version_unsupported"],
      integrity: "invalid",
      actorTrust: "unknown"
    });
    expect(JSON.stringify(validation)).not.toContain(forbiddenWorkflowValues.presignedUrl);
  });
});
