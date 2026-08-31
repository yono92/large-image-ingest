import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const protocol = require("../benchmarks/adoption/protocol.cjs") as {
  computeCoverage(candidates: unknown[]): unknown;
  validateReport(report: unknown, options?: { currentInputsDigest?: string }): { ok: boolean; errors: string[] };
};
const report = JSON.parse(readFileSync(new URL("../benchmarks/results/2026-08-adoption-evidence.json", import.meta.url), "utf8"));

describe("retained adoption evidence report", () => {
  it("is complete, current, and independently recomputable", () => {
    expect(protocol.validateReport(report)).toMatchObject({ ok: true, errors: [] });
    expect(report.candidates).toHaveLength(3);
    expect(report.candidates.flatMap((candidate: any) => candidate.scenarios)).toHaveLength(42);
    expect(report.candidates.flatMap((candidate: any) => candidate.scenarios.flatMap((scenario: any) => scenario.trials))).toHaveLength(150);
    expect(protocol.computeCoverage(report.candidates)).toEqual(report.aggregates.observedSafeScenarioCoverage);
  });

  it("marks changed inputs stale instead of accepting a current label", () => {
    const result = protocol.validateReport(report, { currentInputsDigest: "0".repeat(64) });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("report.stale_label_invalid");

    const changedCandidate = structuredClone(report);
    changedCandidate.candidates[0].revision.value = "f".repeat(64);
    const candidateResult = protocol.validateReport(changedCandidate);
    expect(candidateResult.errors).toContain("report.stale_label_invalid");
  });

  it("rejects missing trials and aggregate changes", () => {
    const missing = structuredClone(report);
    missing.candidates[0].scenarios[0].trials.pop();
    expect(protocol.validateReport(missing).errors.some((error) => error.startsWith("scenario.trial_count:"))).toBe(true);

    const changedAggregate = structuredClone(report);
    changedAggregate.aggregates.observedSafeScenarioCoverage.numerator -= 1;
    expect(protocol.validateReport(changedAggregate).errors).toContain("aggregate.coverage_mismatch");

    const changedReduction = structuredClone(report);
    changedReduction.aggregates.responsibilityReductions[0].numeratorRemoved -= 1;
    expect(protocol.validateReport(changedReduction).errors).toContain("aggregate.responsibilityReductions_mismatch");
  });

  it("allows only explicit unsupported exclusions without simulated trials", () => {
    const explicit = structuredClone(report);
    const scenario = explicit.candidates[0].scenarios[0];
    scenario.status = "unsupported";
    scenario.trials = [];
    scenario.limitationCodes = ["capability.not_applicable"];
    explicit.aggregates.observedSafeScenarioCoverage = protocol.computeCoverage(explicit.candidates);
    expect(protocol.validateReport(explicit).ok).toBe(true);

    const simulated = structuredClone(report);
    simulated.candidates[0].scenarios[0].status = "unsupported";
    simulated.candidates[0].scenarios[0].limitationCodes = ["capability.not_applicable"];
    simulated.aggregates.observedSafeScenarioCoverage = protocol.computeCoverage(simulated.candidates);
    expect(protocol.validateReport(simulated).errors.some((error) => error.startsWith("scenario.unsupported_has_trials:"))).toBe(true);
  });

  it("retains line-count regressions alongside responsibility reductions", () => {
    expect(report.aggregates.implementationLineChanges.every((entry: any) => entry.percentage < 0)).toBe(true);
    expect(report.aggregates.responsibilityReductions.every((entry: any) => entry.percentage === 85.71)).toBe(true);
  });
});
