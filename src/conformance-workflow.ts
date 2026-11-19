// Part of conformance.ts, split out to keep modules under 500 lines; public exports stay on conformance.ts.
import { PACKAGE_VERSION } from "./package-version.js";
import { TransportConformanceError } from "./conformance.js";
import { WORKFLOW_CONFORMANCE_CATALOG_VERSION, WORKFLOW_CONFORMANCE_REPORT_VERSION, WORKFLOW_SCENARIOS, isSafeSlug } from "./conformance-workflow-catalog.js";
import type { WorkflowConformanceObservation, WorkflowConformanceReportV1, WorkflowConformanceScenario, WorkflowConformanceScenarioId, WorkflowConformanceScenarioResult, WorkflowConformanceTarget } from "./conformance-workflow-catalog.js";

/** @experimental */
export async function runWorkflowConformance(
  target: WorkflowConformanceTarget,
  options: { signal?: AbortSignal } = {}
): Promise<WorkflowConformanceReportV1> {
  if (!isSafeSlug(target.targetId) ||
      (target.targetClass !== "credential-free-representative" &&
        target.targetClass !== "real-deployment") ||
      typeof target.runScenario !== "function") {
    throw new TransportConformanceError("conformance.target_invalid");
  }
  const controller = new AbortController();
  const signal = options.signal ?? controller.signal;
  const results: WorkflowConformanceScenarioResult[] = [];
  for (const scenario of WORKFLOW_SCENARIOS) {
    if (signal.aborted) {
      results.push({ scenarioId: scenario.id, status: "skipped", issueCodes: [] });
      continue;
    }
    try {
      const observation = await target.runScenario({ scenario, signal });
      const passed = scenario.requiredObservations.every((field) =>
        expectedWorkflowObservation(field, observation[field])
      );
      results.push({
        scenarioId: scenario.id,
        status: passed ? "passed" : "failed",
        issueCodes: passed ? [] : ["workflow-conformance.invariant-failed"]
      });
    } catch {
      results.push({
        scenarioId: scenario.id,
        status: "failed",
        issueCodes: ["workflow-conformance.execution-failed"]
      });
    }
  }
  return Object.freeze({
    schemaVersion: WORKFLOW_CONFORMANCE_REPORT_VERSION,
    catalogVersion: WORKFLOW_CONFORMANCE_CATALOG_VERSION,
    libraryVersion: PACKAGE_VERSION,
    targetId: target.targetId,
    targetClass: target.targetClass,
    results: Object.freeze(results),
    status: results.some(({ status }) => status === "failed")
      ? "non_conformant"
      : results.some(({ status }) => status === "skipped") ? "incomplete" : "conformant"
  });
}

export function workflowScenario(
  id: WorkflowConformanceScenarioId,
  requiredObservations: readonly (keyof WorkflowConformanceObservation)[]
): WorkflowConformanceScenario {
  return Object.freeze({ id, requiredObservations: Object.freeze(requiredObservations) });
}

function expectedWorkflowObservation(
  field: keyof WorkflowConformanceObservation,
  value: boolean | undefined
): boolean {
  if (field === "uploadRepeated" || field === "handoffRepeatedDuringFinalization") return value === false;
  return value === true;
}
