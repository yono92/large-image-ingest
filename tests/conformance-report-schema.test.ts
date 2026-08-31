import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TRANSPORT_CONFORMANCE_CATALOG,
  TRANSPORT_CONFORMANCE_REPORT_VERSION,
  runTransportConformance,
  validateTransportConformanceReport
} from "../src/conformance.js";
import { createPassingTarget } from "./conformance-fixtures.js";

describe("transport conformance report schema", () => {
  it("keeps the checked-in JSON schema aligned with runtime constants", async () => {
    const schema = JSON.parse(await readFile(join(
      process.cwd(),
      "specs/014-transport-conformance/contracts/qualification-report.schema.json"
    ), "utf8")) as {
      properties: {
        schemaVersion: { const: string };
        catalogVersion: { const: string };
        results: { minItems: number; maxItems: number };
      };
    };

    expect(schema.properties.schemaVersion.const).toBe(TRANSPORT_CONFORMANCE_REPORT_VERSION);
    expect(schema.properties.catalogVersion.const).toBe(TRANSPORT_CONFORMANCE_CATALOG.schemaVersion);
    expect(schema.properties.results.minItems).toBe(TRANSPORT_CONFORMANCE_CATALOG.scenarios.length);
    expect(schema.properties.results.maxItems).toBe(TRANSPORT_CONFORMANCE_CATALOG.scenarios.length);
  });

  it("round-trips a generated report and rejects duplicate scenario coverage", async () => {
    const report = await runTransportConformance(createPassingTarget(), { reportId: "round-trip" });
    const parsed = JSON.parse(JSON.stringify(report));
    expect(validateTransportConformanceReport(parsed)).toMatchObject({ ok: true });

    parsed.results[1] = parsed.results[0];
    const invalid = validateTransportConformanceReport(parsed);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "conformance.report_invalid", path: "results" })
      ]));
    }
  });

  it("rechecks passed evidence against the capabilities declared by an untrusted report", async () => {
    const report = await runTransportConformance(createPassingTarget(), {
      reportId: "capability-conditioned-report"
    });
    const parsed = JSON.parse(JSON.stringify(report));
    const reconciliation = parsed.results.find(
      ({ scenarioId }: { scenarioId: string }) => scenarioId === "recovery.session-reconciliation"
    );
    reconciliation.evidence.reconciliationOutcomes = reconciliation.evidence.reconciliationOutcomes
      .filter((outcome: string) => outcome !== "expired");

    const invalid = validateTransportConformanceReport(parsed);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.issues).toContainEqual({
        code: "conformance.report_invalid",
        path: "results"
      });
    }
  });

  it("uses the public camel-case capability names in the checked-in schema", async () => {
    const schema = JSON.parse(await readFile(join(
      process.cwd(),
      "specs/014-transport-conformance/contracts/qualification-report.schema.json"
    ), "utf8")) as {
      $defs: { issue: { properties: { capability: { enum: string[] } } } };
    };

    expect(schema.$defs.issue.properties.capability.enum).toEqual([
      "resumable",
      "snapshotResume",
      "persistentResume",
      "abortable",
      "expirationAware",
      "parallelChunks",
      "chunkIntegrity"
    ]);
  });
});
