import { describe, expect, it } from "vitest";
import {
  evaluateDomainValidationProfile,
  loadBundledDomainProfile
} from "../src/profiles.js";
import { profileManifest, structuralEvidence } from "./domain-profile-fixtures.js";

describe("microscopy and satellite domain profiles", () => {
  it("passes OME-TIFF microscopy with caller assertions kept distinct from observed structure", async () => {
    const profile = await loadBundledDomainProfile("microscopy-acquisition");
    const fixture = await profileManifest("microscopy");
    const result = await evaluateDomainValidationProfile({
      profile,
      manifest: fixture.manifest,
      structuralEvidence: structuralEvidence("microscopy")
    });
    expect(result.result).toBe("passed");
    expect(result.outcomes.find((item) => item.ruleId === "format.structure-allowed")?.evidenceSource)
      .toBe("sdk_observed");
    expect(result.outcomes.find((item) => item.ruleId === "metadata.specimen-id")?.evidenceSource)
      .toBe("caller_supplied");
  });

  it("blocks microscopy when acquisition context or structural evidence is unavailable", async () => {
    const profile = await loadBundledDomainProfile("microscopy-acquisition");
    const fixture = await profileManifest("microscopy");
    delete fixture.manifest.metadata.instrumentId;
    const result = await evaluateDomainValidationProfile({ profile, manifest: fixture.manifest });
    expect(result.result).toBe("failed");
    expect(result.failedRuleCodes).toEqual(expect.arrayContaining([
      "metadata.instrument-id", "format.structure-allowed", "format.evidence-coherent"
    ]));
  });

  it("reports satellite coordinate evidence as warning when unavailable and pass when attested", async () => {
    const profile = await loadBundledDomainProfile("satellite-imagery");
    const fixture = await profileManifest("satellite");
    const unavailable = await evaluateDomainValidationProfile({
      profile,
      manifest: fixture.manifest,
      structuralEvidence: structuralEvidence("satellite")
    });
    const attested = await evaluateDomainValidationProfile({
      profile,
      manifest: fixture.manifest,
      structuralEvidence: structuralEvidence("satellite"),
      externalEvidence: {
        coordinateReference: { source: "external_attested", present: true }
      }
    });
    expect(unavailable.result).toBe("passed_with_warnings");
    expect(unavailable.warningRuleCodes).toContain("external.coordinate-reference");
    expect(attested.result).toBe("passed");
    expect(attested.outcomes.find((item) => item.ruleId === "external.coordinate-reference")?.evidenceSource)
      .toBe("external_attested");
  });

  it("does not turn a GeoTIFF filename into observed georeferencing", async () => {
    const profile = await loadBundledDomainProfile("satellite-imagery");
    const fixture = await profileManifest("satellite");
    const result = await evaluateDomainValidationProfile({ profile, manifest: fixture.manifest });
    expect(result.failedRuleCodes).toContain("format.structure-allowed");
    expect(result.outcomes.find((item) => item.ruleId === "format.structure-allowed")?.evidenceSource)
      .toBe("none");
  });
});
