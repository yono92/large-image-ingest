import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INGEST_PROVENANCE_SCHEMA_VERSION,
  createSafeProvenanceSummary,
  validateIngestProvenance
} from "../src/provenance.js";
import { completedArtifact, mutableArtifact } from "./provenance-fixtures.js";

describe("ingest provenance contract", () => {
  it("round-trips one complete v1 artifact and keeps integrity separate from actor trust", async () => {
    const { artifact } = await completedArtifact({ verified: "verified" });
    const parsed = JSON.parse(JSON.stringify(artifact));
    const validation = await validateIngestProvenance(parsed);

    expect(artifact.schemaVersion).toBe(INGEST_PROVENANCE_SCHEMA_VERSION);
    expect(validation).toMatchObject({
      ok: true,
      integrity: "valid",
      actorTrust: "unsigned"
    });
    expect(validation.artifact).toEqual(artifact);
  });

  it("keeps checked-in schema constants and bounds aligned", async () => {
    const schema = JSON.parse(await readFile(join(
      process.cwd(),
      "specs/015-ingest-provenance/contracts/provenance-artifact.schema.json"
    ), "utf8"));
    expect(schema.properties.schemaVersion.const).toBe(INGEST_PROVENANCE_SCHEMA_VERSION);
    expect(schema.properties.entries.maxItems).toBe(4096);
    expect(schema.properties.derivatives.maxItems).toBe(1024);
    expect(schema.properties.attestations.maxItems).toBe(64);
  });

  it("rejects unknown versions, missing entries, oversized arrays, and unknown fields", async () => {
    const { artifact } = await completedArtifact({ verified: "verified" });
    const cases = [
      Object.assign(mutableArtifact(artifact), { schemaVersion: "large-image-ingest.provenance.v999" }),
      Object.assign(mutableArtifact(artifact), { entries: [] }),
      Object.assign(mutableArtifact(artifact), { attestations: Array.from({ length: 65 }, () => ({})) }),
      Object.assign(mutableArtifact(artifact), { futureSecret: "credential-value" })
    ];

    for (const candidate of cases) {
      const validation = await validateIngestProvenance(candidate);
      expect(validation.ok).toBe(false);
      expect(JSON.stringify(validation.issues)).not.toContain("credential-value");
      await expect(createSafeProvenanceSummary(candidate)).rejects.toMatchObject({
        code: "provenance.artifact_invalid"
      });
    }
  });
});
