import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  calculateChecksum,
  contentSourceIdentityMatches,
  createContentSourceIdentity,
  createIngestSession,
  createManifest,
  validateFile
} from "../src/core.js";
import { runTransportConformance } from "../src/conformance.js";
import { createS3MultipartTransport } from "../src/s3.js";

const require = createRequire(import.meta.url);
const { createRepresentativeS3Target } = require("../scripts/conformance/representative-s3.cjs") as {
  createRepresentativeS3Target(sdk: Record<string, unknown>): import("../src/conformance.js").TransportConformanceTarget;
};

const sdk = {
  calculateChecksum,
  contentSourceIdentityMatches,
  createContentSourceIdentity,
  createIngestSession,
  createManifest,
  createS3MultipartTransport,
  validateFile
};

describe("official S3 transport conformance", () => {
  it("passes every applicable representative scenario", async () => {
    const report = await runTransportConformance(createRepresentativeS3Target(sdk), {
      reportId: "s3-representative-test"
    });

    expect(report.overallStatus).toBe("conformant");
    expect(report.target.transportCategory).toBe("s3-multipart");
    expect(report.results).toHaveLength(10);
    expect(report.results.every(({ status }) => status === "passed" || status === "unsupported")).toBe(true);
    expect(report.results.find(({ scenarioId }) => scenarioId === "recovery.interrupted-no-retransmit"))
      .toMatchObject({
        status: "passed",
        evidence: {
          retransmittedAcknowledgedBytes: 0,
          storedByteCountMatched: true,
          storedChecksumMatched: true
        }
      });
    expect(report.results.find(({ scenarioId }) => scenarioId === "completion.ambiguous-result-reconciled"))
      .toMatchObject({ status: "passed", evidence: { authoritativeCompletionCount: 1 } });
  });
});
