import { describe, expect, it } from "vitest";
import {
  TRANSPORT_CONFORMANCE_CATALOG,
  TRANSPORT_CONFORMANCE_CATALOG_VERSION,
  TRANSPORT_CONFORMANCE_REPORT_VERSION,
  evaluateTransportCapabilityEvidence,
  runTransportConformance,
  validateTransportConformanceReport
} from "../src/conformance.js";
import {
  createPassingObservation,
  createPassingTarget,
  fullCapabilities,
  representativeProfile
} from "./conformance-fixtures.js";

describe("transport conformance", () => {
  it("publishes one immutable ordered v1 catalog with unique stable scenarios", () => {
    expect(TRANSPORT_CONFORMANCE_CATALOG.schemaVersion).toBe(
      "large-image-ingest.transport-conformance-catalog.v1"
    );
    expect(TRANSPORT_CONFORMANCE_CATALOG_VERSION).toBe(
      "large-image-ingest.transport-conformance-catalog.v1"
    );
    expect(TRANSPORT_CONFORMANCE_REPORT_VERSION).toBe(
      "large-image-ingest.transport-conformance-report.v1"
    );
    expect(TRANSPORT_CONFORMANCE_CATALOG.scenarios.map(({ id }) => id)).toEqual([
      "source.validation-before-mutation",
      "source.mismatch-before-mutation",
      "recovery.interrupted-no-retransmit",
      "recovery.invalid-evidence-rejected",
      "recovery.session-reconciliation",
      "completion.stored-original-verified",
      "completion.ambiguous-result-reconciled",
      "cancellation.abandoned-session-reported",
      "cleanup.failure-after-completion-isolated",
      "integrity.chunk-evidence-enforced"
    ]);
    expect(new Set(TRANSPORT_CONFORMANCE_CATALOG.scenarios.map(({ id }) => id)).size).toBe(10);
    expect(Object.isFrozen(TRANSPORT_CONFORMANCE_CATALOG)).toBe(true);
    expect(Object.isFrozen(TRANSPORT_CONFORMANCE_CATALOG.scenarios)).toBe(true);
  });

  it("derives a conformant report only from passing structured observations", async () => {
    const report = await runTransportConformance(createPassingTarget(), {
      reportId: "report-1",
      now: () => new Date("2026-08-31T00:00:00.000Z")
    });

    expect(report.overallStatus).toBe("conformant");
    expect(report.issues).toEqual([]);
    expect(report.results).toHaveLength(10);
    expect(report.results.every(({ status }) => status === "passed")).toBe(true);
    expect(report.libraryVersion).toBe("1.6.0");
    expect(validateTransportConformanceReport(report)).toEqual({ ok: true, issues: [], report });
  });

  it("marks legitimately inapplicable chunk integrity unsupported", async () => {
    const capabilities = { ...fullCapabilities, chunkIntegrity: false };
    const report = await runTransportConformance(createPassingTarget({ capabilities }), {
      reportId: "report-no-chunk-integrity"
    });

    expect(report.results.at(-1)).toMatchObject({
      scenarioId: "integrity.chunk-evidence-enforced",
      status: "unsupported"
    });
    expect(report.overallStatus).toBe("conformant");
  });

  it("owns pass/fail authority and rejects an invariant violation", async () => {
    const target = createPassingTarget({
      async runScenario({ scenario }) {
        const observation = createPassingObservation(scenario);
        return scenario.id === "recovery.interrupted-no-retransmit"
          ? { ...observation, retransmittedAcknowledgedBytes: 1 }
          : observation;
      }
    });
    const report = await runTransportConformance(target, { reportId: "report-failed" });

    expect(report.overallStatus).toBe("non_conformant");
    expect(report.results.find(({ scenarioId }) => scenarioId === "recovery.interrupted-no-retransmit"))
      .toMatchObject({ status: "failed", diagnosticCategory: "conformance.invariant_failed" });
  });

  it("maps a safe skip to an incomplete report", async () => {
    const target = createPassingTarget({
      async runScenario({ scenario }) {
        if (scenario.id === "completion.stored-original-verified") {
          return {
            status: "skipped",
            diagnosticCategory: "conformance.scenario_skipped",
            limitationCodes: ["fixture-unavailable"]
          };
        }
        return createPassingObservation(scenario);
      }
    });
    const report = await runTransportConformance(target, { reportId: "report-skipped" });

    expect(report.overallStatus).toBe("incomplete");
    expect(report.results.find(({ scenarioId }) => scenarioId === "completion.stored-original-verified"))
      .toMatchObject({ status: "skipped", diagnosticCategory: "conformance.scenario_skipped" });
  });

  it("does not copy thrown provider secrets into results or reports", async () => {
    const target = createPassingTarget({
      async runScenario({ scenario }) {
        if (scenario.id === "source.validation-before-mutation") {
          throw new Error("https://secret.invalid/presigned?token=credential object-key=/private/customer");
        }
        return createPassingObservation(scenario);
      }
    });
    const report = await runTransportConformance(target, { reportId: "report-secret" });
    const serialized = JSON.stringify(report);

    expect(report.overallStatus).toBe("non_conformant");
    expect(serialized).not.toContain("secret.invalid");
    expect(serialized).not.toContain("token=credential");
    expect(serialized).not.toContain("object-key");
    expect(serialized).not.toContain("/private/customer");
    expect(serialized).toContain("conformance.execution_failed");
  });

  it("does not copy secret-shaped observation fields or invalid diagnostics", async () => {
    const sensitiveValues = [
      "https://upload.invalid/item?credential=value",
      "/private/customer/original.tif",
      "object-key-customer-42",
      "sha256-deadbeef",
      "raw-receipt-etag"
    ];
    const target = createPassingTarget({
      async runScenario({ scenario }) {
        if (scenario.id === "source.validation-before-mutation") {
          return {
            ...createPassingObservation(scenario),
            providerPayload: {
              endpoint: sensitiveValues[0],
              path: sensitiveValues[1],
              objectKey: sensitiveValues[2],
              checksum: sensitiveValues[3],
              receipt: sensitiveValues[4]
            }
          } as ReturnType<typeof createPassingObservation>;
        }
        if (scenario.id === "completion.stored-original-verified") {
          return {
            status: "skipped",
            diagnosticCategory: sensitiveValues[0]
          };
        }
        return createPassingObservation(scenario);
      }
    });
    const report = await runTransportConformance(target, { reportId: "safe-observation-boundary" });
    const serialized = JSON.stringify(report);

    expect(report.overallStatus).toBe("non_conformant");
    for (const sensitive of sensitiveValues) expect(serialized).not.toContain(sensitive);
  });

  it("rejects positive capabilities without passing behavioral evidence", () => {
    const issues = evaluateTransportCapabilityEvidence(
      { ...fullCapabilities, parallelChunks: true },
      []
    );

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "conformance.capability_unproven",
        capability: "parallelChunks"
      })
    ]));
  });

  it("rejects malformed target and untrusted report shapes without echoing values", async () => {
    await expect(runTransportConformance(createPassingTarget({
      profile: { ...representativeProfile, profileId: "https://secret.invalid/path" }
    }))).rejects.toMatchObject({ code: "conformance.target_invalid" });

    const invalid = validateTransportConformanceReport({
      schemaVersion: TRANSPORT_CONFORMANCE_REPORT_VERSION,
      providerSecret: "credential"
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.issues.every((issue) => !JSON.stringify(issue).includes("credential"))).toBe(true);
    }
  });

  it("rejects missing, oversized, and extra untrusted report content", async () => {
    const report = await runTransportConformance(createPassingTarget(), {
      reportId: "bounded-report"
    });
    const missing = JSON.parse(JSON.stringify(report));
    missing.results.pop();
    expect(validateTransportConformanceReport(missing).ok).toBe(false);

    const oversized = JSON.parse(JSON.stringify(report));
    oversized.limitations = Array.from({ length: 65 }, (_, index) => `limit-${index}`);
    expect(validateTransportConformanceReport(oversized).ok).toBe(false);

    const extra = JSON.parse(JSON.stringify(report));
    extra.providerPayload = { credential: "not-allowed" };
    const validation = validateTransportConformanceReport(extra);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(JSON.stringify(validation.issues)).not.toContain("not-allowed");
    }
  });

  it("maps a pre-aborted run to explicit non-passing results", async () => {
    const controller = new AbortController();
    controller.abort();
    const report = await runTransportConformance(createPassingTarget(), {
      reportId: "canceled-run",
      signal: controller.signal
    });

    expect(report.results.every(({ status }) => status === "skipped")).toBe(true);
    expect(report.overallStatus).not.toBe("conformant");
  });
});
