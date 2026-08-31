import { PACKAGE_VERSION } from "./package-version.js";

export const TRANSPORT_CONFORMANCE_CATALOG_VERSION =
  "large-image-ingest.transport-conformance-catalog.v1" as const;
export const TRANSPORT_CONFORMANCE_REPORT_VERSION =
  "large-image-ingest.transport-conformance-report.v1" as const;

export type TransportConformanceCatalogVersion =
  typeof TRANSPORT_CONFORMANCE_CATALOG_VERSION;
export type TransportConformanceReportVersion =
  typeof TRANSPORT_CONFORMANCE_REPORT_VERSION;

export type TransportConformanceScenarioId =
  | "source.validation-before-mutation"
  | "source.mismatch-before-mutation"
  | "recovery.interrupted-no-retransmit"
  | "recovery.invalid-evidence-rejected"
  | "recovery.session-reconciliation"
  | "completion.stored-original-verified"
  | "completion.ambiguous-result-reconciled"
  | "cancellation.abandoned-session-reported"
  | "cleanup.failure-after-completion-isolated"
  | "integrity.chunk-evidence-enforced";

export type TransportConformanceCategory = "s3-multipart" | "tus" | "nas";
export type TransportConformanceTargetClass =
  | "credential-free-representative"
  | "real-deployment";
export type TransportConformanceScenarioStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "unsupported";
export type TransportConformanceOverallStatus =
  | "conformant"
  | "non_conformant"
  | "incomplete";
export type TransportConformanceCleanupStatus =
  | "not_required"
  | "completed"
  | "failed"
  | "abandoned_identifiable";
export type TransportConformanceReconciliationOutcome =
  | "matched"
  | "missing"
  | "expired"
  | "local_ahead"
  | "remote_ahead"
  | "unverifiable";
export type TransportConformanceCapability = keyof TransportConformanceCapabilities;
export type TransportConformanceIssueCode =
  | "conformance.target_invalid"
  | "conformance.observation_invalid"
  | "conformance.invariant_failed"
  | "conformance.scenario_skipped"
  | "conformance.execution_failed"
  | "conformance.capability_unproven"
  | "conformance.report_invalid";

export interface TransportConformanceCapabilities {
  resumable: boolean;
  snapshotResume: boolean;
  persistentResume: boolean;
  abortable: boolean;
  expirationAware: boolean;
  parallelChunks: boolean;
  chunkIntegrity: boolean;
}

export interface TransportConformanceEnvironment {
  runtime: string;
  os: string;
  architecture: string;
}

export interface TransportConformanceTargetProfile {
  profileId: string;
  transportCategory: TransportConformanceCategory;
  targetClass: TransportConformanceTargetClass;
  environment: TransportConformanceEnvironment;
  configurationCategories: readonly string[];
}

export interface TransportConformanceObservation {
  sourceValidationRejected?: boolean;
  sourceIdentityEstablished?: boolean;
  sourceMismatchDetected?: boolean;
  sourceBytesUnchanged?: boolean;
  remoteMutationCountBeforeAuthority?: number;
  remoteMutationCount?: number;
  acknowledgedBytes?: number;
  retransmittedAcknowledgedBytes?: number;
  snapshotRecoveryProven?: boolean;
  persistentRecoveryProven?: boolean;
  reconciliationOutcomes?: readonly TransportConformanceReconciliationOutcome[];
  expirationReconciliationProven?: boolean;
  invalidEvidenceRejected?: boolean;
  chunkIntegrityEvidenceValidated?: boolean;
  transferFinalized?: boolean;
  authoritativeCompletionCount?: number;
  ambiguousCompletionReconciled?: boolean;
  authoritativeCompletionPreserved?: boolean;
  storedByteCountMatched?: boolean;
  storedChecksumMatched?: boolean;
  injectedCleanupFailureObserved?: boolean;
  abandonedResourceCount?: number;
  cleanupReferenceId?: string;
  cleanupStatus?: TransportConformanceCleanupStatus;
  diagnosticCategory?: string;
  limitationCodes?: readonly string[];
  durationMs?: number;
}

export interface TransportConformanceSkip {
  status: "skipped";
  diagnosticCategory: string;
  limitationCodes?: readonly string[];
  cleanupStatus?: TransportConformanceCleanupStatus;
  abandonedResourceCount?: number;
  cleanupReferenceId?: string;
}

export interface TransportConformanceScenario {
  readonly id: TransportConformanceScenarioId;
  readonly kind: "common" | "capability";
  readonly requiredCapability?: TransportConformanceCapability;
  readonly requiredObservationFields: readonly (keyof TransportConformanceObservation)[];
}

export interface TransportConformanceCatalogV1 {
  readonly schemaVersion: TransportConformanceCatalogVersion;
  readonly scenarios: readonly TransportConformanceScenario[];
}

export type TransportConformanceEvidence = Omit<
  TransportConformanceObservation,
  "cleanupStatus" | "diagnosticCategory" | "limitationCodes" | "durationMs"
>;

export interface TransportConformanceScenarioResult {
  scenarioId: TransportConformanceScenarioId;
  status: TransportConformanceScenarioStatus;
  diagnosticCategory?: string;
  durationMs: number;
  cleanupStatus: TransportConformanceCleanupStatus;
  limitationCodes: readonly string[];
  evidence: TransportConformanceEvidence;
}

export interface TransportConformanceIssue {
  code: TransportConformanceIssueCode;
  path?: string;
  scenarioId?: TransportConformanceScenarioId;
  capability?: TransportConformanceCapability;
}

export interface TransportConformanceCleanupSummary {
  status: TransportConformanceCleanupStatus;
  abandonedResourceCount: number;
}

export interface TransportConformanceReportV1 {
  schemaVersion: TransportConformanceReportVersion;
  catalogVersion: TransportConformanceCatalogVersion;
  libraryVersion: string;
  reportId: string;
  startedAt: string;
  completedAt: string;
  target: TransportConformanceTargetProfile;
  capabilities: TransportConformanceCapabilities;
  results: readonly TransportConformanceScenarioResult[];
  issues: readonly TransportConformanceIssue[];
  overallStatus: TransportConformanceOverallStatus;
  cleanup: TransportConformanceCleanupSummary;
  limitations: readonly string[];
}

export interface TransportConformanceTarget {
  readonly profile: TransportConformanceTargetProfile;
  readonly capabilities: TransportConformanceCapabilities;
  runScenario(context: {
    scenario: TransportConformanceScenario;
    signal: AbortSignal;
  }): Promise<TransportConformanceObservation | TransportConformanceSkip>;
}

export interface RunTransportConformanceOptions {
  signal?: AbortSignal;
  reportId?: string;
  now?: () => Date;
}

export type TransportConformanceReportValidationResult =
  | { ok: true; issues: readonly []; report: TransportConformanceReportV1 }
  | { ok: false; issues: readonly TransportConformanceIssue[] };

export class TransportConformanceError extends Error {
  readonly code: TransportConformanceIssueCode;
  readonly issues: readonly TransportConformanceIssue[];

  constructor(
    code: TransportConformanceIssueCode,
    issues: readonly TransportConformanceIssue[] = []
  ) {
    super(safeErrorMessage(code));
    this.name = "TransportConformanceError";
    this.code = code;
    this.issues = issues;
  }
}

const SCENARIOS: readonly TransportConformanceScenario[] = [
  scenario("source.validation-before-mutation", [
    "sourceValidationRejected",
    "sourceBytesUnchanged",
    "remoteMutationCountBeforeAuthority"
  ]),
  scenario("source.mismatch-before-mutation", [
    "sourceMismatchDetected",
    "sourceBytesUnchanged",
    "remoteMutationCountBeforeAuthority"
  ]),
  scenario("recovery.interrupted-no-retransmit", [
    "sourceIdentityEstablished",
    "acknowledgedBytes",
    "retransmittedAcknowledgedBytes",
    "storedByteCountMatched",
    "storedChecksumMatched"
  ]),
  scenario("recovery.invalid-evidence-rejected", [
    "invalidEvidenceRejected",
    "remoteMutationCount"
  ]),
  scenario("recovery.session-reconciliation", [
    "reconciliationOutcomes",
    "remoteMutationCountBeforeAuthority"
  ]),
  scenario("completion.stored-original-verified", [
    "transferFinalized",
    "authoritativeCompletionCount",
    "storedByteCountMatched",
    "storedChecksumMatched",
    "sourceBytesUnchanged"
  ]),
  scenario("completion.ambiguous-result-reconciled", [
    "ambiguousCompletionReconciled",
    "authoritativeCompletionCount",
    "storedByteCountMatched",
    "storedChecksumMatched"
  ]),
  scenario("cancellation.abandoned-session-reported", [
    "abandonedResourceCount",
    "cleanupStatus"
  ]),
  scenario("cleanup.failure-after-completion-isolated", [
    "injectedCleanupFailureObserved",
    "authoritativeCompletionPreserved",
    "authoritativeCompletionCount",
    "storedByteCountMatched",
    "storedChecksumMatched"
  ]),
  scenario("integrity.chunk-evidence-enforced", [
    "chunkIntegrityEvidenceValidated",
    "invalidEvidenceRejected",
    "remoteMutationCountBeforeAuthority"
  ], "chunkIntegrity")
];

export const TRANSPORT_CONFORMANCE_CATALOG: TransportConformanceCatalogV1 = Object.freeze({
  schemaVersion: TRANSPORT_CONFORMANCE_CATALOG_VERSION,
  scenarios: Object.freeze(SCENARIOS)
});

const SAFE_SLUG = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const BOOLEAN_OBSERVATION_FIELDS = new Set<keyof TransportConformanceObservation>([
  "sourceValidationRejected",
  "sourceIdentityEstablished",
  "sourceMismatchDetected",
  "sourceBytesUnchanged",
  "snapshotRecoveryProven",
  "persistentRecoveryProven",
  "expirationReconciliationProven",
  "invalidEvidenceRejected",
  "chunkIntegrityEvidenceValidated",
  "transferFinalized",
  "ambiguousCompletionReconciled",
  "authoritativeCompletionPreserved",
  "storedByteCountMatched",
  "storedChecksumMatched",
  "injectedCleanupFailureObserved"
]);
const INTEGER_OBSERVATION_FIELDS = new Set<keyof TransportConformanceObservation>([
  "remoteMutationCountBeforeAuthority",
  "remoteMutationCount",
  "acknowledgedBytes",
  "retransmittedAcknowledgedBytes",
  "authoritativeCompletionCount",
  "abandonedResourceCount"
]);
const OBSERVATION_FIELDS = new Set<keyof TransportConformanceObservation>([
  ...BOOLEAN_OBSERVATION_FIELDS,
  ...INTEGER_OBSERVATION_FIELDS,
  "reconciliationOutcomes",
  "cleanupReferenceId",
  "cleanupStatus",
  "diagnosticCategory",
  "limitationCodes",
  "durationMs"
]);
const EVIDENCE_FIELDS = [...OBSERVATION_FIELDS].filter((field) => ![
  "cleanupStatus",
  "diagnosticCategory",
  "limitationCodes",
  "durationMs"
].includes(field));
const CLEANUP_STATUSES = new Set<TransportConformanceCleanupStatus>([
  "not_required",
  "completed",
  "failed",
  "abandoned_identifiable"
]);
const RECONCILIATION_OUTCOMES = new Set<TransportConformanceReconciliationOutcome>([
  "matched",
  "missing",
  "expired",
  "local_ahead",
  "remote_ahead",
  "unverifiable"
]);
const RESULT_STATUSES = new Set<TransportConformanceScenarioStatus>([
  "passed",
  "failed",
  "skipped",
  "unsupported"
]);
const CAPABILITY_KEYS: readonly TransportConformanceCapability[] = [
  "resumable",
  "snapshotResume",
  "persistentResume",
  "abortable",
  "expirationAware",
  "parallelChunks",
  "chunkIntegrity"
];

export async function runTransportConformance(
  target: TransportConformanceTarget,
  options: RunTransportConformanceOptions = {}
): Promise<TransportConformanceReportV1> {
  const targetIssues = validateTarget(target);
  if (targetIssues.length > 0) {
    throw new TransportConformanceError("conformance.target_invalid", targetIssues);
  }

  const now = options.now ?? (() => new Date());
  const reportId = options.reportId ?? createReportId();
  if (!isSafeSlug(reportId)) {
    throw new TransportConformanceError("conformance.target_invalid", [{
      code: "conformance.target_invalid",
      path: "reportId"
    }]);
  }

  const signal = options.signal ?? new AbortController().signal;
  const startedAt = now().toISOString();
  const results: TransportConformanceScenarioResult[] = [];

  for (const catalogScenario of TRANSPORT_CONFORMANCE_CATALOG.scenarios) {
    if (
      catalogScenario.requiredCapability &&
      !target.capabilities[catalogScenario.requiredCapability]
    ) {
      results.push({
        scenarioId: catalogScenario.id,
        status: "unsupported",
        durationMs: 0,
        cleanupStatus: "not_required",
        limitationCodes: ["capability-not-advertised"],
        evidence: {}
      });
      continue;
    }

    if (signal.aborted) {
      results.push(skippedResult(catalogScenario.id, "run-canceled"));
      continue;
    }

    const started = monotonicNow();
    try {
      const returned = await target.runScenario({ scenario: catalogScenario, signal });
      const elapsed = Math.max(0, monotonicNow() - started);

      if (isSkip(returned)) {
        const skipIssues = validateSkip(returned);
        results.push(skipIssues.length > 0
          ? invalidObservationResult(catalogScenario.id, elapsed)
          : {
              scenarioId: catalogScenario.id,
              status: "skipped",
              diagnosticCategory: returned.diagnosticCategory,
              durationMs: elapsed,
              cleanupStatus: returned.cleanupStatus ?? "not_required",
              limitationCodes: unique(returned.limitationCodes ?? []),
              evidence: pickEvidence(returned)
            });
        continue;
      }

      const observationIssues = validateObservation(returned, catalogScenario);
      if (observationIssues.length > 0) {
        results.push(invalidObservationResult(catalogScenario.id, elapsed));
        continue;
      }

      const passed = evaluateScenario(catalogScenario, returned, target.capabilities);
      results.push({
        scenarioId: catalogScenario.id,
        status: passed ? "passed" : "failed",
        ...(passed ? {} : { diagnosticCategory: "conformance.invariant_failed" as const }),
        durationMs: returned.durationMs ?? elapsed,
        cleanupStatus: returned.cleanupStatus ?? "not_required",
        limitationCodes: unique(returned.limitationCodes ?? []),
        evidence: pickEvidence(returned)
      });
    } catch {
      results.push(signal.aborted
        ? skippedResult(catalogScenario.id, "run-canceled")
        : {
            scenarioId: catalogScenario.id,
            status: "failed",
            diagnosticCategory: "conformance.execution_failed",
            durationMs: Math.max(0, monotonicNow() - started),
            cleanupStatus: "not_required",
            limitationCodes: [],
            evidence: {}
          });
    }
  }

  const capabilityIssues = evaluateTransportCapabilityEvidence(target.capabilities, results);
  const completedAt = now().toISOString();
  const report: TransportConformanceReportV1 = {
    schemaVersion: TRANSPORT_CONFORMANCE_REPORT_VERSION,
    catalogVersion: TRANSPORT_CONFORMANCE_CATALOG_VERSION,
    libraryVersion: PACKAGE_VERSION,
    reportId,
    startedAt,
    completedAt,
    target: cloneProfile(target.profile),
    capabilities: { ...target.capabilities },
    results,
    issues: capabilityIssues,
    overallStatus: deriveOverallStatus(results, capabilityIssues),
    cleanup: aggregateCleanup(results),
    limitations: unique(results.flatMap(({ limitationCodes }) => limitationCodes))
  };

  const validation = validateTransportConformanceReport(report);
  if (!validation.ok) {
    throw new TransportConformanceError("conformance.report_invalid", validation.issues);
  }
  return report;
}

export function evaluateTransportCapabilityEvidence(
  capabilities: TransportConformanceCapabilities,
  results: readonly TransportConformanceScenarioResult[]
): readonly TransportConformanceIssue[] {
  const issues: TransportConformanceIssue[] = [];
  const passed = (id: TransportConformanceScenarioId) =>
    results.find((result) => result.scenarioId === id && result.status === "passed");
  const recovery = passed("recovery.interrupted-no-retransmit");
  const cancellation = passed("cancellation.abandoned-session-reported");
  const reconciliation = passed("recovery.session-reconciliation");
  const chunkIntegrity = passed("integrity.chunk-evidence-enforced");

  if (capabilities.resumable && !recovery) {
    issues.push(capabilityIssue("resumable", "recovery.interrupted-no-retransmit"));
  }
  if (capabilities.snapshotResume && recovery?.evidence.snapshotRecoveryProven !== true) {
    issues.push(capabilityIssue("snapshotResume", "recovery.interrupted-no-retransmit"));
  }
  if (capabilities.persistentResume && recovery?.evidence.persistentRecoveryProven !== true) {
    issues.push(capabilityIssue("persistentResume", "recovery.interrupted-no-retransmit"));
  }
  if (capabilities.abortable && cancellation?.cleanupStatus !== "completed") {
    issues.push(capabilityIssue("abortable", "cancellation.abandoned-session-reported"));
  }
  if (
    capabilities.expirationAware &&
    reconciliation?.evidence.expirationReconciliationProven !== true
  ) {
    issues.push(capabilityIssue("expirationAware", "recovery.session-reconciliation"));
  }
  if (capabilities.chunkIntegrity && !chunkIntegrity) {
    issues.push(capabilityIssue("chunkIntegrity", "integrity.chunk-evidence-enforced"));
  }
  if (capabilities.parallelChunks) {
    issues.push(capabilityIssue("parallelChunks"));
  }
  return issues;
}

export function validateTransportConformanceReport(
  value: unknown
): TransportConformanceReportValidationResult {
  const issues: TransportConformanceIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [reportIssue()] };
  }

  requireExactKeys(value, [
    "schemaVersion",
    "catalogVersion",
    "libraryVersion",
    "reportId",
    "startedAt",
    "completedAt",
    "target",
    "capabilities",
    "results",
    "issues",
    "overallStatus",
    "cleanup",
    "limitations"
  ], issues, "report");
  if (value.schemaVersion !== TRANSPORT_CONFORMANCE_REPORT_VERSION) issues.push(reportIssue("schemaVersion"));
  if (value.catalogVersion !== TRANSPORT_CONFORMANCE_CATALOG_VERSION) issues.push(reportIssue("catalogVersion"));
  if (typeof value.libraryVersion !== "string" || !SEMVER.test(value.libraryVersion)) issues.push(reportIssue("libraryVersion"));
  if (!isSafeSlug(value.reportId)) issues.push(reportIssue("reportId"));
  if (!isIsoDate(value.startedAt)) issues.push(reportIssue("startedAt"));
  if (!isIsoDate(value.completedAt)) issues.push(reportIssue("completedAt"));
  if (isIsoDate(value.startedAt) && isIsoDate(value.completedAt) && Date.parse(value.completedAt) < Date.parse(value.startedAt)) {
    issues.push(reportIssue("completedAt"));
  }

  const targetIssues = validateProfile(value.target);
  issues.push(...targetIssues.map(() => reportIssue("target")));
  const capabilityIssues = validateCapabilities(value.capabilities);
  issues.push(...capabilityIssues.map(() => reportIssue("capabilities")));

  const results = validateResults(value.results, issues);
  const declaredIssues = validateDeclaredIssues(value.issues, issues);
  if (!RESULT_OVERALL_STATUSES.has(value.overallStatus as TransportConformanceOverallStatus)) {
    issues.push(reportIssue("overallStatus"));
  }
  const cleanup = validateCleanupSummary(value.cleanup, issues);
  const limitations = validateSlugArray(value.limitations, 64) ? value.limitations as string[] : undefined;
  if (!limitations) issues.push(reportIssue("limitations"));

  if (results && capabilityIssues.length === 0 && isCapabilities(value.capabilities)) {
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      const catalogScenario = SCENARIOS[index];
      if (result?.status !== "passed" || !catalogScenario) continue;
      const observation = {
        ...result.evidence,
        cleanupStatus: result.cleanupStatus
      };
      if (!evaluateScenario(catalogScenario, observation, value.capabilities)) {
        issues.push(reportIssue("results"));
      }
    }
    const expectedCapabilityIssues = evaluateTransportCapabilityEvidence(value.capabilities, results);
    if (!sameIssues(declaredIssues, expectedCapabilityIssues)) issues.push(reportIssue("issues"));
    if (value.overallStatus !== deriveOverallStatus(results, expectedCapabilityIssues)) {
      issues.push(reportIssue("overallStatus"));
    }
    if (cleanup && !sameCleanup(cleanup, aggregateCleanup(results))) issues.push(reportIssue("cleanup"));
    const expectedLimitations = unique(results.flatMap(({ limitationCodes }) => limitationCodes));
    if (limitations && !sameStrings(limitations, expectedLimitations)) issues.push(reportIssue("limitations"));
  }

  if (issues.length > 0) return { ok: false, issues: dedupeIssues(issues) };
  return { ok: true, issues: [], report: value as unknown as TransportConformanceReportV1 };
}

function scenario(
  id: TransportConformanceScenarioId,
  requiredObservationFields: readonly (keyof TransportConformanceObservation)[],
  requiredCapability?: TransportConformanceCapability
): TransportConformanceScenario {
  return Object.freeze({
    id,
    kind: requiredCapability ? "capability" as const : "common" as const,
    ...(requiredCapability ? { requiredCapability } : {}),
    requiredObservationFields: Object.freeze([...requiredObservationFields])
  });
}

function validateTarget(target: unknown): TransportConformanceIssue[] {
  if (!isRecord(target) || typeof target.runScenario !== "function") {
    return [{ code: "conformance.target_invalid" }];
  }
  return [...validateProfile(target.profile), ...validateCapabilities(target.capabilities)];
}

function validateProfile(profile: unknown): TransportConformanceIssue[] {
  const issues: TransportConformanceIssue[] = [];
  if (!isRecord(profile)) return [{ code: "conformance.target_invalid", path: "profile" }];
  requireExactKeys(profile, [
    "profileId",
    "transportCategory",
    "targetClass",
    "environment",
    "configurationCategories"
  ], issues, "profile", "conformance.target_invalid");
  if (!isSafeSlug(profile.profileId)) issues.push(targetIssue("profile.profileId"));
  if (!["s3-multipart", "tus", "nas"].includes(String(profile.transportCategory))) {
    issues.push(targetIssue("profile.transportCategory"));
  }
  if (!["credential-free-representative", "real-deployment"].includes(String(profile.targetClass))) {
    issues.push(targetIssue("profile.targetClass"));
  }
  if (!isRecord(profile.environment)) {
    issues.push(targetIssue("profile.environment"));
  } else {
    requireExactKeys(profile.environment, ["runtime", "os", "architecture"], issues, "profile.environment", "conformance.target_invalid");
    for (const field of ["runtime", "os", "architecture"] as const) {
      if (!isSafeSlug(profile.environment[field])) issues.push(targetIssue(`profile.environment.${field}`));
    }
  }
  if (!validateSlugArray(profile.configurationCategories, 32)) {
    issues.push(targetIssue("profile.configurationCategories"));
  }
  return dedupeIssues(issues);
}

function validateCapabilities(value: unknown): TransportConformanceIssue[] {
  const issues: TransportConformanceIssue[] = [];
  if (!isRecord(value)) return [targetIssue("capabilities")];
  requireExactKeys(value, CAPABILITY_KEYS, issues, "capabilities", "conformance.target_invalid");
  for (const key of CAPABILITY_KEYS) {
    if (typeof value[key] !== "boolean") issues.push(targetIssue(`capabilities.${toSafeCapabilityId(key)}`));
  }
  if (typeof value.resumable === "boolean") {
    if (value.snapshotResume === true && !value.resumable) issues.push(targetIssue("capabilities.snapshot-resume"));
    if (value.persistentResume === true && !value.resumable) issues.push(targetIssue("capabilities.persistent-resume"));
  }
  return dedupeIssues(issues);
}

function validateObservation(
  value: unknown,
  catalogScenario?: TransportConformanceScenario
): TransportConformanceIssue[] {
  if (!isRecord(value)) return [observationIssue(catalogScenario?.id)];
  const issues: TransportConformanceIssue[] = [];
  for (const key of Object.keys(value)) {
    if (!OBSERVATION_FIELDS.has(key as keyof TransportConformanceObservation)) {
      issues.push(observationIssue(catalogScenario?.id));
    }
  }
  for (const field of BOOLEAN_OBSERVATION_FIELDS) {
    if (field in value && typeof value[field] !== "boolean") issues.push(observationIssue(catalogScenario?.id));
  }
  for (const field of INTEGER_OBSERVATION_FIELDS) {
    if (field in value && !isNonNegativeInteger(value[field])) issues.push(observationIssue(catalogScenario?.id));
  }
  if ("durationMs" in value && !isNonNegativeNumber(value.durationMs)) issues.push(observationIssue(catalogScenario?.id));
  if ("cleanupStatus" in value && !CLEANUP_STATUSES.has(value.cleanupStatus as TransportConformanceCleanupStatus)) {
    issues.push(observationIssue(catalogScenario?.id));
  }
  if ("cleanupReferenceId" in value && !isSafeSlug(value.cleanupReferenceId)) issues.push(observationIssue(catalogScenario?.id));
  if ("diagnosticCategory" in value && !isSafeSlug(value.diagnosticCategory)) issues.push(observationIssue(catalogScenario?.id));
  if ("limitationCodes" in value && !validateSlugArray(value.limitationCodes, 32)) issues.push(observationIssue(catalogScenario?.id));
  if ("reconciliationOutcomes" in value && !validateReconciliationOutcomes(value.reconciliationOutcomes)) {
    issues.push(observationIssue(catalogScenario?.id));
  }
  for (const required of catalogScenario?.requiredObservationFields ?? []) {
    if (!(required in value)) issues.push(observationIssue(catalogScenario?.id));
  }
  return dedupeIssues(issues);
}

function validateSkip(value: TransportConformanceSkip): TransportConformanceIssue[] {
  if (!isRecord(value)) return [observationIssue()];
  const allowed = [
    "status",
    "diagnosticCategory",
    "limitationCodes",
    "cleanupStatus",
    "abandonedResourceCount",
    "cleanupReferenceId"
  ];
  const issues: TransportConformanceIssue[] = [];
  requireExactKeys(value, allowed, issues, "observation", "conformance.observation_invalid", true);
  if (value.status !== "skipped" || !isSafeSlug(value.diagnosticCategory)) issues.push(observationIssue());
  if (value.limitationCodes !== undefined && !validateSlugArray(value.limitationCodes, 32)) issues.push(observationIssue());
  if (value.cleanupStatus !== undefined && !CLEANUP_STATUSES.has(value.cleanupStatus)) issues.push(observationIssue());
  if (value.abandonedResourceCount !== undefined && !isNonNegativeInteger(value.abandonedResourceCount)) issues.push(observationIssue());
  if (value.cleanupReferenceId !== undefined && !isSafeSlug(value.cleanupReferenceId)) issues.push(observationIssue());
  return dedupeIssues(issues);
}

function evaluateScenario(
  catalogScenario: TransportConformanceScenario,
  observation: TransportConformanceObservation,
  capabilities: TransportConformanceCapabilities
): boolean {
  switch (catalogScenario.id) {
    case "source.validation-before-mutation":
      return observation.sourceValidationRejected === true &&
        observation.sourceBytesUnchanged === true &&
        observation.remoteMutationCountBeforeAuthority === 0;
    case "source.mismatch-before-mutation":
      return observation.sourceMismatchDetected === true &&
        observation.sourceBytesUnchanged === true &&
        observation.remoteMutationCountBeforeAuthority === 0;
    case "recovery.interrupted-no-retransmit":
      return observation.sourceIdentityEstablished === true &&
        (observation.acknowledgedBytes ?? 0) > 0 &&
        observation.retransmittedAcknowledgedBytes === 0 &&
        (!capabilities.snapshotResume || observation.snapshotRecoveryProven === true) &&
        (!capabilities.persistentResume || observation.persistentRecoveryProven === true) &&
        observation.storedByteCountMatched === true &&
        observation.storedChecksumMatched === true;
    case "recovery.invalid-evidence-rejected":
      return observation.invalidEvidenceRejected === true && observation.remoteMutationCount === 0;
    case "recovery.session-reconciliation": {
      const outcomes = new Set(observation.reconciliationOutcomes ?? []);
      const base = ["matched", "missing", "local_ahead", "remote_ahead", "unverifiable"] as const;
      return base.every((outcome) => outcomes.has(outcome)) &&
        (!capabilities.expirationAware || (
          outcomes.has("expired") && observation.expirationReconciliationProven === true
        )) && observation.remoteMutationCountBeforeAuthority === 0;
    }
    case "completion.stored-original-verified":
      return observation.transferFinalized === true &&
        observation.authoritativeCompletionCount === 1 &&
        observation.storedByteCountMatched === true &&
        observation.storedChecksumMatched === true &&
        observation.sourceBytesUnchanged === true;
    case "completion.ambiguous-result-reconciled":
      return observation.ambiguousCompletionReconciled === true &&
        observation.authoritativeCompletionCount === 1 &&
        observation.storedByteCountMatched === true &&
        observation.storedChecksumMatched === true;
    case "cancellation.abandoned-session-reported":
      return (
        observation.cleanupStatus === "completed" && observation.abandonedResourceCount === 0
      ) || (
        observation.cleanupStatus === "abandoned_identifiable" &&
        (observation.abandonedResourceCount ?? 0) > 0 &&
        isSafeSlug(observation.cleanupReferenceId)
      );
    case "cleanup.failure-after-completion-isolated":
      return observation.injectedCleanupFailureObserved === true &&
        observation.authoritativeCompletionPreserved === true &&
        observation.authoritativeCompletionCount === 1 &&
        observation.storedByteCountMatched === true &&
        observation.storedChecksumMatched === true &&
        observation.cleanupStatus === "completed";
    case "integrity.chunk-evidence-enforced":
      return observation.chunkIntegrityEvidenceValidated === true &&
        observation.invalidEvidenceRejected === true &&
        observation.remoteMutationCountBeforeAuthority === 0;
  }
}

function validateResults(
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

function validateDeclaredIssues(
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

function validateCleanupSummary(
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

function pickEvidence(value: TransportConformanceObservation | TransportConformanceSkip): TransportConformanceEvidence {
  const evidence: Record<string, unknown> = {};
  for (const field of EVIDENCE_FIELDS) {
    if (field in value && value[field as keyof typeof value] !== undefined) {
      const fieldValue = value[field as keyof typeof value];
      evidence[field] = Array.isArray(fieldValue) ? [...fieldValue] : fieldValue;
    }
  }
  return evidence as TransportConformanceEvidence;
}

function aggregateCleanup(results: readonly TransportConformanceScenarioResult[]): TransportConformanceCleanupSummary {
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

function deriveOverallStatus(
  results: readonly TransportConformanceScenarioResult[],
  issues: readonly TransportConformanceIssue[]
): TransportConformanceOverallStatus {
  if (issues.length > 0 || results.some(({ status }) => status === "failed")) return "non_conformant";
  if (results.some(({ status }) => status === "skipped")) return "incomplete";
  return "conformant";
}

function skippedResult(
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

function invalidObservationResult(
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

function capabilityIssue(
  capability: TransportConformanceCapability,
  scenarioId?: TransportConformanceScenarioId
): TransportConformanceIssue {
  return {
    code: "conformance.capability_unproven",
    capability,
    ...(scenarioId ? { scenarioId } : {})
  };
}

function targetIssue(path?: string): TransportConformanceIssue {
  return { code: "conformance.target_invalid", ...(path ? { path } : {}) };
}

function observationIssue(scenarioId?: TransportConformanceScenarioId): TransportConformanceIssue {
  return {
    code: "conformance.observation_invalid",
    ...(scenarioId ? { scenarioId } : {})
  };
}

function reportIssue(path?: string): TransportConformanceIssue {
  return { code: "conformance.report_invalid", ...(path ? { path } : {}) };
}

function requireExactKeys(
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

function isSkip(value: TransportConformanceObservation | TransportConformanceSkip): value is TransportConformanceSkip {
  return isRecord(value) && value.status === "skipped";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeSlug(value: unknown): value is string {
  return typeof value === "string" && SAFE_SLUG.test(value);
}

function validateSlugArray(value: unknown, max: number): value is string[] {
  return Array.isArray(value) && value.length <= max &&
    value.every(isSafeSlug) && new Set(value).size === value.length;
}

function validateReconciliationOutcomes(value: unknown): value is TransportConformanceReconciliationOutcome[] {
  return Array.isArray(value) && value.length <= RECONCILIATION_OUTCOMES.size &&
    value.every((item) => RECONCILIATION_OUTCOMES.has(item as TransportConformanceReconciliationOutcome)) &&
    new Set(value).size === value.length;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function isCapabilities(value: unknown): value is TransportConformanceCapabilities {
  return isRecord(value) && CAPABILITY_KEYS.every((key) => typeof value[key] === "boolean");
}

function cloneProfile(profile: TransportConformanceTargetProfile): TransportConformanceTargetProfile {
  return {
    ...profile,
    environment: { ...profile.environment },
    configurationCategories: [...profile.configurationCategories]
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function createReportId(): string {
  const random = globalThis.crypto?.randomUUID?.().toLowerCase();
  return random ? `report-${random}` : `report-${Date.now().toString(36)}`;
}

function monotonicNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function sameIssues(
  left: readonly TransportConformanceIssue[],
  right: readonly TransportConformanceIssue[]
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameCleanup(
  left: TransportConformanceCleanupSummary,
  right: TransportConformanceCleanupSummary
): boolean {
  return left.status === right.status && left.abandonedResourceCount === right.abandonedResourceCount;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function dedupeIssues(issues: readonly TransportConformanceIssue[]): TransportConformanceIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = JSON.stringify(issue);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toSafeCapabilityId(capability: TransportConformanceCapability): string {
  return capability.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function safeErrorMessage(code: TransportConformanceIssueCode): string {
  switch (code) {
    case "conformance.target_invalid": return "Transport conformance target is invalid.";
    case "conformance.report_invalid": return "Transport conformance report is invalid.";
    default: return "Transport conformance execution failed.";
  }
}

const RESULT_OVERALL_STATUSES = new Set<TransportConformanceOverallStatus>([
  "conformant",
  "non_conformant",
  "incomplete"
]);
