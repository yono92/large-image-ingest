import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const protocol = require("../benchmarks/adoption/protocol.cjs") as {
  inspectSafeValue(value: unknown): { safe: boolean };
  validateReport(report: any): { ok: boolean; errors: string[] };
};
const report = JSON.parse(readFileSync(new URL("../benchmarks/results/2026-08-adoption-evidence.json", import.meta.url), "utf8"));

describe("adoption evidence disclosure and claim policy", () => {
  it("rejects secret URLs and local filesystem roots", () => {
    expect(protocol.inspectSafeValue({ message: "https://host.invalid/a?token=customer-secret" }).safe).toBe(false);
    expect(protocol.inspectSafeValue({ path: "/Users/example/private/file.tif" }).safe).toBe(false);
  });

  it("rejects prohibited extrapolation in claims", () => {
    const changed = structuredClone(report);
    changed.claims[0].text = "This proves lower failure probability.";
    const result = protocol.validateReport(changed);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.startsWith("claim.prohibited:"))).toBe(true);
  });

  it("rejects claim links that do not resolve to report evidence", () => {
    const changed = structuredClone(report);
    changed.claims[0].reportField = "aggregates.missing[0]";
    const result = protocol.validateReport(changed);
    expect(result.errors.some((error) => error.startsWith("claim.field_missing:"))).toBe(true);
  });

  it("publishes only safe aggregate and trial values", () => {
    expect(protocol.inspectSafeValue(report).safe).toBe(true);
  });

  it("rejects unsafe values anywhere in retained trials", () => {
    const changed = structuredClone(report);
    changed.candidates[0].scenarios[0].trials[0].limitationCodes = ["https://host.invalid/x?token=customer-secret"];
    const result = protocol.validateReport(changed);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("unsafe"))).toBe(true);
  });
});
