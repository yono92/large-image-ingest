import type { DomainProfileReference, DomainProfileSessionBinding, IngestManifest } from "./types.js";
export type {
  DomainProfileReference,
  DomainProfileSessionBinding
} from "./types.js";
import { createBundledDraft, createDomainProfileReference, finalizeProfile } from "./profiles-reference.js";
import { aggregateResult, evaluateRule, isBlockingOutcome, isWarningOutcome, sha256Canonical, validateDerivation, validateProfileShape, withoutProfileDigest } from "./profiles-evaluation.js";
import { addProfileIssue, dedupeProfileIssues, deepFreeze, isBundledId, isRecord, isRuleCategory, isSafeId, issue, normalizeTimestamp, safeInvalidReference, safeManifestId, safeProfileMessage } from "./profiles-utils.js";
import { MAX_RULES } from "./profiles-shared.js";
export { deriveDomainValidationProfile, createDomainProfileReference, domainProfileReferencesEqual, classifyDomainProfileReferenceAvailability, validateDomainProfileReference, validateDomainProfileSessionBinding } from "./profiles-reference.js";

/** @experimental */
export const DOMAIN_PROFILE_SCHEMA_VERSION = "large-image-ingest.domain-profile.v1" as const;
/** @experimental */
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

/** @experimental */
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
const bundledCache = new Map<BundledDomainProfileId, Promise<DomainValidationProfile>>();

/** @experimental */
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

/** @experimental */
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

/** @experimental */
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

/** @experimental */
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
