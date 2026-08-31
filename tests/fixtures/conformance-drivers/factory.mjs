const capabilities = Object.freeze({
  resumable: true,
  snapshotResume: true,
  persistentResume: true,
  abortable: true,
  expirationAware: true,
  parallelChunks: false,
  chunkIntegrity: true
});

export function createFixtureTarget(mode = "complete") {
  return {
    profile: {
      profileId: `fixture-${mode}`,
      transportCategory: "s3-multipart",
      targetClass: "real-deployment",
      environment: {
        runtime: "node-test",
        os: "fixture",
        architecture: "test"
      },
      configurationCategories: ["isolated-fixture", "checksum-sha256"]
    },
    capabilities,
    async runScenario({ scenario }) {
      if (mode === "skipped" && scenario.id === "completion.stored-original-verified") {
        return {
          status: "skipped",
          diagnosticCategory: "fixture.unavailable",
          limitationCodes: ["fixture-incomplete"]
        };
      }
      const observation = passingObservation(scenario.id);
      if (mode === "failed" && scenario.id === "source.mismatch-before-mutation") {
        return { ...observation, remoteMutationCountBeforeAuthority: 1 };
      }
      if (mode === "cleanup-failed" && scenario.id === "cleanup.failure-after-completion-isolated") {
        return {
          ...observation,
          cleanupStatus: "failed",
          abandonedResourceCount: 1,
          cleanupReferenceId: "fixture-cleanup-1"
        };
      }
      return observation;
    }
  };
}

function passingObservation(scenarioId) {
  const common = {
    durationMs: 1,
    cleanupStatus: "completed",
    limitationCodes: []
  };
  switch (scenarioId) {
    case "source.validation-before-mutation":
      return { ...common, sourceValidationRejected: true, sourceBytesUnchanged: true, remoteMutationCountBeforeAuthority: 0 };
    case "source.mismatch-before-mutation":
      return { ...common, sourceMismatchDetected: true, sourceBytesUnchanged: true, remoteMutationCountBeforeAuthority: 0 };
    case "recovery.interrupted-no-retransmit":
      return {
        ...common,
        sourceIdentityEstablished: true,
        acknowledgedBytes: 8,
        retransmittedAcknowledgedBytes: 0,
        snapshotRecoveryProven: true,
        persistentRecoveryProven: true,
        storedByteCountMatched: true,
        storedChecksumMatched: true
      };
    case "recovery.invalid-evidence-rejected":
      return { ...common, invalidEvidenceRejected: true, remoteMutationCount: 0 };
    case "recovery.session-reconciliation":
      return {
        ...common,
        reconciliationOutcomes: ["matched", "missing", "expired", "local_ahead", "remote_ahead", "unverifiable"],
        expirationReconciliationProven: true,
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
      return { ...common, abandonedResourceCount: 0 };
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
    default:
      throw new Error("fixture scenario unsupported");
  }
}
