import type {
  TransportConformanceCapabilities,
  TransportConformanceObservation,
  TransportConformanceScenario,
  TransportConformanceTarget,
  TransportConformanceTargetProfile
} from "../src/conformance.js";

export const fullCapabilities: TransportConformanceCapabilities = {
  resumable: true,
  snapshotResume: true,
  persistentResume: true,
  abortable: true,
  expirationAware: true,
  parallelChunks: false,
  chunkIntegrity: true
};

export const representativeProfile: TransportConformanceTargetProfile = {
  profileId: "test-s3",
  transportCategory: "s3-multipart",
  targetClass: "credential-free-representative",
  environment: {
    runtime: "node-22",
    os: "test",
    architecture: "arm64"
  },
  configurationCategories: ["in-memory", "checksum-sha256"]
};

export function createPassingObservation(
  scenario: TransportConformanceScenario,
  capabilities: TransportConformanceCapabilities = fullCapabilities
): TransportConformanceObservation {
  const common = {
    durationMs: 1,
    cleanupStatus: "completed" as const,
    limitationCodes: [] as const
  };

  switch (scenario.id) {
    case "source.validation-before-mutation":
      return {
        ...common,
        sourceValidationRejected: true,
        sourceBytesUnchanged: true,
        remoteMutationCountBeforeAuthority: 0
      };
    case "source.mismatch-before-mutation":
      return {
        ...common,
        sourceMismatchDetected: true,
        sourceBytesUnchanged: true,
        remoteMutationCountBeforeAuthority: 0
      };
    case "recovery.interrupted-no-retransmit":
      return {
        ...common,
        sourceIdentityEstablished: true,
        acknowledgedBytes: 8,
        retransmittedAcknowledgedBytes: 0,
        snapshotRecoveryProven: capabilities.snapshotResume,
        persistentRecoveryProven: capabilities.persistentResume,
        storedByteCountMatched: true,
        storedChecksumMatched: true
      };
    case "recovery.invalid-evidence-rejected":
      return {
        ...common,
        invalidEvidenceRejected: true,
        remoteMutationCount: 0
      };
    case "recovery.session-reconciliation":
      return {
        ...common,
        reconciliationOutcomes: [
          "matched",
          "missing",
          ...(capabilities.expirationAware ? ["expired" as const] : []),
          "local_ahead",
          "remote_ahead",
          "unverifiable"
        ],
        expirationReconciliationProven: capabilities.expirationAware,
        remoteMutationCountBeforeAuthority: 0
      };
    case "completion.stored-original-verified":
      return {
        ...common,
        transferFinalized: true,
        authoritativeCompletionCount: 1,
        storedByteCountMatched: true,
        storedChecksumMatched: true,
        sourceBytesUnchanged: true
      };
    case "completion.ambiguous-result-reconciled":
      return {
        ...common,
        ambiguousCompletionReconciled: true,
        authoritativeCompletionCount: 1,
        storedByteCountMatched: true,
        storedChecksumMatched: true
      };
    case "cancellation.abandoned-session-reported":
      return {
        ...common,
        abandonedResourceCount: 0
      };
    case "cleanup.failure-after-completion-isolated":
      return {
        ...common,
        injectedCleanupFailureObserved: true,
        authoritativeCompletionPreserved: true,
        authoritativeCompletionCount: 1,
        storedByteCountMatched: true,
        storedChecksumMatched: true
      };
    case "integrity.chunk-evidence-enforced":
      return {
        ...common,
        chunkIntegrityEvidenceValidated: true,
        invalidEvidenceRejected: true,
        remoteMutationCountBeforeAuthority: 0
      };
  }
}

export function createPassingTarget(
  overrides: Partial<TransportConformanceTarget> = {}
): TransportConformanceTarget {
  const capabilities = overrides.capabilities ?? fullCapabilities;
  return {
    profile: overrides.profile ?? representativeProfile,
    capabilities,
    async runScenario({ scenario }) {
      return createPassingObservation(scenario, capabilities);
    },
    ...overrides
  };
}
