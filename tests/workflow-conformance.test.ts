import { describe, expect, it } from "vitest";
import {
  runWorkflowConformance,
  WORKFLOW_CONFORMANCE_CATALOG,
  WORKFLOW_CONFORMANCE_CATALOG_VERSION,
  WORKFLOW_CONFORMANCE_REPORT_VERSION,
  type WorkflowConformanceObservation,
  type WorkflowConformanceTarget
} from "../src/conformance.js";

function passingTarget(): WorkflowConformanceTarget {
  return {
    targetId: "credential-free-workflow",
    targetClass: "credential-free-representative",
    async runScenario({ scenario }) {
      return Object.fromEntries(scenario.requiredObservations.map((field) => [
        field,
        field === "uploadRepeated" || field === "handoffRepeatedDuringFinalization" ? false : true
      ])) as WorkflowConformanceObservation;
    }
  };
}

describe("workflow conformance catalog", () => {
  it("runs the versioned state, failure, recovery, idempotency, and disclosure catalog", async () => {
    expect(WORKFLOW_CONFORMANCE_CATALOG.schemaVersion).toBe(WORKFLOW_CONFORMANCE_CATALOG_VERSION);
    expect(WORKFLOW_CONFORMANCE_CATALOG.scenarios).toHaveLength(7);
    const report = await runWorkflowConformance(passingTarget());
    expect(report).toMatchObject({
      schemaVersion: WORKFLOW_CONFORMANCE_REPORT_VERSION,
      catalogVersion: WORKFLOW_CONFORMANCE_CATALOG_VERSION,
      targetClass: "credential-free-representative",
      status: "conformant"
    });
    expect(report.results.every(({ status }) => status === "passed")).toBe(true);
  });

  it("fails an invariant without retaining raw target output", async () => {
    const target = passingTarget();
    target.runScenario = async () => ({
      authorityOrderValid: false,
      rawProviderError: "credential-secret"
    } as WorkflowConformanceObservation);
    const report = await runWorkflowConformance(target);
    expect(report.status).toBe("non_conformant");
    expect(JSON.stringify(report)).not.toContain("credential-secret");
  });

  it("distinguishes credential-free representative evidence from real deployment", async () => {
    const target = passingTarget();
    target.targetClass = "real-deployment";
    const report = await runWorkflowConformance(target);
    expect(report.targetClass).toBe("real-deployment");
  });
});
