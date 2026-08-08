import { describe, expect, it } from "vitest";
import {
  INDUSTRIAL_INSPECTION_PROFILE_V1,
  SEMICONDUCTOR_WAFER_PROFILE_V1,
  compileInspectionMetadataProfile,
  validateInspectionMetadata
} from "../src/inspection-profile";

describe("inspection metadata profiles", () => {
  it("validates built-in semiconductor and industrial metadata without mutation", () => {
    const semiconductor = {
      lotId: "LOT-001",
      waferId: "W12",
      inspectionId: "INS-42",
      toolId: "AOI-7",
      privateNote: "unchanged"
    };
    const before = structuredClone(semiconductor);
    expect(validateInspectionMetadata(semiconductor, SEMICONDUCTOR_WAFER_PROFILE_V1))
      .toMatchObject({ ok: true, issues: [] });
    expect(semiconductor).toEqual(before);
    expect(Object.isFrozen(SEMICONDUCTOR_WAFER_PROFILE_V1)).toBe(true);

    expect(validateInspectionMetadata({
      inspectionId: "INS-1",
      assetId: "ASSET-9",
      capturedAt: "2026-08-07T00:00:00.000Z"
    }, INDUSTRIAL_INSPECTION_PROFILE_V1)).toMatchObject({ ok: true });
  });

  it("returns deterministic field-only issues without rejected values", () => {
    const metadata = {
      lotId: "secret value with spaces",
      waferId: 12,
      inspectionId: "",
      toolId: "A".repeat(200)
    };
    const first = validateInspectionMetadata(metadata, SEMICONDUCTOR_WAFER_PROFILE_V1);
    const second = validateInspectionMetadata(metadata, SEMICONDUCTOR_WAFER_PROFILE_V1);
    expect(first).toEqual(second);
    expect(first.ok).toBe(false);
    expect(first.issues.map((issue) => issue.path)).toEqual([...first.issues]
      .map((issue) => issue.path).sort());
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain("secret value");
    expect(serialized).not.toContain("A".repeat(100));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.issues)).toBe(true);
  });

  it("compiles custom scalar constraints and rejects invalid definitions", () => {
    const profile = compileInspectionMetadataProfile({
      schemaVersion: "large-image-ingest.inspection-profile.v1",
      id: "custom",
      version: "1",
      fields: [
        { key: "score", type: "number", minimum: 0, maximum: 1 },
        { key: "decision", type: "string", required: true, enum: ["pass", "fail"] },
        { key: "count", type: "integer", minimum: 0 }
      ]
    });
    expect(validateInspectionMetadata({ score: 2, decision: "maybe", count: 1.5 }, profile)
      .issues.map((issue) => issue.code)).toEqual([
      "profile.field_type",
      "profile.field_enum",
      "profile.field_max_value"
    ]);

    for (const fields of [
      [{ key: "x", type: "string" }, { key: "x", type: "string" }],
      [{ key: "x", type: "string", pattern: ".*" }],
      [{ key: "x", type: "string", pattern: "^(a+)+$" }],
      [{ key: "x", type: "number", minLength: 1 }],
      [{ key: "x", type: "number", minimum: 2, maximum: 1 }],
      [{ key: "x", type: "boolean", enum: [true, "true"] }]
    ]) {
      expect(() => compileInspectionMetadataProfile({
        schemaVersion: "large-image-ingest.inspection-profile.v1",
        id: "invalid",
        version: "1",
        fields
      })).toThrow(expect.objectContaining({ code: "profile.invalid" }));
    }
  });
});
