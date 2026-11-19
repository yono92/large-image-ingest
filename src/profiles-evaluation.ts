// Part of profiles.ts, split out to keep modules under 500 lines; public exports stay on profiles.ts.
import { calculateChecksum } from "./checksum.js";
import { canonicalizeProvenanceJson } from "./provenance.js";
import type { IngestFileLike } from "./types.js";
import { DomainProfileError } from "./profiles.js";
import type { DomainEvidenceSource, DomainProfileIssue, DomainProfileResult, DomainRuleEvaluation, DomainRuleOutcome, DomainStructuralFormat, DomainValidationProfile, DomainValidationRule, EvaluateDomainValidationProfileInput } from "./profiles.js";
import { createDomainProfileReference, domainProfileReferencesEqual, validateDomainProfileReference } from "./profiles-reference.js";
import { addProfileIssue, isDomain, isNonNegativeSafeInteger, isPositiveInteger, isPositiveSafeInteger, isRationaleCategory, isRecord, isRuleCategory, isSafeId, isSafeMetadataKey, isStructuralFormat, severityRank, stringSetIsValid, unavailableRank } from "./profiles-utils.js";
import { MAX_MAPPINGS, MAX_RULES, RFC3339, SEMVER, SHA256, trustedProfiles } from "./profiles-shared.js";

export function evaluateRule(
  rule: DomainValidationRule,
  profile: DomainValidationProfile,
  input: EvaluateDomainValidationProfileInput
): DomainRuleEvaluation {
  const manifest = input.manifest;
  switch (rule.kind) {
    case "source_size": {
      const value = manifest.original.sizeBytes;
      const valid = Number.isSafeInteger(value) && value >= rule.minBytes &&
        (rule.maxBytes === undefined || value <= rule.maxBytes);
      return valid ? pass(rule, "manifest") : fail(rule, "manifest");
    }
    case "whole_file_checksum": {
      const checksum = manifest.original.checksum;
      if (!checksum) return unavailable(rule);
      const valid = checksum.algorithm === "sha256" && checksum.scope === "whole-file" &&
        SHA256.test(checksum.value.toLowerCase());
      return valid ? pass(rule, "manifest") : fail(rule, "manifest");
    }
    case "allowed_media_types": {
      const mediaType = manifest.original.mediaType.toLowerCase();
      return rule.values.includes(mediaType) ? pass(rule, "manifest") : fail(rule, "manifest");
    }
    case "allowed_name_suffixes": {
      const name = manifest.original.name.toLowerCase();
      return rule.values.some((suffix) => name.endsWith(suffix))
        ? pass(rule, "manifest")
        : fail(rule, "manifest");
    }
    case "allowed_structural_formats": {
      const format = input.structuralEvidence?.format;
      if (!format) return unavailable(rule);
      return rule.values.includes(format)
        ? pass(rule, input.structuralEvidence!.source)
        : fail(rule, input.structuralEvidence!.source);
    }
    case "format_coherence": {
      const structural = input.structuralEvidence?.format;
      if (!structural) return unavailable(rule);
      const declaredFamily = mediaFamily(manifest.original.mediaType);
      const nameFamily = suffixFamily(manifest.original.name);
      const structuralFamily = formatFamily(structural);
      return declaredFamily !== undefined && nameFamily !== undefined &&
        declaredFamily === nameFamily && nameFamily === structuralFamily
        ? pass(rule, input.structuralEvidence!.source)
        : fail(rule, input.structuralEvidence!.source);
    }
    case "positive_dimensions": {
      const dimensions = readDimensions(input);
      if (!dimensions) return unavailable(rule);
      return isPositiveInteger(dimensions.width) && isPositiveInteger(dimensions.height)
        ? pass(rule, dimensions.source)
        : fail(rule, dimensions.source);
    }
    case "positive_bit_depth": {
      const bitDepth = input.structuralEvidence?.bitDepth ?? manifest.image.colorDepth ?? undefined;
      const source: DomainEvidenceSource = input.structuralEvidence?.bitDepth !== undefined
        ? input.structuralEvidence.source
        : manifest.image.colorDepth !== null
          ? "caller_supplied"
          : "none";
      if (bitDepth === undefined || bitDepth === null) return unavailable(rule);
      return isPositiveInteger(bitDepth) ? pass(rule, source) : fail(rule, source);
    }
    case "metadata_identifier": {
      const key = mappedMetadataKey(profile, rule.metadataKey);
      const value = manifest.metadata[key];
      if (value === undefined) return unavailable(rule);
      const valid = typeof value === "string" && validIdentifier(value, rule.minLength, rule.maxLength);
      return valid ? pass(rule, "caller_supplied") : fail(rule, "caller_supplied");
    }
    case "metadata_timestamp": {
      const key = mappedMetadataKey(profile, rule.metadataKey);
      const value = manifest.metadata[key];
      if (value === undefined) return unavailable(rule);
      const valid = typeof value === "string" && validRfc3339Timestamp(value, rule.rejectUnknownOffset);
      return valid ? pass(rule, "caller_supplied") : fail(rule, "caller_supplied");
    }
    case "external_evidence": {
      const evidence = input.externalEvidence?.[rule.evidenceKey];
      if (!evidence) return unavailable(rule);
      return evidence.present ? pass(rule, evidence.source) : fail(rule, evidence.source);
    }
  }
}

function readDimensions(input: EvaluateDomainValidationProfileInput): {
  width: number;
  height: number;
  source: DomainEvidenceSource;
} | undefined {
  const structural = input.structuralEvidence;
  if (structural?.width !== undefined && structural.height !== undefined) {
    return { width: structural.width, height: structural.height, source: structural.source };
  }
  if (input.manifest.image.width !== null && input.manifest.image.height !== null) {
    return {
      width: input.manifest.image.width,
      height: input.manifest.image.height,
      source: "caller_supplied"
    };
  }
  return undefined;
}

function pass(rule: DomainValidationRule, source: DomainEvidenceSource): DomainRuleEvaluation {
  return outcome(rule, source, "pass");
}

function fail(rule: DomainValidationRule, source: DomainEvidenceSource): DomainRuleEvaluation {
  return outcome(rule, source, rule.severity === "blocking" ? "blocking_failure" : "warning");
}

function unavailable(rule: DomainValidationRule): DomainRuleEvaluation {
  if (rule.unavailableBehavior === "not_applicable") return outcome(rule, "none", "not_applicable");
  return outcome(rule, "none", "unavailable_evidence");
}

function outcome(
  rule: DomainValidationRule,
  evidenceSource: DomainEvidenceSource,
  result: DomainRuleOutcome
): DomainRuleEvaluation {
  return {
    ruleId: rule.id,
    category: rule.category,
    severity: rule.unavailableBehavior === "warn" && result === "unavailable_evidence"
      ? "warning"
      : rule.severity,
    evidenceSource,
    outcome: result,
    descriptionCode: rule.descriptionCode,
    code: `${rule.id}.${result}`
  };
}

export function aggregateResult(outcomes: readonly DomainRuleEvaluation[]): DomainProfileResult {
  if (outcomes.some((item) => item.outcome === "invalid_configuration")) return "invalid_configuration";
  if (outcomes.some(isBlockingOutcome)) return "failed";
  if (outcomes.some(isWarningOutcome)) return "passed_with_warnings";
  return "passed";
}

export function isBlockingOutcome(outcome: DomainRuleEvaluation): boolean {
  return outcome.outcome === "blocking_failure" ||
    (outcome.outcome === "unavailable_evidence" && outcome.severity === "blocking");
}

export function isWarningOutcome(outcome: DomainRuleEvaluation): boolean {
  return outcome.outcome === "warning" ||
    (outcome.outcome === "unavailable_evidence" && outcome.severity === "warning");
}

export function validateProfileShape(value: Record<string, any>, issues: DomainProfileIssue[]): void {
  if (!isSafeId(value.name) || typeof value.version !== "string" || !SEMVER.test(value.version) ||
      !isSafeId(value.descriptionCode) || !isDomain(value.domain)) {
    addProfileIssue(issues, "profile.identity_invalid");
  }
  if (!isRecord(value.compatibility) ||
      !Array.isArray(value.compatibility.manifestSchemaVersions) ||
      value.compatibility.manifestSchemaVersions.length !== 1 ||
      value.compatibility.manifestSchemaVersions[0] !== "large-image-ingest.manifest.v1" ||
      !Array.isArray(value.compatibility.libraryMajorVersions) ||
      value.compatibility.libraryMajorVersions.length !== 1 ||
      value.compatibility.libraryMajorVersions[0] !== 1) {
    addProfileIssue(issues, "profile.compatibility_invalid");
  }
  if (!Array.isArray(value.rules) || value.rules.length === 0 || value.rules.length > MAX_RULES) {
    addProfileIssue(issues, "profile.rule_invalid");
  } else {
    const ids = new Set<string>();
    for (const rule of value.rules) {
      if (!isRule(rule)) {
        addProfileIssue(issues, "profile.rule_invalid", isRecord(rule) && typeof rule.id === "string" ? rule.id : undefined);
      } else if (ids.has(rule.id)) {
        addProfileIssue(issues, "profile.rule_duplicate", rule.id);
      } else {
        ids.add(rule.id);
      }
    }
  }
  if (!isRecord(value.effectivePolicyDigest) ||
      value.effectivePolicyDigest.algorithm !== "sha256" ||
      value.effectivePolicyDigest.canonicalization !== "rfc8785-jcs" ||
      typeof value.effectivePolicyDigest.value !== "string" ||
      !SHA256.test(value.effectivePolicyDigest.value)) {
    addProfileIssue(issues, "profile.digest_mismatch");
  }
}

function isRule(value: unknown): value is DomainValidationRule {
  if (!isRecord(value) || !isSafeId(value.id) || !isRuleCategory(value.category) ||
      (value.severity !== "blocking" && value.severity !== "warning") ||
      !["manifest", "structural", "metadata", "external"].includes(value.evidenceRequirement) ||
      !["block", "warn", "not_applicable"].includes(value.unavailableBehavior) ||
      !isSafeId(value.descriptionCode)) return false;
  switch (value.kind) {
    case "source_size":
      return isNonNegativeSafeInteger(value.minBytes) &&
        (value.maxBytes === undefined || (isPositiveSafeInteger(value.maxBytes) && value.maxBytes >= value.minBytes));
    case "whole_file_checksum": return value.algorithm === "sha256";
    case "allowed_media_types":
    case "allowed_name_suffixes":
      return stringSetIsValid(value.values);
    case "allowed_structural_formats":
      return Array.isArray(value.values) && value.values.length > 0 && value.values.every(isStructuralFormat) &&
        new Set(value.values).size === value.values.length;
    case "format_coherence":
    case "positive_dimensions":
    case "positive_bit_depth": return true;
    case "metadata_identifier":
      return isSafeMetadataKey(value.metadataKey) && isPositiveSafeInteger(value.minLength) &&
        isPositiveSafeInteger(value.maxLength) && value.maxLength <= 256 && value.minLength <= value.maxLength;
    case "metadata_timestamp": return isSafeMetadataKey(value.metadataKey) && value.rejectUnknownOffset === true;
    case "external_evidence": return isSafeMetadataKey(value.evidenceKey);
    default: return false;
  }
}

export function validateDerivation(
  profile: DomainValidationProfile,
  base: DomainValidationProfile | undefined,
  issues: DomainProfileIssue[]
): void {
  const derivation = profile.derivation;
  if (!derivation || !validateDomainProfileReference(derivation.base) ||
      !Array.isArray(derivation.ancestry) || !Array.isArray(derivation.addedRuleIds) ||
      !Array.isArray(derivation.tightenedRuleIds) || !Array.isArray(derivation.exceptions) ||
      !isRecord(derivation.metadataMappings)) {
    addProfileIssue(issues, "profile.derivation_invalid");
    return;
  }
  const ancestryKeys = derivation.ancestry.map((item) =>
    validateDomainProfileReference(item) ? `${item.name}@${item.version}#${item.effectivePolicyDigest.value}` : "invalid"
  );
  if (ancestryKeys.includes("invalid") || new Set(ancestryKeys).size !== ancestryKeys.length ||
      derivation.ancestry.some((item) => item.name === profile.name && item.version === profile.version)) {
    addProfileIssue(issues, "profile.derivation_cycle");
  }
  if (!base && !trustedProfiles.has(profile)) {
    addProfileIssue(issues, "profile.derivation_invalid");
    return;
  }
  if (base && !domainProfileReferencesEqual(createDomainProfileReference(base), derivation.base)) {
    addProfileIssue(issues, "profile.derivation_invalid");
  }
  const rules = new Map(profile.rules.map((rule) => [rule.id, rule]));
  if (Object.keys(derivation.metadataMappings).length > MAX_MAPPINGS ||
      Object.entries(derivation.metadataMappings).some(([canonical, mapped]) =>
        !isSafeMetadataKey(canonical) || !isSafeMetadataKey(mapped) ||
        ![...rules.values()].some((rule) =>
          (rule.kind === "metadata_identifier" || rule.kind === "metadata_timestamp") && rule.metadataKey === canonical
        ))) {
    addProfileIssue(issues, "profile.mapping_invalid");
  }
  if (derivation.exceptions.some((item) =>
    !isSafeId(item.ruleId) || !["replace", "disable"].includes(item.action) ||
    !isRationaleCategory(item.rationaleCategory))) {
    addProfileIssue(issues, "profile.exception_invalid");
  }
  if (base) {
    const baseRules = new Map(base.rules.map((rule) => [rule.id, rule]));
    const added = new Set(derivation.addedRuleIds);
    const tightened = new Set(derivation.tightenedRuleIds);
    const excepted = new Map(derivation.exceptions.map((item) => [item.ruleId, item]));
    if (
      added.size !== derivation.addedRuleIds.length ||
      tightened.size !== derivation.tightenedRuleIds.length ||
      excepted.size !== derivation.exceptions.length ||
      [...added].some((id) => !isSafeId(id) || baseRules.has(id) || !rules.has(id)) ||
      [...tightened].some((id) => {
        const inherited = baseRules.get(id);
        const effective = rules.get(id);
        return !isSafeId(id) || !inherited || !effective || !isProvablyTighter(inherited, effective);
      }) ||
      [...excepted.entries()].some(([id, exception]) => {
        const inherited = baseRules.get(id);
        const effective = rules.get(id);
        return !inherited ||
          (exception.action === "disable" ? effective !== undefined : effective === undefined);
      }) ||
      [...rules.keys()].some((id) => !baseRules.has(id) && !added.has(id))
    ) {
      addProfileIssue(issues, "profile.derivation_invalid");
    }
    const declaredChanges = new Set([
      ...added,
      ...tightened,
      ...excepted.keys()
    ]);
    for (const [id, inherited] of baseRules) {
      const effective = rules.get(id);
      if ((!effective || canonicalizeProvenanceJson(inherited) !== canonicalizeProvenanceJson(effective)) && !declaredChanges.has(id)) {
        addProfileIssue(issues, "profile.derivation_invalid", id);
      }
    }
  }
}

export function isProvablyTighter(base: DomainValidationRule, next: DomainValidationRule): boolean {
  if (base.id !== next.id || base.kind !== next.kind || base.category !== next.category ||
      base.evidenceRequirement !== next.evidenceRequirement ||
      severityRank(next.severity) < severityRank(base.severity) ||
      unavailableRank(next.unavailableBehavior) < unavailableRank(base.unavailableBehavior)) return false;
  switch (base.kind) {
    case "source_size": {
      if (next.kind !== "source_size") return false;
      const baseMax = base.maxBytes ?? Number.MAX_SAFE_INTEGER;
      const nextMax = next.maxBytes ?? Number.MAX_SAFE_INTEGER;
      return next.minBytes >= base.minBytes && nextMax <= baseMax;
    }
    case "allowed_media_types":
    case "allowed_name_suffixes": {
      if (next.kind !== base.kind) return false;
      return next.values.every((value) => base.values.includes(value));
    }
    case "allowed_structural_formats": {
      if (next.kind !== "allowed_structural_formats") return false;
      return next.values.every((value) => base.values.includes(value));
    }
    case "metadata_identifier": {
      if (next.kind !== "metadata_identifier" || next.metadataKey !== base.metadataKey) return false;
      return next.minLength >= base.minLength && next.maxLength <= base.maxLength;
    }
    case "metadata_timestamp":
      return next.kind === "metadata_timestamp" && next.metadataKey === base.metadataKey;
    case "external_evidence":
      return next.kind === "external_evidence" && next.evidenceKey === base.evidenceKey;
    case "whole_file_checksum":
    case "format_coherence":
    case "positive_dimensions":
    case "positive_bit_depth": return true;
  }
}

export function validateMetadataMappings(
  mappings: Readonly<Record<string, string>>,
  rules: ReadonlyMap<string, DomainValidationRule>
): Readonly<Record<string, string>> {
  if (!isRecord(mappings) || Object.keys(mappings).length > MAX_MAPPINGS) {
    throw new DomainProfileError("profile.mapping_invalid");
  }
  const metadataKeys = new Set([...rules.values()].flatMap((rule) =>
    rule.kind === "metadata_identifier" || rule.kind === "metadata_timestamp"
      ? [rule.metadataKey]
      : []
  ));
  const output: Record<string, string> = {};
  const used = new Set<string>();
  for (const [canonical, mapped] of Object.entries(mappings)) {
    if (!metadataKeys.has(canonical) || !isSafeMetadataKey(mapped) || used.has(mapped)) {
      throw new DomainProfileError("profile.mapping_invalid");
    }
    used.add(mapped);
    output[canonical] = mapped;
  }
  return output;
}

function mappedMetadataKey(profile: DomainValidationProfile, key: string): string {
  return profile.derivation?.metadataMappings[key] ?? key;
}

function mediaFamily(value: string): "tiff" | "png" | "jpeg" | undefined {
  const normalized = value.toLowerCase();
  if (normalized === "image/tiff" || normalized === "image/x-tiff") return "tiff";
  if (normalized === "image/png") return "png";
  if (normalized === "image/jpeg") return "jpeg";
  return undefined;
}

function suffixFamily(value: string): "tiff" | "png" | "jpeg" | undefined {
  const normalized = value.toLowerCase();
  if ([".tif", ".tiff", ".ome.tif", ".ome.tiff", ".ome.tf2", ".ome.tf8", ".ome.btf", ".geotif", ".geotiff"]
    .some((suffix) => normalized.endsWith(suffix))) return "tiff";
  if (normalized.endsWith(".png")) return "png";
  if ([".jpg", ".jpeg", ".jpe"].some((suffix) => normalized.endsWith(suffix))) return "jpeg";
  return undefined;
}

function formatFamily(value: DomainStructuralFormat): "tiff" | "png" | "jpeg" | "proprietary" {
  if (["tiff", "bigtiff", "ome-tiff", "geotiff"].includes(value)) return "tiff";
  if (value === "png") return "png";
  if (value === "jpeg") return "jpeg";
  return "proprietary";
}

function validIdentifier(value: string, min: number, max: number): boolean {
  return value === value.normalize("NFC") && value === value.trim() &&
    value.length >= min && value.length <= max &&
    !/[\u0000-\u001f\u007f/\\]/.test(value) && !value.includes("../") && !value.includes("..\\");
}

function validRfc3339Timestamp(value: string, rejectUnknownOffset: boolean): boolean {
  if (!RFC3339.test(value) || (rejectUnknownOffset && value.endsWith("-00:00"))) return false;
  return Number.isFinite(Date.parse(value));
}

export function withoutProfileDigest(profile: DomainValidationProfile): Omit<DomainValidationProfile, "effectivePolicyDigest"> {
  const { effectivePolicyDigest: _digest, ...body } = profile;
  return body;
}

export async function sha256Canonical(value: unknown): Promise<string> {
  const canonical = canonicalizeProvenanceJson(value);
  const blob = new Blob([canonical], { type: "application/json" });
  Object.defineProperties(blob, { name: { value: "domain-profile.json" }, lastModified: { value: 0 } });
  return (await calculateChecksum(blob as IngestFileLike)).value;
}
