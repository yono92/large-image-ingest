# Contract: Adoption Evidence Report

```json
{
  "schemaVersion": "large-image-ingest.adoption-evidence-report.v1",
  "protocol": {
    "id": "large-image-ingest.adoption-evidence-protocol.v1",
    "digest": { "algorithm": "sha256", "value": "..." }
  },
  "candidates": [
    {
      "id": "sdk-s3",
      "revision": { "algorithm": "sha256", "value": "..." },
      "eligibility": { "status": "eligible", "storedVerification": "verified" },
      "implementation": {
        "applicationNonCommentSourceLines": 0,
        "applicationFileCount": 0,
        "configurationDecisionCount": 0,
        "applicationResponsibilityCount": 0,
        "dependencyResponsibilityCount": 0,
        "candidateSpecificVerificationCaseCount": 0
      },
      "scenarios": []
    }
  ],
  "aggregates": {
    "observedSafeScenarioCoverage": {
      "numerator": 0,
      "denominator": 0,
      "excludedScenarioCount": 0,
      "weighting": "unweighted-candidate-scenario",
      "trialComposition": "four-timing-sensitive-scenarios-ten-trials-and-ten-deterministic-scenarios-one-trial-per-candidate",
      "percentage": 0
    },
    "implementationLineChanges": [],
    "responsibilityReductions": [],
    "configurationDecisionReductions": []
  },
  "claims": [],
  "limitations": [],
  "inputsDigest": { "algorithm": "sha256", "value": "..." },
  "staleness": { "status": "current" }
}
```

The validator rejects missing trials, recomputation mismatches, hidden exclusions, unsafe fields/values, raw provider evidence, invalid candidate revisions, stale input identity labelled current, and claims containing prohibited probability, incident-rate, availability, or universal reliability language.
