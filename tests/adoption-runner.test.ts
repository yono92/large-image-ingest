import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { runEvidence } = require("../benchmarks/run-adoption-evidence.cjs") as {
  runEvidence(): Promise<any>;
};

describe("adoption evidence runner", () => {
  it("reproduces frozen metrics and all raw classifications", async () => {
    const first = await runEvidence();
    const second = await runEvidence();
    const stable = (report: any) => report.candidates.map((candidate: any) => ({
      id: candidate.id,
      revision: candidate.revision,
      implementation: candidate.implementation,
      eligibility: candidate.eligibility.status,
      scenarios: candidate.scenarios.map((scenario: any) => ({
        id: scenario.scenarioId,
        status: scenario.status,
        trials: scenario.trials.map((trial: any) => trial.status)
      }))
    }));
    expect(stable(first)).toEqual(stable(second));
    expect(first.candidates.every((candidate: any) => candidate.eligibility.status === "eligible")).toBe(true);
    expect(first.aggregates.observedSafeScenarioCoverage).toMatchObject({ numerator: 42, denominator: 42, percentage: 100 });
  }, 20_000);
});
