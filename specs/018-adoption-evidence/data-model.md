# Data Model: Comparative Adoption Evidence

## Protocol

`large-image-ingest.adoption-evidence-protocol.v1` includes journey requirement IDs, ownership categories, counting rule, candidate eligibility, scenario catalog, required raw fields, repeat counts, aggregation rule, safe-output policy, and prohibited claims.

## Candidate

Each candidate has a safe ID/version, transport style, exact source revision SHA-256, repository-relative artifact labels, dependency list, responsibility ownership matrix, configuration decisions, public boundaries, candidate-specific verification cases, and eligibility result.

## Implementation Measurement

Records application non-comment source lines, application file count, test-owned lines/files/cases, configuration-decision count, lifecycle responsibility counts by owner, public-boundary count, generated/shared exclusions, and frozen source revision.

## Trial

Every trial records scenario ID/index, status, detected flag, pre-mutation rejection, recovery action, acknowledged bytes retransmitted, completion-call count, final application status, stored verification, mutation count before authority, safe-output status, and limitation codes. No raw error, receipt, path, manifest, or recovery record is retained.

## Candidate Scenario Result

Contains applicability, deterministic/timing-sensitive classification, required trial count, all raw trials, and computed safe-pass status. Unsupported and incomplete remain visible and excluded only by an explicit protocol reason.

## Report

`large-image-ingest.adoption-evidence-report.v1` contains protocol identity, environment categories, candidate measurements, happy-path eligibility evidence, all scenario results, raw aggregates with numerator/denominator/exclusions/weighting, bounded claims, limitations, input digest, and staleness status.
