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
import { createNasGateway } from "../src/nas.js";
import { createS3MultipartTransport } from "../src/s3.js";
import { createTusTransport } from "../src/tus.js";

const require = createRequire(import.meta.url);
const { createRepresentativeS3Target } = require("../scripts/conformance/representative-s3.cjs");
const { createRepresentativeTusTarget } = require("../scripts/conformance/representative-tus.cjs");
const { createRepresentativeNasTarget } = require("../scripts/conformance/representative-nas.cjs");

const sdk = {
  calculateChecksum,
  contentSourceIdentityMatches,
  createContentSourceIdentity,
  createIngestSession,
  createManifest,
  createNasGateway,
  createS3MultipartTransport,
  createTusTransport,
  planChunks,
  validateFile
};

describe("official transport conformance matrix", () => {
  it("produces identical safety statuses and integrity outcomes across ten runs", async () => {
    let expected: string | undefined;

    for (let run = 1; run <= 10; run += 1) {
      const reports = [];
      for (const target of [
        createRepresentativeS3Target(sdk),
        createRepresentativeTusTarget(sdk),
        createRepresentativeNasTarget(sdk)
      ]) {
        reports.push(await runTransportConformance(target, {
          reportId: `${target.profile.transportCategory}-determinism-${run}`
        }));
      }

      const signature = JSON.stringify(reports.map((report) => ({
        category: report.target.transportCategory,
        overallStatus: report.overallStatus,
        results: report.results.map((result) => ({
          scenarioId: result.scenarioId,
          status: result.status,
          cleanupStatus: result.cleanupStatus,
          evidence: result.evidence
        }))
      })));
      expected ??= signature;
      expect(signature).toBe(expected);
      expect(reports.every(({ overallStatus }) => overallStatus === "conformant")).toBe(true);
    }
  }, 30_000);

  it("keeps zero, one, partial-final, and maximum-count chunk plans deterministic", () => {
    const chunkSize = 256 * 1024;
    expect(planChunks(0, { chunkSize }).chunks).toEqual([]);
    expect(planChunks(1, { chunkSize }).chunks).toEqual([
      { index: 0, start: 0, end: 1, size: 1 }
    ]);
    expect(planChunks(chunkSize + 1, { chunkSize }).chunks.at(-1)).toEqual({
      index: 1,
      start: chunkSize,
      end: chunkSize + 1,
      size: 1
    });
    expect(planChunks(chunkSize * 10_000, { chunkSize }).totalChunks).toBe(10_000);
  });
});
