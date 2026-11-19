// Part of conformance.ts, split out to keep modules under 500 lines; public exports stay on conformance.ts.
import type { TransportConformanceCapabilities, TransportConformanceCapability, TransportConformanceCleanupStatus, TransportConformanceCleanupSummary, TransportConformanceEvidence, TransportConformanceIssue, TransportConformanceIssueCode, TransportConformanceObservation, TransportConformanceOverallStatus, TransportConformanceReconciliationOutcome, TransportConformanceScenarioId, TransportConformanceScenarioResult, TransportConformanceScenarioStatus, TransportConformanceSkip, TransportConformanceTargetProfile } from "./conformance.js";
import { evaluateScenario, validateObservation } from "./conformance-transport.js";
import { workflowScenario } from "./conformance-workflow.js";
import { CAPABILITY_KEYS, CLEANUP_STATUSES, EVIDENCE_FIELDS, RECONCILIATION_OUTCOMES, RESULT_STATUSES, SAFE_SLUG, SCENARIOS } from "./conformance-shared.js";

export function validateResults(
  value: unknown,
  issues: TransportConformanceIssue[]
): TransportConformanceScenarioResult[] | undefined {
  if (!Array.isArray(value) || value.length !== SCENARIOS.length) {
    issues.push(reportIssue("results"));
    return undefined;
  }
  const results: TransportConformanceScenarioResult[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const candidate = value[index];
    const expectedScenario = SCENARIOS[index];
    if (!isRecord(candidate) || !expectedScenario) {
      issues.push(reportIssue("results"));
      continue;
    }
    requireExactKeys(candidate, [
      "scenarioId",
      "status",
      "diagnosticCategory",
      "durationMs",
      "cleanupStatus",
      "limitationCodes",
      "evidence"
    ], issues, "results", "conformance.report_invalid", true);
    if (candidate.scenarioId !== expectedScenario.id) issues.push(reportIssue("results"));
    if (!RESULT_STATUSES.has(candidate.status as TransportConformanceScenarioStatus)) issues.push(reportIssue("results"));
    if (!isNonNegativeNumber(candidate.durationMs)) issues.push(reportIssue("results"));
    if (!CLEANUP_STATUSES.has(candidate.cleanupStatus as TransportConformanceCleanupStatus)) issues.push(reportIssue("results"));
    if (!validateSlugArray(candidate.limitationCodes, 32)) issues.push(reportIssue("results"));
    if (candidate.diagnosticCategory !== undefined && !isSafeSlug(candidate.diagnosticCategory)) issues.push(reportIssue("results"));
    const observation = isRecord(candidate.evidence)
      ? { ...candidate.evidence, cleanupStatus: candidate.cleanupStatus }
      : candidate.evidence;
    if (validateObservation(observation).length > 0) issues.push(reportIssue("results"));
    if (candidate.status === "passed" && isRecord(observation) && !evaluateScenario(
      expectedScenario,
      observation as TransportConformanceObservation,
      // Capability-conditioned checks are repeated later with the actual report capabilities.
      { resumable: false, snapshotResume: false, persistentResume: false, abortable: false, expirationAware: false, parallelChunks: false, chunkIntegrity: false }
    )) {
      issues.push(reportIssue("results"));
    }
    results.push(candidate as unknown as TransportConformanceScenarioResult);
  }
  const ids = results.map(({ scenarioId }) => scenarioId);
  if (new Set(ids).size !== SCENARIOS.length) issues.push(reportIssue("results"));
  return results.length === SCENARIOS.length ? results : undefined;
}

export function validateDeclaredIssues(
  value: unknown,
  issues: TransportConformanceIssue[]
): TransportConformanceIssue[] {
  if (!Array.isArray(value) || value.length > 64) {
    issues.push(reportIssue("issues"));
    return [];
  }
  const declared: TransportConformanceIssue[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      issues.push(reportIssue("issues"));
      continue;
    }
    requireExactKeys(item, ["code", "path", "scenarioId", "capability"], issues, "issues", "conformance.report_invalid", true);
    if (item.code !== "conformance.capability_unproven") issues.push(reportIssue("issues"));
    if (item.path !== undefined && !isSafeSlug(item.path)) issues.push(reportIssue("issues"));
    if (item.scenarioId !== undefined && !SCENARIOS.some(({ id }) => id === item.scenarioId)) issues.push(reportIssue("issues"));
    if (item.capability !== undefined && !CAPABILITY_KEYS.includes(item.capability as TransportConformanceCapability)) issues.push(reportIssue("issues"));
    declared.push(item as unknown as TransportConformanceIssue);
  }
  return declared;
}

export function validateCleanupSummary(
  value: unknown,
  issues: TransportConformanceIssue[]
): TransportConformanceCleanupSummary | undefined {
  if (!isRecord(value)) {
    issues.push(reportIssue("cleanup"));
    return undefined;
  }
  requireExactKeys(value, ["status", "abandonedResourceCount"], issues, "cleanup");
  if (!CLEANUP_STATUSES.has(value.status as TransportConformanceCleanupStatus)) issues.push(reportIssue("cleanup"));
  if (!isNonNegativeInteger(value.abandonedResourceCount)) issues.push(reportIssue("cleanup"));
  return { status: value.status as TransportConformanceCleanupStatus, abandonedResourceCount: value.abandonedResourceCount as number };
}

export function pickEvidence(value: TransportConformanceObservation | TransportConformanceSkip): TransportConformanceEvidence {
  const evidence: Record<string, unknown> = {};
  for (const field of EVIDENCE_FIELDS) {
    if (field in value && value[field as keyof typeof value] !== undefined) {
      const fieldValue = value[field as keyof typeof value];
      evidence[field] = Array.isArray(fieldValue) ? [...fieldValue] : fieldValue;
    }
  }
  return evidence as TransportConformanceEvidence;
}

export function aggregateCleanup(results: readonly TransportConformanceScenarioResult[]): TransportConformanceCleanupSummary {
  const statuses = results.map(({ cleanupStatus }) => cleanupStatus);
  const status: TransportConformanceCleanupStatus = statuses.includes("failed")
    ? "failed"
    : statuses.includes("abandoned_identifiable")
      ? "abandoned_identifiable"
      : statuses.includes("completed")
        ? "completed"
        : "not_required";
  return {
    status,
    abandonedResourceCount: results.reduce(
      (total, result) => total + (result.evidence.abandonedResourceCount ?? 0),
      0
    )
  };
}

export function deriveOverallStatus(
  results: readonly TransportConformanceScenarioResult[],
  issues: readonly TransportConformanceIssue[]
): TransportConformanceOverallStatus {
  if (issues.length > 0 || results.some(({ status }) => status === "failed")) return "non_conformant";
  if (results.some(({ status }) => status === "skipped")) return "incomplete";
  return "conformant";
}

export function skippedResult(
  scenarioId: TransportConformanceScenarioId,
  limitation: string
): TransportConformanceScenarioResult {
  return {
    scenarioId,
    status: "skipped",
    diagnosticCategory: "conformance.scenario_skipped",
    durationMs: 0,
    cleanupStatus: "not_required",
    limitationCodes: [limitation],
    evidence: {}
  };
}

export function invalidObservationResult(
  scenarioId: TransportConformanceScenarioId,
  durationMs: number
): TransportConformanceScenarioResult {
  return {
    scenarioId,
    status: "failed",
    diagnosticCategory: "conformance.observation_invalid",
    durationMs,
    cleanupStatus: "not_required",
    limitationCodes: [],
    evidence: {}
  };
}

export function capabilityIssue(
  capability: TransportConformanceCapability,
  scenarioId?: TransportConformanceScenarioId
): TransportConformanceIssue {
  return {
    code: "conformance.capability_unproven",
    capability,
    ...(scenarioId ? { scenarioId } : {})
  };
}

export function targetIssue(path?: string): TransportConformanceIssue {
  return { code: "conformance.target_invalid", ...(path ? { path } : {}) };
}

export function observationIssue(scenarioId?: TransportConformanceScenarioId): TransportConformanceIssue {
  return {
    code: "conformance.observation_invalid",
    ...(scenarioId ? { scenarioId } : {})
  };
}

export function reportIssue(path?: string): TransportConformanceIssue {
  return { code: "conformance.report_invalid", ...(path ? { path } : {}) };
}

export function requireExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  issues: TransportConformanceIssue[],
  path: string,
  code: TransportConformanceIssueCode = "conformance.report_invalid",
  optionalAllowed = false
): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) {
    issues.push({ code, path });
  }
  if (!optionalAllowed && allowed.some((key) => !(key in value))) {
    issues.push({ code, path });
  }
}

export function isSkip(value: TransportConformanceObservation | TransportConformanceSkip): value is TransportConformanceSkip {
  return isRecord(value) && value.status === "skipped";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSafeSlug(value: unknown): value is string {
  return typeof value === "string" && SAFE_SLUG.test(value);
}

export function validateSlugArray(value: unknown, max: number): value is string[] {
  return Array.isArray(value) && value.length <= max &&
    value.every(isSafeSlug) && new Set(value).size === value.length;
}

export function validateReconciliationOutcomes(value: unknown): value is TransportConformanceReconciliationOutcome[] {
  return Array.isArray(value) && value.length <= RECONCILIATION_OUTCOMES.size &&
    value.every((item) => RECONCILIATION_OUTCOMES.has(item as TransportConformanceReconciliationOutcome)) &&
    new Set(value).size === value.length;
}

export function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function isCapabilities(value: unknown): value is TransportConformanceCapabilities {
  return isRecord(value) && CAPABILITY_KEYS.every((key) => typeof value[key] === "boolean");
}

export function cloneProfile(profile: TransportConformanceTargetProfile): TransportConformanceTargetProfile {
  return {
    ...profile,
    environment: { ...profile.environment },
    configurationCategories: [...profile.configurationCategories]
  };
}

export function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function createReportId(): string {
  const random = globalThis.crypto?.randomUUID?.().toLowerCase();
  return random ? `report-${random}` : `report-${Date.now().toString(36)}`;
}

export function monotonicNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function sameIssues(
  left: readonly TransportConformanceIssue[],
  right: readonly TransportConformanceIssue[]
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function sameCleanup(
  left: TransportConformanceCleanupSummary,
  right: TransportConformanceCleanupSummary
): boolean {
  return left.status === right.status && left.abandonedResourceCount === right.abandonedResourceCount;
}

export function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function dedupeIssues(issues: readonly TransportConformanceIssue[]): TransportConformanceIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = JSON.stringify(issue);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function toSafeCapabilityId(capability: TransportConformanceCapability): string {
  return capability.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function safeErrorMessage(code: TransportConformanceIssueCode): string {
  switch (code) {
    case "conformance.target_invalid": return "Transport conformance target is invalid.";
    case "conformance.report_invalid": return "Transport conformance report is invalid.";
    default: return "Transport conformance execution failed.";
  }
}

export const RESULT_OVERALL_STATUSES = new Set<TransportConformanceOverallStatus>([
  "conformant",
  "non_conformant",
  "incomplete"
]);

/** @experimental */
export const WORKFLOW_CONFORMANCE_CATALOG_VERSION =
  "large-image-ingest.workflow-conformance-catalog.v1" as const;
/** @experimental */
export const WORKFLOW_CONFORMANCE_REPORT_VERSION =
  "large-image-ingest.workflow-conformance-report.v1" as const;

export type WorkflowConformanceScenarioId =
  | "authority.ordered-success"
  | "source.mismatch-before-mutation"
  | "recovery.restart-from-authority"
  | "verification.failure-preserves-transfer"
  | "evidence.lost-ack-reconciled"
  | "preservation.finalization-does-not-repeat-handoff"
  | "diagnostics.restricted-values-absent";

export interface WorkflowConformanceScenario {
  readonly id: WorkflowConformanceScenarioId;
  readonly requiredObservations: readonly (keyof WorkflowConformanceObservation)[];
}

export interface WorkflowConformanceObservation {
  authorityOrderValid?: boolean;
  exactSourcePreserved?: boolean;
  rejectedBeforeRemoteMutation?: boolean;
  restartedFromLastAuthority?: boolean;
  uploadRepeated?: boolean;
  transferAuthorityPreserved?: boolean;
  evidenceReconciled?: boolean;
  handoffRepeatedDuringFinalization?: boolean;
  restrictedValuesAbsent?: boolean;
}

export interface WorkflowConformanceTarget {
  readonly targetId: string;
  readonly targetClass: "credential-free-representative" | "real-deployment";
  runScenario(input: {
    scenario: WorkflowConformanceScenario;
    signal: AbortSignal;
  }): Promise<WorkflowConformanceObservation>;
}

export interface WorkflowConformanceScenarioResult {
  readonly scenarioId: WorkflowConformanceScenarioId;
  readonly status: "passed" | "failed" | "skipped";
  readonly issueCodes: readonly ("workflow-conformance.invariant-failed" | "workflow-conformance.execution-failed")[];
}

export interface WorkflowConformanceReportV1 {
  readonly schemaVersion: typeof WORKFLOW_CONFORMANCE_REPORT_VERSION;
  readonly catalogVersion: typeof WORKFLOW_CONFORMANCE_CATALOG_VERSION;
  readonly libraryVersion: string;
  readonly targetId: string;
  readonly targetClass: WorkflowConformanceTarget["targetClass"];
  readonly results: readonly WorkflowConformanceScenarioResult[];
  readonly status: "conformant" | "non_conformant" | "incomplete";
}

export const WORKFLOW_SCENARIOS: readonly WorkflowConformanceScenario[] = [
  workflowScenario("authority.ordered-success", ["authorityOrderValid", "exactSourcePreserved"]),
  workflowScenario("source.mismatch-before-mutation", ["rejectedBeforeRemoteMutation"]),
  workflowScenario("recovery.restart-from-authority", ["restartedFromLastAuthority", "uploadRepeated"]),
  workflowScenario("verification.failure-preserves-transfer", ["transferAuthorityPreserved", "uploadRepeated"]),
  workflowScenario("evidence.lost-ack-reconciled", ["evidenceReconciled"]),
  workflowScenario("preservation.finalization-does-not-repeat-handoff", ["handoffRepeatedDuringFinalization"]),
  workflowScenario("diagnostics.restricted-values-absent", ["restrictedValuesAbsent"])
];

/** @experimental */
export const WORKFLOW_CONFORMANCE_CATALOG = Object.freeze({
  schemaVersion: WORKFLOW_CONFORMANCE_CATALOG_VERSION,
  scenarios: Object.freeze(WORKFLOW_SCENARIOS)
});
