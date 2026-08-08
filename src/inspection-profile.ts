import type {
  InspectionMetadataFieldRule,
  InspectionMetadataProfile,
  InspectionMetadataValidationIssue,
  InspectionMetadataValidationResult,
  ProfileIssueCode
} from "./types.js";

const PROFILE_SCHEMA_VERSION = "large-image-ingest.inspection-profile.v1" as const;
const FIELD_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;

export class InspectionProfileError extends Error {
  readonly code: ProfileIssueCode = "profile.invalid";
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "InspectionProfileError";
  }
}

export const SEMICONDUCTOR_WAFER_PROFILE_V1 = compileInspectionMetadataProfile({
  schemaVersion: PROFILE_SCHEMA_VERSION,
  id: "semiconductor-wafer",
  version: "1.0.0",
  description: "Core lot, wafer, inspection, and tool identity for semiconductor inspection artifacts.",
  fields: [
    identifierField("lotId"),
    identifierField("waferId"),
    identifierField("inspectionId"),
    identifierField("toolId"),
    { ...identifierField("recipeId"), required: false }
  ]
});

export const INDUSTRIAL_INSPECTION_PROFILE_V1 = compileInspectionMetadataProfile({
  schemaVersion: PROFILE_SCHEMA_VERSION,
  id: "industrial-inspection",
  version: "1.0.0",
  description: "Core inspection, asset, capture-time, and optional station identity.",
  fields: [
    identifierField("inspectionId"),
    identifierField("assetId"),
    {
      key: "capturedAt",
      required: true,
      type: "string",
      minLength: 20,
      maxLength: 35,
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$"
    },
    { ...identifierField("stationId"), required: false }
  ]
});

export function compileInspectionMetadataProfile(value: unknown): InspectionMetadataProfile {
  if (!isRecord(value) || value.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    throw invalidProfile();
  }
  if (
    !hasOnlyKeys(value, ["schemaVersion", "id", "version", "description", "fields"]) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.version) ||
    (value.description !== undefined && typeof value.description !== "string") ||
    !Array.isArray(value.fields) ||
    value.fields.length === 0
  ) {
    throw invalidProfile();
  }

  const keys = new Set<string>();
  const fields = value.fields.map((field) => {
    const normalized = compileField(field);
    if (keys.has(normalized.key)) throw invalidProfile();
    keys.add(normalized.key);
    return normalized;
  });
  const profile: InspectionMetadataProfile = {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id: value.id,
    version: value.version,
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    fields
  };
  return deepFreeze(profile);
}

export function validateInspectionMetadata(
  metadata: unknown,
  profile: InspectionMetadataProfile
): InspectionMetadataValidationResult {
  const compiled = compileInspectionMetadataProfile(profile);
  const issues: InspectionMetadataValidationIssue[] = [];
  if (!isRecord(metadata)) {
    issues.push(issue("profile.field_type", "$"));
  } else {
    for (const rule of compiled.fields) validateField(metadata, rule, issues);
  }
  issues.sort(compareIssues);
  return deepFreeze({
    ok: issues.length === 0,
    profileId: compiled.id,
    profileVersion: compiled.version,
    issues
  });
}

function compileField(value: unknown): InspectionMetadataFieldRule {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "key", "required", "type", "minLength", "maxLength", "minimum", "maximum", "enum", "pattern"
  ])) throw invalidProfile();
  if (
    typeof value.key !== "string" || !FIELD_KEY_PATTERN.test(value.key) ||
    !isScalarType(value.type) ||
    (value.required !== undefined && typeof value.required !== "boolean") ||
    (value.minLength !== undefined && !isNonNegativeSafeInteger(value.minLength)) ||
    (value.maxLength !== undefined && !isNonNegativeSafeInteger(value.maxLength)) ||
    (value.minimum !== undefined && !isFiniteNumber(value.minimum)) ||
    (value.maximum !== undefined && !isFiniteNumber(value.maximum)) ||
    (value.pattern !== undefined && !isSafeAnchoredPattern(value.pattern))
  ) throw invalidProfile();

  if (
    (value.minLength !== undefined || value.maxLength !== undefined || value.pattern !== undefined) &&
    value.type !== "string"
  ) throw invalidProfile();
  if ((value.minimum !== undefined || value.maximum !== undefined) && !isNumericType(value.type)) {
    throw invalidProfile();
  }
  if (
    typeof value.minLength === "number" && typeof value.maxLength === "number" &&
    value.minLength > value.maxLength
  ) throw invalidProfile();
  if (
    typeof value.minimum === "number" && typeof value.maximum === "number" &&
    value.minimum > value.maximum
  ) throw invalidProfile();

  let enumValues: readonly (string | number | boolean)[] | undefined;
  if (value.enum !== undefined) {
    if (!Array.isArray(value.enum) || value.enum.length === 0) throw invalidProfile();
    const serialized = new Set<string>();
    const normalized: (string | number | boolean)[] = [];
    for (const candidate of value.enum) {
      if (!matchesScalarType(candidate, value.type)) throw invalidProfile();
      const identity = `${typeof candidate}:${String(candidate)}`;
      if (serialized.has(identity)) throw invalidProfile();
      serialized.add(identity);
      normalized.push(candidate);
    }
    enumValues = normalized;
  }

  return {
    key: value.key,
    type: value.type,
    ...(value.required !== undefined ? { required: value.required } : {}),
    ...(typeof value.minLength === "number" ? { minLength: value.minLength } : {}),
    ...(typeof value.maxLength === "number" ? { maxLength: value.maxLength } : {}),
    ...(typeof value.minimum === "number" ? { minimum: value.minimum } : {}),
    ...(typeof value.maximum === "number" ? { maximum: value.maximum } : {}),
    ...(enumValues ? { enum: enumValues } : {}),
    ...(typeof value.pattern === "string" ? { pattern: value.pattern } : {})
  };
}

function validateField(
  metadata: Record<string, unknown>,
  rule: InspectionMetadataFieldRule,
  issues: InspectionMetadataValidationIssue[]
): void {
  const path = `metadata.${rule.key}`;
  const value = metadata[rule.key];
  if (value === undefined) {
    if (rule.required === true) issues.push(issue("profile.field_missing", path));
    return;
  }
  if (!matchesScalarType(value, rule.type)) {
    issues.push(issue("profile.field_type", path));
    return;
  }
  if (typeof value === "string") {
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      issues.push(issue("profile.field_min_length", path));
    }
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      issues.push(issue("profile.field_max_length", path));
    }
    if (rule.pattern !== undefined && !new RegExp(rule.pattern, "u").test(value)) {
      issues.push(issue("profile.field_pattern", path));
    }
  }
  if (typeof value === "number") {
    if (rule.minimum !== undefined && value < rule.minimum) {
      issues.push(issue("profile.field_min_value", path));
    }
    if (rule.maximum !== undefined && value > rule.maximum) {
      issues.push(issue("profile.field_max_value", path));
    }
  }
  if (rule.enum && !rule.enum.some((candidate) => Object.is(candidate, value))) {
    issues.push(issue("profile.field_enum", path));
  }
}

function identifierField(key: string): InspectionMetadataFieldRule {
  return {
    key,
    required: true,
    type: "string",
    minLength: 1,
    maxLength: 128,
    pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"
  };
}

function issue(code: ProfileIssueCode, path: string): InspectionMetadataValidationIssue {
  return { code, path, severity: "error" };
}

function compareIssues(
  left: InspectionMetadataValidationIssue,
  right: InspectionMetadataValidationIssue
): number {
  return left.path.localeCompare(right.path) || left.code.localeCompare(right.code);
}

function invalidProfile(): InspectionProfileError {
  return new InspectionProfileError("The inspection metadata profile is invalid.");
}

function isSafeAnchoredPattern(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 256 || !value.startsWith("^") || !value.endsWith("$")) {
    return false;
  }
  if (/\\[1-9]|\(\?[=!<]|\([^)]*[+*][^)]*\)[+*?{]/u.test(value)) return false;
  try {
    void new RegExp(value, "u");
    return true;
  } catch {
    return false;
  }
}

function matchesScalarType(value: unknown, type: unknown): value is string | number | boolean {
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "number") return isFiniteNumber(value);
  if (type === "integer") return typeof value === "number" && Number.isSafeInteger(value);
  return false;
}

function isScalarType(value: unknown): value is InspectionMetadataFieldRule["type"] {
  return value === "string" || value === "number" || value === "integer" || value === "boolean";
}

function isNumericType(value: unknown): boolean {
  return value === "number" || value === "integer";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
