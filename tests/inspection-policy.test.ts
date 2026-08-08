import { describe, expect, it } from "vitest";
import { createCompletionEvidence } from "../src/completion-evidence";
import {
  EVIDENCE_GRADE_INSPECTION_POLICY_V1,
  evaluateInspectionPolicy,
  parseInspectionPolicyPack
} from "../src/inspection-policy";
import { createInspectionReceipts, createPolicyFixture } from "./inspection-fixtures";

describe("inspection policy packs", () => {
  it("passes evidence-grade fixtures only with verified linked completion and required metadata", async () => {
    const { manifest, verified } = await createPolicyFixture();
    const report = evaluateInspectionPolicy({
      manifest,
      completion: verified,
      policy: EVIDENCE_GRADE_INSPECTION_POLICY_V1,
      evaluatedAt: "2026-08-07T00:00:00.000Z"
    });
    expect(report).toMatchObject({ ok: true, issues: [], completionId: verified.id });
    expect(Object.isFrozen(report)).toBe(true);

    const unverified = await createCompletionEvidence({
      manifest,
      transportName: "fake",
      receipts: createInspectionReceipts()
    });
    const failed = evaluateInspectionPolicy({
      manifest,
      completion: unverified,
      policy: EVIDENCE_GRADE_INSPECTION_POLICY_V1
    });
    expect(failed.ok).toBe(false);
    expect(failed.issues.map((issue) => issue.code)).toEqual([
      "policy.completion_unverified",
      "policy.stored_checksum_missing"
    ]);
  });

  it("reports missing metadata, completion, checksum, size, and media policy deterministically", async () => {
    const { manifest } = await createPolicyFixture();
    const changed = structuredClone(manifest);
    changed.metadata = {};
    delete changed.original.checksum;
    const policy = parseInspectionPolicyPack({
      schemaVersion: "large-image-ingest.inspection-policy.v1",
      id: "custom",
      version: "1",
      metadataProfile: EVIDENCE_GRADE_INSPECTION_POLICY_V1.metadataProfile,
      requireWholeFileChecksum: true,
      allowedCompletionStatuses: ["verified"],
      maxSourceBytes: 1,
      allowedMediaTypes: ["image/png"]
    });
    const report = evaluateInspectionPolicy({ manifest: changed, policy });
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.path)).toEqual([...report.issues]
      .map((issue) => issue.path).sort());
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "policy.metadata_invalid",
      "profile.field_missing",
      "policy.checksum_missing",
      "policy.completion_missing",
      "policy.source_too_large",
      "policy.media_type_disallowed"
    ]));
  });

  it("rejects invalid policy packs before evaluation", () => {
    for (const value of [
      {},
      { schemaVersion: "large-image-ingest.inspection-policy.v1", id: "x", version: "1", maxSourceBytes: -1 },
      { schemaVersion: "large-image-ingest.inspection-policy.v1", id: "x", version: "1", allowedCompletionStatuses: ["maybe"] },
      { schemaVersion: "large-image-ingest.inspection-policy.v1", id: "x", version: "1", allowedMediaTypes: [] }
    ]) {
      expect(() => parseInspectionPolicyPack(value))
        .toThrow(expect.objectContaining({ code: "policy.invalid" }));
    }
  });
});
