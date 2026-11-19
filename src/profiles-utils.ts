// Part of profiles.ts, split out to keep modules under 500 lines; public exports stay on profiles.ts.
import type { DomainProfileReference, IngestManifest } from "./types.js";
import { DomainProfileError } from "./profiles.js";
import type { BundledDomainProfileId, DomainCategory, DomainExceptionRationaleCategory, DomainProfileCompatibility, DomainProfileIssue, DomainProfileIssueCode, DomainRuleBase, DomainRuleSeverity, DomainStructuralFormat, DomainUnavailableBehavior, DomainValidationRule } from "./profiles.js";
import { SAFE_ID, SEMVER } from "./profiles-shared.js";

export function safeInvalidReference(value: unknown): DomainProfileReference {
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

export function safeManifestId(manifest: IngestManifest): string {
  return isSafeId(manifest?.id) ? manifest.id : "invalid-manifest";
}

export function normalizeTimestamp(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new DomainProfileError("profile.evaluation_invalid");
  return new Date(value).toISOString();
}

export function assertProfileIdentity(name: string, version: string, descriptionCode: string): void {
  if (!isSafeId(name) || !SEMVER.test(version) || !isSafeId(descriptionCode)) {
    throw new DomainProfileError("profile.identity_invalid");
  }
}

export function cloneCompatibility(value: DomainProfileCompatibility): DomainProfileCompatibility {
  void value;
  return { manifestSchemaVersions: ["large-image-ingest.manifest.v1"], libraryMajorVersions: [1] };
}

export function cloneRule(rule: DomainValidationRule): DomainValidationRule {
  return structuredClone(rule);
}

export function stringSetIsValid(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 32 &&
    value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 128 && item === item.toLowerCase()) &&
    new Set(value).size === value.length;
}

export function isStructuralFormat(value: unknown): value is DomainStructuralFormat {
  return ["tiff", "bigtiff", "png", "jpeg", "ome-tiff", "geotiff", "proprietary"].includes(String(value));
}

export function isRuleCategory(value: unknown): value is DomainRuleBase["category"] {
  return ["source", "format", "structure", "metadata", "external_evidence"].includes(String(value));
}

export function isDomain(value: unknown): value is DomainCategory {
  return ["semiconductor", "microscopy", "satellite", "organization"].includes(String(value));
}

export function isRationaleCategory(value: unknown): value is DomainExceptionRationaleCategory {
  return ["proprietary-format", "external-evidence-authority", "legacy-instrument", "organization-risk-acceptance"]
    .includes(String(value));
}

export function isBundledId(value: unknown): value is BundledDomainProfileId {
  return ["semiconductor-inspection", "microscopy-acquisition", "satellite-imagery"].includes(String(value));
}

export function isSafeMetadataKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value);
}

export function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

export function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function severityRank(value: DomainRuleSeverity): number {
  return value === "blocking" ? 2 : 1;
}

export function unavailableRank(value: DomainUnavailableBehavior): number {
  return value === "block" ? 3 : value === "warn" ? 2 : 1;
}

export function issue(code: DomainProfileIssueCode, ruleId?: string): DomainProfileIssue {
  return { code, ...(ruleId && isSafeId(ruleId) ? { ruleId } : {}) };
}

export function addProfileIssue(
  issues: DomainProfileIssue[],
  code: DomainProfileIssueCode,
  ruleId?: string
): void {
  const next = issue(code, ruleId);
  if (!issues.some((item) => item.code === next.code && item.ruleId === next.ruleId)) issues.push(next);
}

export function dedupeProfileIssues(issues: readonly DomainProfileIssue[]): DomainProfileIssue[] {
  const output: DomainProfileIssue[] = [];
  for (const item of issues) addProfileIssue(output, item.code, item.ruleId);
  return output;
}

export function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function safeProfileMessage(code: DomainProfileIssueCode): string {
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
