// Part of conformance.ts, split out to keep modules under 500 lines; public exports stay on conformance.ts.
import type { TransportConformanceCapability, TransportConformanceCleanupStatus, TransportConformanceObservation, TransportConformanceReconciliationOutcome, TransportConformanceScenario, TransportConformanceScenarioStatus } from "./conformance.js";
import { scenario } from "./conformance-transport.js";

export const SCENARIOS: readonly TransportConformanceScenario[] = [
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

export const SAFE_SLUG = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
export const BOOLEAN_OBSERVATION_FIELDS = new Set<keyof TransportConformanceObservation>([
  "sourceValidationRejected",
  "sourceIdentityEstablished",
  "sourceMismatchDetected",
  "sourceBytesUnchanged",
  "snapshotRecoveryProven",
  "persistentRecoveryProven",
  "expirationReconciliationProven",
  "invalidEvidenceRejected",
  "chunkIntegrityEvidenceValidated",
  "parallelConcurrencyBounded",
  "canonicalReceiptOrder",
  "uniqueAcknowledgedProgress",
  "transferFinalized",
  "ambiguousCompletionReconciled",
  "authoritativeCompletionPreserved",
  "storedByteCountMatched",
  "storedChecksumMatched",
  "injectedCleanupFailureObserved"
]);
export const INTEGER_OBSERVATION_FIELDS = new Set<keyof TransportConformanceObservation>([
  "remoteMutationCountBeforeAuthority",
  "remoteMutationCount",
  "acknowledgedBytes",
  "retransmittedAcknowledgedBytes",
  "authoritativeCompletionCount",
  "abandonedResourceCount"
]);
export const OBSERVATION_FIELDS = new Set<keyof TransportConformanceObservation>([
  ...BOOLEAN_OBSERVATION_FIELDS,
  ...INTEGER_OBSERVATION_FIELDS,
  "reconciliationOutcomes",
  "cleanupReferenceId",
  "cleanupStatus",
  "diagnosticCategory",
  "limitationCodes",
  "durationMs"
]);
export const EVIDENCE_FIELDS = [...OBSERVATION_FIELDS].filter((field) => ![
  "cleanupStatus",
  "diagnosticCategory",
  "limitationCodes",
  "durationMs"
].includes(field));
export const CLEANUP_STATUSES = new Set<TransportConformanceCleanupStatus>([
  "not_required",
  "completed",
  "failed",
  "abandoned_identifiable"
]);
export const RECONCILIATION_OUTCOMES = new Set<TransportConformanceReconciliationOutcome>([
  "matched",
  "missing",
  "expired",
  "local_ahead",
  "remote_ahead",
  "unverifiable"
]);
export const RESULT_STATUSES = new Set<TransportConformanceScenarioStatus>([
  "passed",
  "failed",
  "skipped",
  "unsupported"
]);
export const CAPABILITY_KEYS: readonly TransportConformanceCapability[] = [
  "resumable",
  "snapshotResume",
  "persistentResume",
  "abortable",
  "expirationAware",
  "parallelChunks",
  "chunkIntegrity"
];
