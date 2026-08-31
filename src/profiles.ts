import { calculateChecksum } from "./checksum.js";
import { canonicalizeProvenanceJson } from "./provenance.js";
import type {
  DomainProfileReference,
  DomainProfileSessionBinding,
  IngestFileLike,
  IngestManifest
} from "./types.js";

export type {
  DomainProfileReference,
  DomainProfileSessionBinding
} from "./types.js";

export const DOMAIN_PROFILE_SCHEMA_VERSION = "large-image-ingest.domain-profile.v1" as const;
export const DOMAIN_PROFILE_EVALUATION_SCHEMA_VERSION =
  "large-image-ingest.domain-profile-evaluation.v1" as const;

export type BundledDomainProfileId =
  | "semiconductor-inspection"
  | "microscopy-acquisition"
  | "satellite-imagery";
export type DomainCategory = "semiconductor" | "microscopy" | "satellite" | "organization";
export type DomainRuleSeverity = "blocking" | "warning";
export type DomainUnavailableBehavior = "block" | "warn" | "not_applicable";
export type DomainEvidenceSource =
  | "manifest"
  | "sdk_observed"
  | "caller_supplied"
  | "external_attested"
  | "none";
export type DomainRuleOutcome =
  | "pass"
  | "warning"
  | "blocking_failure"
  | "not_applicable"
  | "unavailable_evidence"
  | "invalid_configuration";
export type DomainProfileResult =
  | "passed"
  | "passed_with_warnings"
  | "failed"
  | "invalid_configuration";
export type DomainExceptionRationaleCategory =
  | "proprietary-format"
  | "external-evidence-authority"
  | "legacy-instrument"
  | "organization-risk-acceptance";

export interface DomainRuleBase {
  id: string;
  category:
    | "source"
    | "format"
    | "structure"
    | "metadata"
    | "external_evidence";
  severity: DomainRuleSeverity;
  evidenceRequirement: "manifest" | "structural" | "metadata" | "external";
  unavailableBehavior: DomainUnavailableBehavior;
  descriptionCode: string;
}

export type DomainValidationRule =
  | (DomainRuleBase & {
      kind: "source_size";
      minBytes: number;
      maxBytes?: number;
    })
  | (DomainRuleBase & {
      kind: "whole_file_checksum";
      algorithm: "sha256";
    })
  | (DomainRuleBase & {
      kind: "allowed_media_types";
      values: readonly string[];
    })
  | (DomainRuleBase & {
      kind: "allowed_name_suffixes";
      values: readonly string[];
    })
  | (DomainRuleBase & {
      kind: "allowed_structural_formats";
      values: readonly DomainStructuralFormat[];
    })
  | (DomainRuleBase & { kind: "format_coherence" })
  | (DomainRuleBase & { kind: "positive_dimensions" })
  | (DomainRuleBase & { kind: "positive_bit_depth" })
  | (DomainRuleBase & {
      kind: "metadata_identifier";
      metadataKey: string;
      minLength: number;
      maxLength: number;
    })
  | (DomainRuleBase & {
      kind: "metadata_timestamp";
      metadataKey: string;
      rejectUnknownOffset: true;
    })
  | (DomainRuleBase & {
      kind: "external_evidence";
      evidenceKey: string;
    });

export type DomainStructuralFormat =
  | "tiff"
  | "bigtiff"
  | "png"
  | "jpeg"
  | "ome-tiff"
  | "geotiff"
  | "proprietary";

export interface DomainProfileCompatibility {
  manifestSchemaVersions: readonly ["large-image-ingest.manifest.v1"];
  libraryMajorVersions: readonly [1];
}

export interface DomainProfileDerivation {
  base: DomainProfileReference;
  ancestry: readonly DomainProfileReference[];
  addedRuleIds: readonly string[];
  tightenedRuleIds: readonly string[];
  metadataMappings: Readonly<Record<string, string>>;
  exceptions: readonly {
    ruleId: string;
    action: "replace" | "disable";
    rationaleCategory: DomainExceptionRationaleCategory;
  }[];
}

export interface DomainValidationProfile {
  schemaVersion: typeof DOMAIN_PROFILE_SCHEMA_VERSION;
  name: string;
  version: string;
  domain: DomainCategory;
  descriptionCode: string;
  compatibility: DomainProfileCompatibility;
  rules: readonly DomainValidationRule[];
  derivation?: DomainProfileDerivation;
  effectivePolicyDigest: {
    algorithm: "sha256";
    canonicalization: "rfc8785-jcs";
    value: string;
  };
}

export interface DomainStructuralEvidence {
  source: "sdk_observed" | "caller_supplied" | "external_attested";
  format?: DomainStructuralFormat;
  width?: number;
  height?: number;
  bitDepth?: number;
}

export interface DomainExternalEvidenceItem {
  source: "caller_supplied" | "external_attested";
  present: boolean;
}

export interface EvaluateDomainValidationProfileInput {
  profile: DomainValidationProfile | unknown;
  manifest: IngestManifest;
  structuralEvidence?: DomainStructuralEvidence;
  externalEvidence?: Readonly<Record<string, DomainExternalEvidenceItem>>;
  evaluatedAt?: string;
  baseProfile?: DomainValidationProfile;
}

export interface DomainRuleEvaluation {
  ruleId: string;
  category: DomainRuleBase["category"];
  severity: DomainRuleSeverity;
  evidenceSource: DomainEvidenceSource;
  outcome: DomainRuleOutcome;
  descriptionCode: string;
  code: string;
}

export interface DomainProfileEvaluation {
  schemaVersion: typeof DOMAIN_PROFILE_EVALUATION_SCHEMA_VERSION;
  profile: DomainProfileReference;
  manifestId: string;
  evaluatedAt: string;
  result: DomainProfileResult;
  outcomes: readonly DomainRuleEvaluation[];
  failedRuleCodes: readonly string[];
  warningRuleCodes: readonly string[];
  sessionBinding?: DomainProfileSessionBinding;
}

export type DomainProfileIssueCode =
  | "profile.structure_invalid"
  | "profile.schema_unsupported"
  | "profile.identity_invalid"
  | "profile.compatibility_invalid"
  | "profile.rule_invalid"
  | "profile.rule_duplicate"
  | "profile.digest_mismatch"
  | "profile.derivation_invalid"
  | "profile.derivation_cycle"
  | "profile.mapping_invalid"
  | "profile.tightening_invalid"
  | "profile.exception_invalid"
  | "profile.evaluation_invalid"
  | "profile.binding_invalid";

export interface DomainProfileIssue {
  code: DomainProfileIssueCode;
  ruleId?: string;
}

export interface DomainProfileValidationResult {
  ok: boolean;
  issues: readonly DomainProfileIssue[];
  profile?: DomainValidationProfile;
}

export interface DomainProfileAvailabilityResult {
  status: "available" | "historical_unavailable" | "identity_conflict";
  reference: DomainProfileReference;
}

export interface DeriveDomainValidationProfileInput {
  base: DomainValidationProfile;
  name: string;
  version: string;
  descriptionCode: string;
  addRules?: readonly DomainValidationRule[];
  tightenRules?: readonly DomainValidationRule[];
  metadataMappings?: Readonly<Record<string, string>>;
  exceptions?: readonly {
    ruleId: string;
    action: "replace" | "disable";
    rationaleCategory: DomainExceptionRationaleCategory;
    replacement?: DomainValidationRule;
  }[];
}

export class DomainProfileError extends Error {
  readonly code: DomainProfileIssueCode;
  readonly issues: readonly DomainProfileIssue[];

  constructor(code: DomainProfileIssueCode, issues: readonly DomainProfileIssue[] = []) {
    super(safeProfileMessage(code));
    this.name = "DomainProfileError";
    this.code = code;
    this.issues = issues;
  }
}

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[a-f0-9]{64}$/;
const RFC3339 = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:(?:[0-5]\d|60)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const MAX_RULES = 128;
const MAX_MAPPINGS = 32;
const trustedProfiles = new WeakSet<DomainValidationProfile>();
const bundledCache = new Map<BundledDomainProfileId, Promise<DomainValidationProfile>>();

export async function loadBundledDomainProfile(
  id: BundledDomainProfileId
): Promise<DomainValidationProfile> {
  if (!isBundledId(id)) throw new DomainProfileError("profile.identity_invalid");
  let pending = bundledCache.get(id);
  if (!pending) {
    pending = finalizeProfile(createBundledDraft(id));
    bundledCache.set(id, pending);
  }
  return pending;
}

export function listBundledDomainProfiles(): readonly {
  id: BundledDomainProfileId;
  name: string;
  version: "1.0.0";
  domain: Exclude<DomainCategory, "organization">;
}[] {
  return deepFreeze([
    { id: "semiconductor-inspection", name: "semiconductor-inspection-baseline", version: "1.0.0", domain: "semiconductor" },
    { id: "microscopy-acquisition", name: "microscopy-acquisition-baseline", version: "1.0.0", domain: "microscopy" },
    { id: "satellite-imagery", name: "satellite-imagery-baseline", version: "1.0.0", domain: "satellite" }
  ] as const);
}

export async function validateDomainValidationProfile(
  value: unknown,
  options: { baseProfile?: DomainValidationProfile } = {}
): Promise<DomainProfileValidationResult> {
  const issues: DomainProfileIssue[] = [];
  if (!isRecord(value)) return { ok: false, issues: [issue("profile.structure_invalid")] };
  if (value.schemaVersion !== DOMAIN_PROFILE_SCHEMA_VERSION) {
    return { ok: false, issues: [issue("profile.schema_unsupported")] };
  }
  validateProfileShape(value, issues);
  if (issues.length === 0) {
    try {
      const body = withoutProfileDigest(value as unknown as DomainValidationProfile);
      const digest = await sha256Canonical(body);
      const stored = (value as unknown as DomainValidationProfile).effectivePolicyDigest.value;
      if (digest !== stored) addProfileIssue(issues, "profile.digest_mismatch");
    } catch {
      addProfileIssue(issues, "profile.digest_mismatch");
    }
  }
  if (issues.length === 0 && value.derivation !== undefined) {
    validateDerivation(value as unknown as DomainValidationProfile, options.baseProfile, issues);
  }
  const finalIssues = dedupeProfileIssues(issues);
  if (finalIssues.length > 0) return { ok: false, issues: finalIssues };
  const profile = value as unknown as DomainValidationProfile;
  return { ok: true, issues: [], profile };
}

export async function evaluateDomainValidationProfile(
  input: EvaluateDomainValidationProfileInput
): Promise<DomainProfileEvaluation> {
  const validation = await validateDomainValidationProfile(input.profile, {
    ...(input.baseProfile ? { baseProfile: input.baseProfile } : {})
  });
  const evaluatedAt = normalizeTimestamp(input.evaluatedAt ?? new Date().toISOString());
  if (!validation.ok || !validation.profile) {
    const rules = isRecord(input.profile) && Array.isArray(input.profile.rules)
      ? input.profile.rules.filter(isRecord).slice(0, MAX_RULES)
      : [];
    return deepFreeze({
      schemaVersion: DOMAIN_PROFILE_EVALUATION_SCHEMA_VERSION,
      profile: safeInvalidReference(input.profile),
      manifestId: safeManifestId(input.manifest),
      evaluatedAt,
      result: "invalid_configuration",
      outcomes: rules.map((rule, index) => ({
        ruleId: isSafeId(rule.id) ? rule.id : `invalid-rule-${index + 1}`,
        category: isRuleCategory(rule.category) ? rule.category : "source",
        severity: rule.severity === "warning" ? "warning" : "blocking",
        evidenceSource: "none",
        outcome: "invalid_configuration",
        descriptionCode: isSafeId(rule.descriptionCode) ? rule.descriptionCode : "profile.rule.invalid",
        code: "profile.rule.invalid_configuration"
      })),
      failedRuleCodes: ["profile.rule.invalid_configuration"],
      warningRuleCodes: []
    });
  }

  const profile = validation.profile;
  const outcomes = profile.rules.map((rule) => evaluateRule(rule, profile, input));
  const result = aggregateResult(outcomes);
  const reference = createDomainProfileReference(profile);
  const failedRuleCodes = outcomes
    .filter((outcome) => isBlockingOutcome(outcome))
    .map((outcome) => outcome.ruleId);
  const warningRuleCodes = outcomes
    .filter((outcome) => isWarningOutcome(outcome))
    .map((outcome) => outcome.ruleId);
  const evaluation: DomainProfileEvaluation = {
    schemaVersion: DOMAIN_PROFILE_EVALUATION_SCHEMA_VERSION,
    profile: reference,
    manifestId: input.manifest.id,
    evaluatedAt,
    result,
    outcomes,
    failedRuleCodes,
    warningRuleCodes,
    ...(result === "passed" || result === "passed_with_warnings"
      ? {
          sessionBinding: {
            schemaVersion: "large-image-ingest.domain-profile-binding.v1",
            manifestId: input.manifest.id,
            result,
            profile: reference
          }
        }
      : {})
  };
  return deepFreeze(evaluation);
}

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

function createBundledDraft(
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

async function finalizeProfile(
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

function evaluateRule(
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

function aggregateResult(outcomes: readonly DomainRuleEvaluation[]): DomainProfileResult {
  if (outcomes.some((item) => item.outcome === "invalid_configuration")) return "invalid_configuration";
  if (outcomes.some(isBlockingOutcome)) return "failed";
  if (outcomes.some(isWarningOutcome)) return "passed_with_warnings";
  return "passed";
}

function isBlockingOutcome(outcome: DomainRuleEvaluation): boolean {
  return outcome.outcome === "blocking_failure" ||
    (outcome.outcome === "unavailable_evidence" && outcome.severity === "blocking");
}

function isWarningOutcome(outcome: DomainRuleEvaluation): boolean {
  return outcome.outcome === "warning" ||
    (outcome.outcome === "unavailable_evidence" && outcome.severity === "warning");
}

function validateProfileShape(value: Record<string, any>, issues: DomainProfileIssue[]): void {
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

function validateDerivation(
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

function isProvablyTighter(base: DomainValidationRule, next: DomainValidationRule): boolean {
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

function validateMetadataMappings(
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

function withoutProfileDigest(profile: DomainValidationProfile): Omit<DomainValidationProfile, "effectivePolicyDigest"> {
  const { effectivePolicyDigest: _digest, ...body } = profile;
  return body;
}

async function sha256Canonical(value: unknown): Promise<string> {
  const canonical = canonicalizeProvenanceJson(value);
  const blob = new Blob([canonical], { type: "application/json" });
  Object.defineProperties(blob, { name: { value: "domain-profile.json" }, lastModified: { value: 0 } });
  return (await calculateChecksum(blob as IngestFileLike)).value;
}

function safeInvalidReference(value: unknown): DomainProfileReference {
  const name = isRecord(value) && isSafeId(value.name) ? value.name : "invalid-profile";
  const version = isRecord(value) && typeof value.version === "string" && SEMVER.test(value.version)
    ? value.version
    : "0.0.0";
  return {
    schemaVersion: "large-image-ingest.domain-profile-reference.v1",
    name,
    version,
    effectivePolicyDigest: { algorithm: "sha256", value: "0".repeat(64) }
  };
}

function safeManifestId(manifest: IngestManifest): string {
  return isSafeId(manifest?.id) ? manifest.id : "invalid-manifest";
}

function normalizeTimestamp(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new DomainProfileError("profile.evaluation_invalid");
  return new Date(value).toISOString();
}

function assertProfileIdentity(name: string, version: string, descriptionCode: string): void {
  if (!isSafeId(name) || !SEMVER.test(version) || !isSafeId(descriptionCode)) {
    throw new DomainProfileError("profile.identity_invalid");
  }
}

function cloneCompatibility(value: DomainProfileCompatibility): DomainProfileCompatibility {
  void value;
  return { manifestSchemaVersions: ["large-image-ingest.manifest.v1"], libraryMajorVersions: [1] };
}

function cloneRule(rule: DomainValidationRule): DomainValidationRule {
  return structuredClone(rule);
}

function stringSetIsValid(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 32 &&
    value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 128 && item === item.toLowerCase()) &&
    new Set(value).size === value.length;
}

function isStructuralFormat(value: unknown): value is DomainStructuralFormat {
  return ["tiff", "bigtiff", "png", "jpeg", "ome-tiff", "geotiff", "proprietary"].includes(String(value));
}

function isRuleCategory(value: unknown): value is DomainRuleBase["category"] {
  return ["source", "format", "structure", "metadata", "external_evidence"].includes(String(value));
}

function isDomain(value: unknown): value is DomainCategory {
  return ["semiconductor", "microscopy", "satellite", "organization"].includes(String(value));
}

function isRationaleCategory(value: unknown): value is DomainExceptionRationaleCategory {
  return ["proprietary-format", "external-evidence-authority", "legacy-instrument", "organization-risk-acceptance"]
    .includes(String(value));
}

function isBundledId(value: unknown): value is BundledDomainProfileId {
  return ["semiconductor-inspection", "microscopy-acquisition", "satellite-imagery"].includes(String(value));
}

function isSafeMetadataKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value);
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function severityRank(value: DomainRuleSeverity): number {
  return value === "blocking" ? 2 : 1;
}

function unavailableRank(value: DomainUnavailableBehavior): number {
  return value === "block" ? 3 : value === "warn" ? 2 : 1;
}

function issue(code: DomainProfileIssueCode, ruleId?: string): DomainProfileIssue {
  return { code, ...(ruleId && isSafeId(ruleId) ? { ruleId } : {}) };
}

function addProfileIssue(
  issues: DomainProfileIssue[],
  code: DomainProfileIssueCode,
  ruleId?: string
): void {
  const next = issue(code, ruleId);
  if (!issues.some((item) => item.code === next.code && item.ruleId === next.ruleId)) issues.push(next);
}

function dedupeProfileIssues(issues: readonly DomainProfileIssue[]): DomainProfileIssue[] {
  const output: DomainProfileIssue[] = [];
  for (const item of issues) addProfileIssue(output, item.code, item.ruleId);
  return output;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function safeProfileMessage(code: DomainProfileIssueCode): string {
  const messages: Partial<Record<DomainProfileIssueCode, string>> = {
    "profile.identity_invalid": "Domain profile identity is invalid.",
    "profile.digest_mismatch": "Domain profile digest is invalid.",
    "profile.derivation_cycle": "Domain profile derivation contains a cycle.",
    "profile.mapping_invalid": "Domain profile metadata mapping is invalid.",
    "profile.tightening_invalid": "Domain profile tightening is invalid.",
    "profile.exception_invalid": "Domain profile exception is invalid."
  };
  return messages[code] ?? "Domain profile is invalid.";
}
