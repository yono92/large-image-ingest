import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  calculateChecksum,
  contentSourceIdentityMatches,
  createContentSourceIdentity,
  createIngestSession,
  createManifest,
  planChunks,
  validateFile
} from "../src/core.js";
import { runTransportConformance } from "../src/conformance.js";
import { createTusTransport } from "../src/tus.js";

const require = createRequire(import.meta.url);
const { createRepresentativeTusTarget } = require("../scripts/conformance/representative-tus.cjs") as {
  createRepresentativeTusTarget(sdk: Record<string, unknown>): import("../src/conformance.js").TransportConformanceTarget;
};

const sdk = {
  calculateChecksum,
  contentSourceIdentityMatches,
  createContentSourceIdentity,
  createIngestSession,
  createManifest,
  createTusTransport,
  planChunks,
  validateFile
};

describe("official tus transport conformance", () => {
  it("passes every applicable representative scenario and exposes checksum as unsupported", async () => {
    const report = await runTransportConformance(createRepresentativeTusTarget(sdk), {
      reportId: "tus-representative-test"
    });

    expect(report.overallStatus).toBe("conformant");
    expect(report.target.transportCategory).toBe("tus");
    expect(report.results.at(-1)).toMatchObject({
      scenarioId: "integrity.chunk-evidence-enforced",
      status: "unsupported"
    });
    expect(report.results.find(({ scenarioId }) => scenarioId === "recovery.interrupted-no-retransmit"))
      .toMatchObject({ status: "passed", evidence: { retransmittedAcknowledgedBytes: 0 } });
    expect(report.results.find(({ scenarioId }) => scenarioId === "recovery.session-reconciliation"))
      .toMatchObject({ status: "passed", evidence: { expirationReconciliationProven: true } });
  });
});
