import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  calculateChecksum,
  contentSourceIdentityMatches,
  createContentSourceIdentity,
  planChunks,
  validateFile
} from "../src/core.js";
import { runTransportConformance } from "../src/conformance.js";
import { createNasGateway } from "../src/nas.js";

const require = createRequire(import.meta.url);
const { createRepresentativeNasTarget } = require("../scripts/conformance/representative-nas.cjs") as {
  createRepresentativeNasTarget(sdk: Record<string, unknown>): import("../src/conformance.js").TransportConformanceTarget;
};

const sdk = {
  calculateChecksum,
  contentSourceIdentityMatches,
  createContentSourceIdentity,
  createNasGateway,
  planChunks,
  validateFile
};

describe("official NAS gateway conformance", () => {
  it("passes every applicable representative scenario", async () => {
    const report = await runTransportConformance(createRepresentativeNasTarget(sdk), {
      reportId: "nas-representative-test"
    });

    expect(report.overallStatus).toBe("conformant");
    expect(report.target.transportCategory).toBe("nas");
    expect(report.results.every(({ status }) => status === "passed" || status === "unsupported")).toBe(true);
    expect(report.results.find(({ scenarioId }) => scenarioId === "completion.ambiguous-result-reconciled"))
      .toMatchObject({ status: "passed", evidence: { authoritativeCompletionCount: 1 } });
    expect(report.results.find(({ scenarioId }) => scenarioId === "cleanup.failure-after-completion-isolated"))
      .toMatchObject({ status: "passed", evidence: { authoritativeCompletionPreserved: true } });
  });
});
