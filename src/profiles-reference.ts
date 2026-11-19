// Part of profiles.ts, split out to keep modules under 500 lines; public exports stay on profiles.ts.
import type { DomainProfileReference, DomainProfileSessionBinding } from "./types.js";
import { DOMAIN_PROFILE_SCHEMA_VERSION, DomainProfileError, validateDomainValidationProfile } from "./profiles.js";
import type { BundledDomainProfileId, DeriveDomainValidationProfileInput, DomainCategory, DomainProfileAvailabilityResult, DomainProfileDerivation, DomainStructuralFormat, DomainValidationProfile, DomainValidationRule } from "./profiles.js";
import { isProvablyTighter, sha256Canonical, validateMetadataMappings } from "./profiles-evaluation.js";
import { assertProfileIdentity, cloneCompatibility, cloneRule, deepFreeze, isRationaleCategory, isRecord, isSafeId, issue } from "./profiles-utils.js";
import { SEMVER, SHA256, trustedProfiles } from "./profiles-shared.js";

/** @experimental */
export async function deriveDomainValidationProfile(
  input: DeriveDomainValidationProfileInput
): Promise<DomainValidationProfile> {
  const baseValidation = await validateDomainValidationProfile(input.base);
  if (!baseValidation.ok || !baseValidation.profile) {
    throw new DomainProfileError("profile.derivation_invalid", baseValidation.issues);
  }
  assertProfileIdentity(input.name, input.version, input.descriptionCode);
  const base = baseValidation.profile;
  const ancestry = [...(base.derivation?.ancestry ?? []), createDomainProfileReference(base)];
  if (ancestry.some((item) => item.name === input.name && item.version === input.version)) {
    throw new DomainProfileError("profile.derivation_cycle");
  }

  const rules = new Map(base.rules.map((rule) => [rule.id, cloneRule(rule)]));
  const tightenedRuleIds: string[] = [];
  for (const replacement of input.tightenRules ?? []) {
    const inherited = rules.get(replacement.id);
    if (!inherited || !isProvablyTighter(inherited, replacement)) {
      throw new DomainProfileError("profile.tightening_invalid", [
        issue("profile.tightening_invalid", replacement.id)
      ]);
    }
    rules.set(replacement.id, cloneRule(replacement));
    tightenedRuleIds.push(replacement.id);
  }

  const exceptionRecords: Array<DomainProfileDerivation["exceptions"][number]> = [];
  for (const exception of input.exceptions ?? []) {
    const inherited = rules.get(exception.ruleId);
    if (!inherited || !isRationaleCategory(exception.rationaleCategory)) {
      throw new DomainProfileError("profile.exception_invalid", [
        issue("profile.exception_invalid", exception.ruleId)
      ]);
    }
    if (exception.action === "disable") {
      if (exception.replacement !== undefined) throw new DomainProfileError("profile.exception_invalid");
      rules.delete(exception.ruleId);
    } else {
      if (!exception.replacement || exception.replacement.id !== exception.ruleId) {
        throw new DomainProfileError("profile.exception_invalid");
      }
      rules.set(exception.ruleId, cloneRule(exception.replacement));
    }
    exceptionRecords.push({
      ruleId: exception.ruleId,
      action: exception.action,
      rationaleCategory: exception.rationaleCategory
    });
  }

  const addedRuleIds: string[] = [];
  for (const rule of input.addRules ?? []) {
    if (rules.has(rule.id)) {
      throw new DomainProfileError("profile.rule_duplicate", [issue("profile.rule_duplicate", rule.id)]);
    }
    rules.set(rule.id, cloneRule(rule));
    addedRuleIds.push(rule.id);
  }

  const metadataMappings = validateMetadataMappings(input.metadataMappings ?? {}, rules);
  const draft: Omit<DomainValidationProfile, "effectivePolicyDigest"> = {
    schemaVersion: DOMAIN_PROFILE_SCHEMA_VERSION,
    name: input.name,
    version: input.version,
    domain: "organization",
    descriptionCode: input.descriptionCode,
    compatibility: cloneCompatibility(base.compatibility),
    rules: [...rules.values()],
    derivation: {
      base: createDomainProfileReference(base),
      ancestry,
      addedRuleIds: [...addedRuleIds].sort(),
      tightenedRuleIds: [...tightenedRuleIds].sort(),
      metadataMappings,
      exceptions: [...exceptionRecords].sort((left, right) => left.ruleId.localeCompare(right.ruleId))
    }
  };
  return finalizeProfile(draft);
}

/** @experimental */
export function createDomainProfileReference(
  profile: DomainValidationProfile
): DomainProfileReference {
  return deepFreeze({
    schemaVersion: "large-image-ingest.domain-profile-reference.v1",
    name: profile.name,
    version: profile.version,
    effectivePolicyDigest: {
      algorithm: "sha256",
      value: profile.effectivePolicyDigest.value
    }
  });
}

/** @experimental */
export function domainProfileReferencesEqual(
  left: DomainProfileReference | undefined,
  right: DomainProfileReference | undefined
): boolean {
  if (!left || !right) return left === right;
  return left.schemaVersion === right.schemaVersion &&
    left.name === right.name &&
    left.version === right.version &&
    left.effectivePolicyDigest.algorithm === right.effectivePolicyDigest.algorithm &&
    left.effectivePolicyDigest.value === right.effectivePolicyDigest.value;
}

/** @experimental */
export function classifyDomainProfileReferenceAvailability(
  reference: DomainProfileReference,
  availableProfiles: readonly DomainValidationProfile[]
): DomainProfileAvailabilityResult {
  if (!validateDomainProfileReference(reference)) {
    throw new DomainProfileError("profile.identity_invalid");
  }
  const sameIdentity = availableProfiles.filter((profile) =>
    profile.name === reference.name && profile.version === reference.version
  );
  const exact = sameIdentity.some((profile) =>
    domainProfileReferencesEqual(createDomainProfileReference(profile), reference)
  );
  return deepFreeze({
    status: exact ? "available" : sameIdentity.length > 0 ? "identity_conflict" : "historical_unavailable",
    reference: structuredClone(reference)
  });
}

/** @experimental */
export function validateDomainProfileReference(value: unknown): value is DomainProfileReference {
  return isRecord(value) &&
    value.schemaVersion === "large-image-ingest.domain-profile-reference.v1" &&
    isSafeId(value.name) &&
    typeof value.version === "string" && SEMVER.test(value.version) &&
    isRecord(value.effectivePolicyDigest) &&
    value.effectivePolicyDigest.algorithm === "sha256" &&
    typeof value.effectivePolicyDigest.value === "string" &&
    SHA256.test(value.effectivePolicyDigest.value);
}

/** @experimental */
export function validateDomainProfileSessionBinding(
  value: unknown,
  manifestId?: string
): value is DomainProfileSessionBinding {
  return isRecord(value) &&
    value.schemaVersion === "large-image-ingest.domain-profile-binding.v1" &&
    isSafeId(value.manifestId) &&
    (manifestId === undefined || value.manifestId === manifestId) &&
    (value.result === "passed" || value.result === "passed_with_warnings") &&
    validateDomainProfileReference(value.profile);
}

export function createBundledDraft(
  id: BundledDomainProfileId
): Omit<DomainValidationProfile, "effectivePolicyDigest"> {
  const common = commonRules(id);
  if (id === "semiconductor-inspection") {
    return draftProfile(
      "semiconductor-inspection-baseline",
      "semiconductor",
      "profile.semiconductor.baseline",
      [
        ...common,
        identifierRule("metadata.lot-id", "lotId"),
        identifierRule("metadata.wafer-id", "waferId"),
        timestampRule("metadata.inspection-timestamp", "inspectionTimestamp")
      ]
    );
  }
  if (id === "microscopy-acquisition") {
    return draftProfile(
      "microscopy-acquisition-baseline",
      "microscopy",
      "profile.microscopy.baseline",
      [
        ...common,
        identifierRule("metadata.specimen-id", "specimenId"),
        identifierRule("metadata.acquisition-id", "acquisitionId"),
        identifierRule("metadata.instrument-id", "instrumentId"),
        timestampRule("metadata.acquisition-timestamp", "acquisitionTimestamp")
      ]
    );
  }
  return draftProfile(
    "satellite-imagery-baseline",
    "satellite",
    "profile.satellite.baseline",
    [
      ...common,
      identifierRule("metadata.scene-id", "sceneId"),
      identifierRule("metadata.sensor-id", "sensorId"),
      timestampRule("metadata.acquisition-timestamp", "acquisitionTimestamp"),
      {
        id: "external.coordinate-reference",
        kind: "external_evidence",
        category: "external_evidence",
        severity: "warning",
        evidenceRequirement: "external",
        unavailableBehavior: "warn",
        descriptionCode: "profile.coordinate-reference.available",
        evidenceKey: "coordinateReference"
      }
    ]
  );
}

function commonRules(id: BundledDomainProfileId): DomainValidationRule[] {
  const semiconductor = id === "semiconductor-inspection";
  const microscopy = id === "microscopy-acquisition";
  const mediaTypes = semiconductor
    ? ["image/tiff", "image/x-tiff", "image/png", "image/jpeg"]
    : ["image/tiff", "image/x-tiff"];
  const suffixes = semiconductor
    ? [".tif", ".tiff", ".png", ".jpg", ".jpeg", ".jpe"]
    : microscopy
      ? [".tif", ".tiff", ".ome.tif", ".ome.tiff", ".ome.tf2", ".ome.tf8", ".ome.btf"]
      : [".tif", ".tiff", ".geotif", ".geotiff"];
  const formats: DomainStructuralFormat[] = semiconductor
    ? ["tiff", "bigtiff", "png", "jpeg"]
    : microscopy
      ? ["tiff", "bigtiff", "ome-tiff"]
      : ["tiff", "bigtiff", "geotiff"];
  return [
    {
      id: "source.size-positive",
      kind: "source_size",
      category: "source",
      severity: "blocking",
      evidenceRequirement: "manifest",
      unavailableBehavior: "block",
      descriptionCode: "profile.source.size-positive",
      minBytes: 1
    },
    {
      id: "source.sha256-required",
      kind: "whole_file_checksum",
      category: "source",
      severity: "blocking",
      evidenceRequirement: "manifest",
      unavailableBehavior: "block",
      descriptionCode: "profile.source.sha256-required",
      algorithm: "sha256"
    },
    {
      id: "format.media-type-allowed",
      kind: "allowed_media_types",
      category: "format",
      severity: "blocking",
      evidenceRequirement: "manifest",
      unavailableBehavior: "block",
      descriptionCode: "profile.format.media-type-allowed",
      values: mediaTypes
    },
    {
      id: "format.name-suffix-allowed",
      kind: "allowed_name_suffixes",
      category: "format",
      severity: "blocking",
      evidenceRequirement: "manifest",
      unavailableBehavior: "block",
      descriptionCode: "profile.format.name-suffix-allowed",
      values: suffixes
    },
    {
      id: "format.structure-allowed",
      kind: "allowed_structural_formats",
      category: "structure",
      severity: "blocking",
      evidenceRequirement: "structural",
      unavailableBehavior: "block",
      descriptionCode: "profile.format.structure-allowed",
      values: formats
    },
    {
      id: "format.evidence-coherent",
      kind: "format_coherence",
      category: "format",
      severity: "blocking",
      evidenceRequirement: "structural",
      unavailableBehavior: "block",
      descriptionCode: "profile.format.evidence-coherent"
    },
    {
      id: "structure.dimensions-positive",
      kind: "positive_dimensions",
      category: "structure",
      severity: "blocking",
      evidenceRequirement: "structural",
      unavailableBehavior: "block",
      descriptionCode: "profile.structure.dimensions-positive"
    },
    {
      id: "structure.bit-depth-positive",
      kind: "positive_bit_depth",
      category: "structure",
      severity: "blocking",
      evidenceRequirement: "structural",
      unavailableBehavior: "warn",
      descriptionCode: "profile.structure.bit-depth-positive"
    }
  ];
}

function identifierRule(id: string, metadataKey: string): DomainValidationRule {
  return {
    id,
    kind: "metadata_identifier",
    category: "metadata",
    severity: "blocking",
    evidenceRequirement: "metadata",
    unavailableBehavior: "block",
    descriptionCode: `profile.${id}`,
    metadataKey,
    minLength: 1,
    maxLength: 256
  };
}

function timestampRule(id: string, metadataKey: string): DomainValidationRule {
  return {
    id,
    kind: "metadata_timestamp",
    category: "metadata",
    severity: "blocking",
    evidenceRequirement: "metadata",
    unavailableBehavior: "block",
    descriptionCode: `profile.${id}`,
    metadataKey,
    rejectUnknownOffset: true
  };
}

function draftProfile(
  name: string,
  domain: Exclude<DomainCategory, "organization">,
  descriptionCode: string,
  rules: DomainValidationRule[]
): Omit<DomainValidationProfile, "effectivePolicyDigest"> {
  return {
    schemaVersion: DOMAIN_PROFILE_SCHEMA_VERSION,
    name,
    version: "1.0.0",
    domain,
    descriptionCode,
    compatibility: {
      manifestSchemaVersions: ["large-image-ingest.manifest.v1"],
      libraryMajorVersions: [1]
    },
    rules
  };
}

export async function finalizeProfile(
  draft: Omit<DomainValidationProfile, "effectivePolicyDigest">
): Promise<DomainValidationProfile> {
  const cloned = structuredClone(draft);
  const digest = await sha256Canonical(cloned);
  const profile: DomainValidationProfile = {
    ...cloned,
    effectivePolicyDigest: {
      algorithm: "sha256",
      canonicalization: "rfc8785-jcs",
      value: digest
    }
  };
  const validation = await validateDomainValidationProfile(profile);
  if (!validation.ok && !(
    profile.derivation &&
    validation.issues.every((item) => item.code === "profile.derivation_invalid")
  )) {
    throw new DomainProfileError(validation.issues[0]?.code ?? "profile.structure_invalid", validation.issues);
  }
  trustedProfiles.add(profile);
  return deepFreeze(profile);
}
