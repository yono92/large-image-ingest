import { describe, expect, it } from "vitest";
import {
  evaluateDomainValidationProfile,
  listBundledDomainProfiles,
  loadBundledDomainProfile,
  validateDomainValidationProfile
} from "../src/profiles.js";
import { profileManifest, structuralEvidence } from "./domain-profile-fixtures.js";

describe("bundled domain validation profiles", () => {
  it("publishes three immutable, versioned, digest-valid rule inventories", async () => {
    expect(listBundledDomainProfiles().map((item) => item.id)).toEqual([
      "semiconductor-inspection", "microscopy-acquisition", "satellite-imagery"
    ]);
    for (const id of listBundledDomainProfiles().map((item) => item.id)) {
      const first = await loadBundledDomainProfile(id);
      const second = await loadBundledDomainProfile(id);
      expect(first).toBe(second);
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(first.rules)).toBe(true);
      expect(first.rules.length).toBeGreaterThanOrEqual(11);
      expect(first.effectivePolicyDigest.value).toMatch(/^[a-f0-9]{64}$/);
      expect((await validateDomainValidationProfile(first)).ok).toBe(true);
    }
  });

  it("evaluates the semiconductor baseline deterministically", async () => {
    const profile = await loadBundledDomainProfile("semiconductor-inspection");
    const fixture = await profileManifest("semiconductor");
    const input = {
      profile,
      manifest: fixture.manifest,
      structuralEvidence: structuralEvidence("semiconductor"),
      evaluatedAt: "2026-08-31T02:00:00.000Z"
    };
    const first = await evaluateDomainValidationProfile(input);
    const second = await evaluateDomainValidationProfile(input);
    expect(first).toEqual(second);
    expect(first.result).toBe("passed");
    expect(first.outcomes).toHaveLength(profile.rules.length);
    expect(first.outcomes.every((item) => item.outcome === "pass")).toBe(true);
    expect(first.sessionBinding?.manifestId).toBe(fixture.manifest.id);
  });

  it("blocks missing or malformed semiconductor traceability and strong identity", async () => {
    const profile = await loadBundledDomainProfile("semiconductor-inspection");
    const fixture = await profileManifest("semiconductor");
    delete fixture.manifest.original.checksum;
    fixture.manifest.metadata.lotId = "../secret";
    fixture.manifest.metadata.waferId = "";
    fixture.manifest.metadata.inspectionTimestamp = "2026-08-31T10:00:00";
    const result = await evaluateDomainValidationProfile({
      profile,
      manifest: fixture.manifest,
      structuralEvidence: structuralEvidence("semiconductor")
    });
    expect(result.result).toBe("failed");
    expect(result.failedRuleCodes).toEqual(expect.arrayContaining([
      "source.sha256-required",
      "metadata.lot-id",
      "metadata.wafer-id",
      "metadata.inspection-timestamp"
    ]));
    expect(result.sessionBinding).toBeUndefined();
  });

  it("blocks declared media, suffix, and observed format disagreement", async () => {
    const profile = await loadBundledDomainProfile("semiconductor-inspection");
    const fixture = await profileManifest("semiconductor");
    fixture.manifest.original.mediaType = "image/png";
    const result = await evaluateDomainValidationProfile({
      profile,
      manifest: fixture.manifest,
      structuralEvidence: structuralEvidence("semiconductor")
    });
    expect(result.failedRuleCodes).toContain("format.evidence-coherent");
  });

  it("distinguishes unavailable bit depth from an invalid observed bit depth", async () => {
    const profile = await loadBundledDomainProfile("semiconductor-inspection");
    const fixture = await profileManifest("semiconductor");
    fixture.manifest.image.colorDepth = null;
    const withoutBitDepth = { ...structuralEvidence("semiconductor") };
    delete (withoutBitDepth as Partial<typeof withoutBitDepth>).bitDepth;
    const unavailable = await evaluateDomainValidationProfile({
      profile,
      manifest: fixture.manifest,
      structuralEvidence: withoutBitDepth
    });
    const invalid = await evaluateDomainValidationProfile({
      profile,
      manifest: fixture.manifest,
      structuralEvidence: { ...structuralEvidence("semiconductor"), bitDepth: 0 }
    });
    expect(unavailable.result).toBe("passed_with_warnings");
    expect(unavailable.outcomes.find((item) => item.ruleId === "structure.bit-depth-positive"))
      .toMatchObject({ outcome: "unavailable_evidence", severity: "warning" });
    expect(invalid.result).toBe("failed");
  });
});
