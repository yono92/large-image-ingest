import { describe, expect, it } from "vitest";
import {
  validateIngestEvidenceBundle,
  type IngestEvidenceBundleV1
} from "../src/workflow.js";
import {
  MemoryWorkflowEvidenceSink,
  workflowFile,
  workflowOptions
} from "./workflow-fixtures.js";
import { createVerifiedIngestWorkflow } from "../src/workflow.js";

async function completedEvidence() {
  const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
  const sink = new MemoryWorkflowEvidenceSink();
  const result = await createVerifiedIngestWorkflow(
    workflowFile(),
    await workflowOptions(calls, sink)
  ).start();
  if (result.status !== "evidence_persisted" || result.terminal !== true) {
    throw new Error("expected terminal evidence");
  }
  const persisted = sink.values.get(`${result.bundle.id}:1`);
  if (!persisted) throw new Error("missing persisted evidence");
  return { result, persisted };
}

function mutable(bundle: IngestEvidenceBundleV1): Record<string, any> {
  return structuredClone(bundle) as unknown as Record<string, any>;
}

describe("evidence bundle v1", () => {
  it("validates the exact schema and its manifest/provenance references", async () => {
    const { result, persisted } = await completedEvidence();

    await expect(validateIngestEvidenceBundle(result.bundle, {
      provenance: persisted.provenance
    })).resolves.toMatchObject({ ok: true, integrity: "valid", actorTrust: "unsigned" });
    expect(Object.keys(result.bundle).sort()).toEqual([
      "correlationId", "createdAt", "id", "integrity", "library", "policy",
      "preservation", "provenance", "revision", "schemaVersion", "stages",
      "subject", "terminal", "transfer", "trust", "verification", "workflowId"
    ]);
    expect(result.bundle.verification).toMatchObject({
      status: "verified",
      verifierCategory: "stored-original",
      issueCodes: [],
      verifiedAt: "2026-09-07T00:00:00.000Z"
    });
    expect(result.bundle.transfer.completedAt).toBe(
      persisted.provenance.entries.find(({ type }) => type === "completion")?.occurredAt
    );
    expect(result.bundle.stages.every(({ operationId, issueCodes }) =>
      operationId.length > 0 && issueCodes.length === 0
    )).toBe(true);
  });

  it.each([
    ["unknown top-level field", (value: Record<string, any>) => { value.unknown = true; }],
    ["source identity", (value: Record<string, any>) => { value.subject.sourceIdentity.value = "0".repeat(64); }],
    ["manifest identity", (value: Record<string, any>) => { value.subject.manifest.id = "manifest-mutated"; }],
    ["profile identity", (value: Record<string, any>) => { value.policy.profile.name = "mutated-profile"; }],
    ["provenance identity", (value: Record<string, any>) => { value.provenance.id = "provenance-mutated"; }],
    ["terminal consistency", (value: Record<string, any>) => { value.terminal.state = "preserved"; }],
    ["stage order", (value: Record<string, any>) => { value.stages.reverse(); }],
    ["stage duplication", (value: Record<string, any>) => { value.stages[1].stage = "upload"; }],
    ["stage operation identity", (value: Record<string, any>) => { value.stages[1].operationId = "unsafe/value"; }],
    ["stage issue codes", (value: Record<string, any>) => { value.stages[1].issueCodes = ["unsafe value"]; }]
  ])("rejects a %s mutation", async (_name, mutate) => {
    const { result } = await completedEvidence();
    const changed = mutable(result.bundle);
    mutate(changed);

    const validation = await validateIngestEvidenceBundle(changed);
    expect(validation.ok).toBe(false);
    expect(validation.integrity).toBe("invalid");
  });

  it("detects explicit cross-artifact mismatches", async () => {
    const { result, persisted } = await completedEvidence();
    const wrongProvenance = structuredClone(persisted.provenance);
    wrongProvenance.id = "different-provenance";

    const validation = await validateIngestEvidenceBundle(result.bundle, {
      provenance: wrongProvenance
    });
    expect(validation).toMatchObject({ ok: false });
    expect(validation.issues).toContain("workflow.evidence_bundle_invalid");
  });
});
