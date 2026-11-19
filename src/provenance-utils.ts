// Part of provenance.ts, split out to keep modules under 500 lines; public exports stay on provenance.ts.
import type { ProvenanceIssue, ProvenanceIssueCode } from "./provenance.js";

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function isSafeAnnotation(value: unknown): value is string {
  return typeof value === "string" && value.length <= 256 &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !/https?:\/\/|authorization|credential\s*=|token\s*=|password\s*=|^\/|^[a-z]:\\|\.\.[\\/]/i.test(value);
}

export function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function issue(code: ProvenanceIssueCode, path?: string): ProvenanceIssue {
  return { code, ...(path ? { path: safePath(path) } : {}) };
}

export function structure(path: string): ProvenanceIssue {
  return issue("provenance.structure_invalid", path);
}

export function disclosure(path: string): ProvenanceIssue {
  return issue("provenance.disclosure_invalid", path);
}

export function relationship(path: string): ProvenanceIssue {
  return issue("provenance.relationship_mismatch", path);
}

export function safePath(path: string): string {
  const normalized = path.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 128);
  return /^[a-z0-9]/.test(normalized) ? normalized : "artifact";
}

export function dedupeIssues(issues: readonly ProvenanceIssue[]): ProvenanceIssue[] {
  const seen = new Set<string>();
  return issues.filter((current) => {
    const key = JSON.stringify(current);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export function createId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ? `${prefix}-${random}` : `${prefix}-${Date.now().toString(36)}`;
}

export function safeProvenanceMessage(code: ProvenanceIssueCode): string {
  switch (code) {
    case "provenance.persistence_failed": return "Ingest provenance persistence failed.";
    case "provenance.artifact_invalid": return "Ingest provenance artifact is invalid.";
    default: return "Ingest provenance input is invalid.";
  }
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
