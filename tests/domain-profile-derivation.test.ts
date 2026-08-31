import { describe, expect, it } from "vitest";
import {
  deriveDomainValidationProfile,
  DomainProfileError,
  evaluateDomainValidationProfile,
  loadBundledDomainProfile,
  validateDomainValidationProfile,
  type DomainValidationRule
} from "../src/profiles.js";
import { profileManifest, structuralEvidence } from "./domain-profile-fixtures.js";

function cloneRule<T extends DomainValidationRule>(rule: T): T {
  return structuredClone(rule);
}

describe("derived domain validation profiles", () => {
  it("adds rules and tightens inherited limits under a new immutable identity", async () => {
    const base = await loadBundledDomainProfile("semiconductor-inspection");
    const sourceSize = cloneRule(base.rules.find((rule) => rule.id === "source.size-positive")!);
    if (sourceSize.kind !== "source_size") throw new Error("fixture rule mismatch");
    sourceSize.maxBytes = 1024;
    const derived = await deriveDomainValidationProfile({
      base,
      name: "fab-a-inspection-policy",
      version: "1.0.0",
      descriptionCode: "profile.fab-a.inspection",
      tightenRules: [sourceSize],
      addRules: [{
        id: "metadata.recipe-id",
        kind: "metadata_identifier",
        category: "metadata",
        severity: "blocking",
        evidenceRequirement: "metadata",
        unavailableBehavior: "block",
        descriptionCode: "profile.metadata.recipe-id",
        metadataKey: "recipeId",
        minLength: 1,
        maxLength: 64
      }]
    });
    expect(derived.name).toBe("fab-a-inspection-policy");
    expect(derived.derivation?.tightenedRuleIds).toEqual(["source.size-positive"]);
    expect(derived.derivation?.addedRuleIds).toEqual(["metadata.recipe-id"]);
    expect(derived.effectivePolicyDigest.value).not.toBe(base.effectivePolicyDigest.value);
    expect(Object.isFrozen(base.rules)).toBe(true);
  });

  it("maps organization metadata names without copying values into the profile or outcomes", async () => {
    const base = await loadBundledDomainProfile("semiconductor-inspection");
    const derived = await deriveDomainValidationProfile({
      base,
      name: "fab-b-mapped-policy",
      version: "1.0.0",
      descriptionCode: "profile.fab-b.mapped",
      metadataMappings: { lotId: "organizationLot" }
    });
    const fixture = await profileManifest("semiconductor");
    delete fixture.manifest.metadata.lotId;
    fixture.manifest.metadata.organizationLot = "PRIVATE-LOT-42";
    const result = await evaluateDomainValidationProfile({
      profile: derived,
      manifest: fixture.manifest,
      structuralEvidence: structuralEvidence("semiconductor")
    });
    expect(result.result).toBe("passed");
    expect(JSON.stringify(derived)).not.toContain("PRIVATE-LOT-42");
    expect(JSON.stringify(result)).not.toContain("PRIVATE-LOT-42");
  });

  it("allows a proprietary format only through explicit categorized exceptions", async () => {
    const base = await loadBundledDomainProfile("semiconductor-inspection");
    const media = cloneRule(base.rules.find((rule) => rule.id === "format.media-type-allowed")!);
    const suffix = cloneRule(base.rules.find((rule) => rule.id === "format.name-suffix-allowed")!);
    const structure = cloneRule(base.rules.find((rule) => rule.id === "format.structure-allowed")!);
    if (media.kind !== "allowed_media_types" || suffix.kind !== "allowed_name_suffixes" ||
        structure.kind !== "allowed_structural_formats") throw new Error("fixture rule mismatch");
    media.values = [...media.values, "application/x-fab-inspection"];
    suffix.values = [...suffix.values, ".fabraw"];
    structure.values = [...structure.values, "proprietary"];
    const rationaleCategory = "proprietary-format" as const;
    const derived = await deriveDomainValidationProfile({
      base,
      name: "fab-proprietary-policy",
      version: "1.0.0",
      descriptionCode: "profile.fab.proprietary",
      exceptions: [
        { ruleId: media.id, action: "replace", rationaleCategory, replacement: media },
        { ruleId: suffix.id, action: "replace", rationaleCategory, replacement: suffix },
        { ruleId: structure.id, action: "replace", rationaleCategory, replacement: structure },
        { ruleId: "format.evidence-coherent", action: "disable", rationaleCategory }
      ]
    });
    const fixture = await profileManifest("semiconductor");
    fixture.manifest.original.name = "inspection.fabraw";
    fixture.manifest.original.mediaType = "application/x-fab-inspection";
    const result = await evaluateDomainValidationProfile({
      profile: derived,
      manifest: fixture.manifest,
      structuralEvidence: {
        ...structuralEvidence("semiconductor"),
        source: "external_attested",
        format: "proprietary"
      }
    });
    expect(result.result).toBe("passed");
    expect(derived.derivation?.exceptions).toHaveLength(4);
  });

  it("rejects duplicate additions, silent widening, cycles, and malformed mappings", async () => {
    const base = await loadBundledDomainProfile("semiconductor-inspection");
    await expect(deriveDomainValidationProfile({
      base,
      name: "duplicate-policy",
      version: "1.0.0",
      descriptionCode: "profile.duplicate",
      addRules: [cloneRule(base.rules[0]!)]
    })).rejects.toMatchObject({ code: "profile.rule_duplicate" });

    const widened = cloneRule(base.rules.find((rule) => rule.id === "format.media-type-allowed")!);
    if (widened.kind !== "allowed_media_types") throw new Error("fixture rule mismatch");
    widened.values = [...widened.values, "application/octet-stream"];
    await expect(deriveDomainValidationProfile({
      base,
      name: "silent-widening-policy",
      version: "1.0.0",
      descriptionCode: "profile.silent-widening",
      tightenRules: [widened]
    })).rejects.toMatchObject({ code: "profile.tightening_invalid" });

    await expect(deriveDomainValidationProfile({
      base,
      name: base.name,
      version: base.version,
      descriptionCode: "profile.cycle"
    })).rejects.toBeInstanceOf(DomainProfileError);

    await expect(deriveDomainValidationProfile({
      base,
      name: "bad-mapping-policy",
      version: "1.0.0",
      descriptionCode: "profile.bad-mapping",
      metadataMappings: { unknownCanonicalField: "mapped" }
    })).rejects.toMatchObject({ code: "profile.mapping_invalid" });
  });

  it("detects digest changes and requires base evidence for reconstructed derived profiles", async () => {
    const base = await loadBundledDomainProfile("semiconductor-inspection");
    const derived = await deriveDomainValidationProfile({
      base,
      name: "reconstructed-policy",
      version: "1.0.0",
      descriptionCode: "profile.reconstructed"
    });
    const reconstructed = JSON.parse(JSON.stringify(derived));
    expect((await validateDomainValidationProfile(reconstructed)).ok).toBe(false);
    expect((await validateDomainValidationProfile(reconstructed, { baseProfile: base })).ok).toBe(true);
    reconstructed.rules[0].minBytes = 2;
    const changed = await validateDomainValidationProfile(reconstructed, { baseProfile: base });
    expect(changed.issues.map((item) => item.code)).toContain("profile.digest_mismatch");
  });
});
