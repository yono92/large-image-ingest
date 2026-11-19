// Part of conformance.ts, split out to keep modules under 500 lines; public exports stay on conformance.ts.
import { PACKAGE_VERSION } from "./package-version.js";
import { TRANSPORT_CONFORMANCE_CATALOG, TRANSPORT_CONFORMANCE_CATALOG_VERSION, TRANSPORT_CONFORMANCE_REPORT_VERSION, TransportConformanceError } from "./conformance.js";
import type { RunTransportConformanceOptions, TransportConformanceCapabilities, TransportConformanceCapability, TransportConformanceCleanupStatus, TransportConformanceIssue, TransportConformanceObservation, TransportConformanceOverallStatus, TransportConformanceReportV1, TransportConformanceReportValidationResult, TransportConformanceScenario, TransportConformanceScenarioId, TransportConformanceScenarioResult, TransportConformanceSkip, TransportConformanceTarget } from "./conformance.js";
import { RESULT_OVERALL_STATUSES, aggregateCleanup, capabilityIssue, cloneProfile, createReportId, dedupeIssues, deriveOverallStatus, invalidObservationResult, isCapabilities, isIsoDate, isNonNegativeInteger, isNonNegativeNumber, isRecord, isSafeSlug, isSkip, monotonicNow, observationIssue, pickEvidence, reportIssue, requireExactKeys, sameCleanup, sameIssues, sameStrings, skippedResult, targetIssue, toSafeCapabilityId, unique, validateCleanupSummary, validateDeclaredIssues, validateReconciliationOutcomes, validateResults, validateSlugArray } from "./conformance-workflow-catalog.js";
import { BOOLEAN_OBSERVATION_FIELDS, CAPABILITY_KEYS, CLEANUP_STATUSES, INTEGER_OBSERVATION_FIELDS, OBSERVATION_FIELDS, SCENARIOS, SEMVER } from "./conformance-shared.js";

/** @experimental */
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

/** @experimental */
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
  if (capabilities.parallelChunks && (
    chunkIntegrity?.evidence.parallelConcurrencyBounded !== true ||
    chunkIntegrity.evidence.canonicalReceiptOrder !== true ||
    chunkIntegrity.evidence.uniqueAcknowledgedProgress !== true
  )) {
    issues.push(capabilityIssue("parallelChunks", "integrity.chunk-evidence-enforced"));
  }
  return issues;
}

/** @experimental */
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

export function scenario(
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

export function validateObservation(
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

export function evaluateScenario(
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
        observation.remoteMutationCountBeforeAuthority === 0 &&
        (!capabilities.parallelChunks || (
          observation.parallelConcurrencyBounded === true &&
          observation.canonicalReceiptOrder === true &&
          observation.uniqueAcknowledgedProgress === true
        ));
  }
}
