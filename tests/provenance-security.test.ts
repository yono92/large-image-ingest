import { describe, expect, it } from "vitest";
import {
  createIngestProvenanceRecorder,
  createSafeProvenanceSummary,
  exportIngestProvenance,
  persistIngestProvenance,
  validateIngestProvenance
} from "../src/provenance.js";
import { completedArtifact, mutableArtifact } from "./provenance-fixtures.js";
import { fixtureCapabilities, fixtureManifest } from "./provenance-fixtures.js";

describe("ingest provenance disclosure and persistence", () => {
  it("omits raw metadata, filenames, checksums, annotations, handles, paths, and receipts from summaries", async () => {
    const { artifact } = await completedArtifact({ verified: "verified", authorized: true });
    const summary = await createSafeProvenanceSummary(artifact);
    const serialized = JSON.stringify(summary);

    for (const forbidden of [
      "lot-secret-42",
      "inspection.tif",
      artifact.manifest.checksum?.value,
      "customer-case-secret",
      "secret-upload-id",
      "/private/customer",
      "presigned"
    ].filter((value): value is string => Boolean(value))) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(summary).toMatchObject({
      disclosureProfile: "safe-summary",
      integrity: "valid",
      terminalStatus: "completed"
    });
  });

  it("requires explicit exports, removes annotations for audit, and re-seals both profiles", async () => {
    const { artifact } = await completedArtifact({ verified: "verified", authorized: true });
    const audit = await exportIngestProvenance(artifact, { disclosureProfile: "audit" });
    const full = await exportIngestProvenance(artifact, { disclosureProfile: "authorized-full" });

    expect(audit.disclosureProfile).toBe("audit");
    expect(audit.annotations).toBeUndefined();
    expect(full.annotations).toEqual({ caseId: "customer-case-secret" });
    expect(audit.integrity.value).not.toBe(artifact.integrity.value);
    expect(await validateIngestProvenance(audit)).toMatchObject({ ok: true, integrity: "valid" });
    expect(await validateIngestProvenance(full)).toMatchObject({ ok: true, integrity: "valid" });
  });

  it("rejects unknown future fields instead of copying them into a summary", async () => {
    const { artifact } = await completedArtifact({ verified: "verified" });
    const candidate = mutableArtifact(artifact);
    candidate.future = { credential: "do-not-copy" };
    const validation = await validateIngestProvenance(candidate);

    expect(validation.ok).toBe(false);
    expect(JSON.stringify(validation.issues)).not.toContain("do-not-copy");
    await expect(createSafeProvenanceSummary(candidate)).rejects.toMatchObject({
      code: "provenance.artifact_invalid"
    });

    const nested = mutableArtifact(artifact);
    nested.transport.providerPayload = {
      endpoint: "https://secret.invalid/upload",
      receipt: "raw-receipt"
    };
    const nestedValidation = await validateIngestProvenance(nested);
    expect(nestedValidation.ok).toBe(false);
    expect(JSON.stringify(nestedValidation.issues)).not.toContain("secret.invalid");
    expect(JSON.stringify(nestedValidation.issues)).not.toContain("raw-receipt");
  });

  it("reports sink failures without raw errors or changing completed authority", async () => {
    const { artifact } = await completedArtifact({ verified: "verified" });
    const outcomes: unknown[] = [];
    const secret = "https://secret.invalid/audit?credential=value";
    const result = await persistIngestProvenance(artifact, {
      async write() {
        throw new Error(secret);
      }
    }, {
      onOutcome(outcome) {
        outcomes.push(outcome);
        throw new Error("observer failure is isolated");
      }
    });

    expect(result).toEqual({
      ok: false,
      status: "failed",
      issue: { code: "provenance.persistence_failed" }
    });
    expect(JSON.stringify({ result, outcomes })).not.toContain(secret);
    expect(artifact.terminalStatus).toBe("completed");
    expect(await validateIngestProvenance(artifact)).toMatchObject({ ok: true, integrity: "valid" });
  });

  it("persists only a validated clone", async () => {
    const { artifact } = await completedArtifact({ verified: "verified" });
    let received: unknown;
    const result = await persistIngestProvenance(artifact, {
      async write(value) {
        received = value;
      }
    });
    expect(result).toEqual({ ok: true, status: "persisted" });
    expect(received).toEqual(artifact);
    expect(received).not.toBe(artifact);
  });

  it("rejects annotations containing obvious credential, URL, or path material", async () => {
    const manifest = await fixtureManifest();
    for (const value of [
      "https://secret.invalid/audit",
      "credential=value",
      "token=value",
      "/private/customer/file.tif",
      "../customer/file.tif"
    ]) {
      expect(() => createIngestProvenanceRecorder({
        manifest,
        policy: { id: "inspection-default", version: "1.0.0" },
        transport: { category: "s3-multipart", capabilities: fixtureCapabilities },
        disclosureProfile: "authorized-full",
        annotations: { reason: value }
      })).toThrow();
    }
  });
});
