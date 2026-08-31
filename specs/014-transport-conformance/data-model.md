# Data Model: Official Transport Conformance

## Conformance Catalog

Immutable versioned definition of the scenarios recognized by the runner.

| Field | Type | Rules |
| --- | --- | --- |
| `schemaVersion` | literal | `large-image-ingest.transport-conformance-catalog.v1` |
| `scenarios` | readonly scenario list | Unique stable IDs; fixed order; no target-specific secrets |

## Conformance Scenario

| Field | Type | Rules |
| --- | --- | --- |
| `id` | scenario ID enum | Unique within catalog; stable across report runs |
| `kind` | `common` or `capability` | `common` applies to all official targets; `capability` depends on a named claim |
| `requiredCapability` | capability key or absent | Required only for capability-scoped scenarios |
| `requiredObservationFields` | readonly observation-field keys | Used by validation before evaluation |

Initial scenario IDs:

1. `source.validation-before-mutation`
2. `source.mismatch-before-mutation`
3. `recovery.interrupted-no-retransmit`
4. `recovery.invalid-evidence-rejected`
5. `recovery.session-reconciliation`
6. `completion.stored-original-verified`
7. `completion.ambiguous-result-reconciled`
8. `cancellation.abandoned-session-reported`
9. `cleanup.failure-after-completion-isolated`
10. `integrity.chunk-evidence-enforced`

## Target Profile

Non-sensitive identity for one evaluated target.

| Field | Type | Rules |
| --- | --- | --- |
| `profileId` | safe slug | 1–64 lowercase ASCII letters, digits, `-`, `_`, `.`; no path/URL syntax |
| `transportCategory` | `s3-multipart`, `tus`, or `nas` | Provider-neutral category only |
| `targetClass` | `credential-free-representative` or `real-deployment` | Determines evidence boundary |
| `environment` | bounded runtime descriptor | OS/runtime/architecture categories only; no hostnames or paths |
| `configurationCategories` | safe slug list | Capability/configuration labels, never values |

## Capability Claim Set

The target's declared applicability inputs. It mirrors the safety-relevant official transport claims without adding a conformance flag.

| Field | Type |
| --- | --- |
| `resumable` | boolean |
| `snapshotResume` | boolean |
| `persistentResume` | boolean |
| `abortable` | boolean |
| `expirationAware` | boolean |
| `parallelChunks` | boolean |
| `chunkIntegrity` | boolean |

Validation rules:

- `snapshotResume` and `persistentResume` require `resumable`.
- Every positive claim must have at least one applicable passing catalog result.
- An unsupported capability scenario cannot satisfy a positive claim.

## Conformance Observation

Structured facts returned by one target driver. All fields are optional at the type level because scenarios require different subsets; catalog validation makes required fields mandatory before evaluation.

| Field group | Fields |
| --- | --- |
| Source authority | `sourceValidationRejected`, `sourceIdentityEstablished`, `sourceMismatchDetected`, `sourceBytesUnchanged` |
| Mutation | `remoteMutationCountBeforeAuthority`, `remoteMutationCount` |
| Recovery | `acknowledgedBytes`, `retransmittedAcknowledgedBytes`, `snapshotRecoveryProven`, `persistentRecoveryProven`, `reconciliationOutcomes`, `expirationReconciliationProven` |
| Evidence | `invalidEvidenceRejected`, `chunkIntegrityEvidenceValidated` |
| Completion | `transferFinalized`, `authoritativeCompletionCount`, `ambiguousCompletionReconciled`, `authoritativeCompletionPreserved` |
| Stored verification | `storedByteCountMatched`, `storedChecksumMatched` |
| Cleanup | `cleanupStatus`, `injectedCleanupFailureObserved`, `abandonedResourceCount`, `cleanupReferenceId` |
| Diagnostics | `diagnosticCategory`, `limitationCodes`, `durationMs` |

No observation field can carry a checksum value, URL, path, object key, receipt, manifest, resume record, arbitrary metadata, or provider exception string.

## Conformance Result

| Field | Type | Rules |
| --- | --- | --- |
| `scenarioId` | scenario ID | Exactly one result per catalog scenario |
| `status` | `passed`, `failed`, `skipped`, `unsupported` | Runner-derived; drivers do not choose pass/fail |
| `diagnosticCategory` | safe enum | Present for failure/skip when applicable |
| `evidence` | safe evidence summary | Required counters/booleans only |
| `durationMs` | non-negative number | Diagnostic only |
| `cleanupStatus` | cleanup enum | Present when resources were created or cleanup attempted |
| `limitationCodes` | safe slug list | No prose or target values |

## Qualification Report

| Field | Type | Rules |
| --- | --- | --- |
| `schemaVersion` | literal | `large-image-ingest.transport-conformance-report.v1` |
| `catalogVersion` | literal | Matches the catalog used by the runner |
| `libraryVersion` | semver string | Embedded package producer version |
| `reportId` | safe opaque ID | Random or caller-supplied safe slug; not derived from target secrets |
| `startedAt`, `completedAt` | ISO timestamps | Runner clock; completion not earlier than start |
| `target` | Target Profile | Safe target description |
| `capabilities` | Capability Claim Set | Applicability inputs |
| `results` | ordered result list | Exactly one result for every catalog scenario |
| `issues` | safe issue list | Capability/report issue codes and optional safe field/scenario identifiers only |
| `overallStatus` | `conformant`, `non_conformant`, `incomplete` | Runner-derived |
| `cleanup` | aggregate cleanup summary | Counts and status only |
| `limitations` | safe slug list | Aggregated codes only |

## State Transitions

```text
created
  -> running
      -> scenario passed / failed / skipped / unsupported
      -> cleanup completed / failed / abandoned identifiable
  -> conformant       (all applicable passed; legitimate unsupported only)
  -> non_conformant   (one or more failed)
  -> incomplete       (one or more skipped; no failure)
```

An already verified completion remains authoritative if later cleanup fails. The isolation scenario records `injectedCleanupFailureObserved: true`; it passes only after the test-owned final cleanup succeeds, so its final `cleanupStatus` is `completed`. If final cleanup still fails, the scenario is non-conformant, `cleanupStatus` and aggregate cleanup remain `failed`, and any abandoned resource count/reference stays visible without reversing completion authority.

## Identity And Uniqueness

- Catalog scenario IDs are stable public identifiers.
- A report contains each catalog scenario ID exactly once.
- `reportId` identifies the execution artifact, not a transport session or provider object.
- Driver-created remote identifiers never leave the driver boundary.
