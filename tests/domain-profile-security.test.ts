import { describe, expect, it } from "vitest";
import {
  deriveDomainValidationProfile,
  evaluateDomainValidationProfile,
  loadBundledDomainProfile,
  validateDomainValidationProfile
} from "../src/profiles.js";
import { profileManifest, structuralEvidence } from "./domain-profile-fixtures.js";

describe("domain profile safe outputs and bounded inputs", () => {
  it("omits metadata values, source checksums, full profiles, storage, and private text", async () => {
    const profile = await loadBundledDomainProfile("semiconductor-inspection");
    const fixture = await profileManifest("semiconductor");
    fixture.manifest.metadata.lotId = "CUSTOMER-SECRET-LOT";
    fixture.manifest.storage = { kind: "s3", locationHint: "s3://secret-bucket/private-key" };
    const checksum = fixture.manifest.original.checksum!.value;
    const result = await evaluateDomainValidationProfile({
      profile,
      manifest: fixture.manifest,
      structuralEvidence: structuralEvidence("semiconductor")
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("CUSTOMER-SECRET-LOT");
    expect(serialized).not.toContain(checksum);
    expect(serialized).not.toContain("secret-bucket");
    expect(serialized).not.toContain('"rules"');
  });

  it("evaluates existing evidence without accepting or reading a Blob", async () => {
    const profile = await loadBundledDomainProfile("semiconductor-inspection");
    const fixture = await profileManifest("semiconductor");
    const before = JSON.stringify(fixture.manifest);
    const result = await evaluateDomainValidationProfile({
      profile,
      manifest: fixture.manifest,
      structuralEvidence: structuralEvidence("semiconductor")
    });
    expect(result.result).toBe("passed");
    expect(JSON.stringify(fixture.manifest)).toBe(before);
    expect("file" in result).toBe(false);
  });

  it("rejects oversized rule inventories, unsafe mappings, and changed private definitions safely", async () => {
    const profile = await loadBundledDomainProfile("semiconductor-inspection");
    const oversized = structuredClone(profile) as any;
    oversized.rules = Array.from({ length: 129 }, (_, index) => ({
      ...structuredClone(profile.rules[0]),
      id: `source.rule-${index}`
    }));
    expect((await validateDomainValidationProfile(oversized)).issues.map((item) => item.code))
      .toContain("profile.rule_invalid");

    await expect(deriveDomainValidationProfile({
      base: profile,
      name: "unsafe-mapping-policy",
      version: "1.0.0",
      descriptionCode: "profile.unsafe-mapping",
      metadataMappings: { lotId: "../secret-key" }
    })).rejects.toMatchObject({ code: "profile.mapping_invalid" });

    const changed = structuredClone(profile) as any;
    changed.privateRationale = "CUSTOMER-PRIVATE-EXCEPTION-TEXT";
    const result = await evaluateDomainValidationProfile({
      profile: changed,
      manifest: (await profileManifest("semiconductor")).manifest
    });
    expect(result.result).toBe("invalid_configuration");
    expect(JSON.stringify(result)).not.toContain("CUSTOMER-PRIVATE-EXCEPTION-TEXT");
  });
});
