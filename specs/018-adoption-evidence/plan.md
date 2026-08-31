# Implementation Plan: Comparative Adoption Evidence

**Branch**: `[018-adoption-evidence]` | **Date**: 2026-08-31 | **Spec**: [spec.md](spec.md)

## Summary

Add a repository-owned, versioned adoption-evidence protocol and credential-free runner comparing three frozen candidate integrations: this SDK over an S3-style multipart boundary, a raw tus-style resumable composition, and a raw presigned multipart composition. Measure only frozen application-owned artifacts under one token-line counting rule, report dependency responsibility separately, run one common verified journey and fourteen fault scenarios, repeat four timing-sensitive scenarios ten times, retain every raw trial, validate safe output, and generate a bounded human summary whose claims link to report fields.

## Technical Context

**Language/Version**: Node.js 20+ CommonJS benchmark tooling; package built output for the SDK candidate

**Dependencies**: native Node crypto/fs; built SDK for the SDK candidate; no new runtime package or credential

**Storage**: frozen candidate sources in `benchmarks/adoption/`, retained JSON in `benchmarks/results/`, human report in `docs/`

**Testing**: Vitest protocol/counting/report/staleness/claim/safe-output tests plus deterministic runner reruns

**Constraints**: same journey and target model; shared harness excluded from application counts; exact candidate revisions; no hosted-service claims; no defect-probability extrapolation

## Clarification Result

No critical ambiguity remains. The code metric is non-comment source lines: every physical source line containing at least one language token after comments are removed. Blank/comment-only lines, generated output, fixtures, retained reports, shared harness, and unrelated UI are excluded. Imports, type/config declarations, branches, and error handling count. Four response-loss/interruption scenarios are timing-sensitive and receive ten trials; the remaining deterministic scenarios receive one.

## Constitution Check

- **Equivalent outcome — PASS**: all candidates must pass the same original/checksum/manifest/resume/completion/stored-verification journey before comparison.
- **Fair ownership — PASS**: application, tests, shared harness, generated artifacts, and dependencies are reported separately.
- **Original integrity — PASS**: one immutable byte fixture and SHA-256 oracle are used; no transform path exists.
- **Security — PASS**: report validator rejects unsafe values and publishes codes/counts rather than raw errors or state.
- **Claim discipline — PASS**: observed fault coverage is not probability, availability, reliability, or incident reduction.
- **Reproducibility — PASS**: protocol/candidate/scenario/counting input digests drive staleness and exact commands regenerate results.

## Architecture

### Frozen Protocol

`protocol.cjs` defines journey requirements, candidate eligibility, ownership taxonomy, counting policy, fourteen scenarios, outcome fields, repetition policy, aggregate rules, report validation, and prohibited-claim terms. Its canonical SHA-256 is part of every report.

### Candidate Integrations

Each candidate owns one executable integration file and one candidate-specific verification-case file. The common reference target injects faults and exposes protocol-neutral storage observations; it does not implement candidate retry, recovery, identity, manifest, completion, diagnostics, or verification responsibilities. SDK-owned behavior remains dependency-owned and the thin application binding is counted. Generic candidates implement equivalent coordination directly in their frozen application files.

### Measurement

The runner tokenizes candidate sources to count lines containing non-comment tokens, lists reviewable repository-relative artifact labels, counts files, configuration decisions, public boundaries, candidate-specific cases, and responsibilities, and reports dependencies separately. Candidate source SHA-256 is the exact revision.

### Fault Evidence

The target injects failure before acknowledgement, accepted-but-lost response, lost acknowledgement, stale state, remote behind/ahead, expiration, receipt faults, lost completion response, corruption, cleanup failure, and sensitive errors. Candidate execution produces all required raw fields. Safe pass is computed only from each scenario's invariant; correctness after forbidden retransmission or unsafe reporting remains a failure.

### Reports And Staleness

The JSON report retains every trial, all parity/adverse/unsupported results, counts, exclusions, candidate revisions, environment categories, limitations, and claim links. `inputsDigest` covers protocol digest, candidate revisions, journey, counting rule, and scenario invariants. Validation marks a report stale when recomputed input identity differs.

## Compatibility Strategy

- Benchmark-only tooling; no SDK runtime API or default behavior changes.
- Add `npm run evidence:adoption` and `npm run test:adoption-evidence`.
- Reuse package 1.6.0 and feature 014 invariants without making comparison tooling a published subpath.
- Keep real providers as explicit future supplemental runs.

## Verification Strategy

1. Prove all three candidates pass the identical happy path and stored SHA-256 oracle.
2. Run all fourteen scenarios; run four timing-sensitive scenarios ten times per candidate.
3. Validate field completeness and safe-pass invariants for every raw trial.
4. Rerun twice and compare counts and deterministic/timing-sensitive classifications.
5. Mutate comments/formatting/generated/shared files and prove frozen application counts behave per policy.
6. Mutate protocol/candidate/scenario/counting inputs and prove staleness.
7. Recompute every aggregate and implementation reduction from raw fields.
8. Reject unsafe output and prohibited probability/reliability claims.
9. Run package and full repository gates.

## Complexity Tracking

Three executable candidate files duplicate some orchestration intentionally: moving generic lifecycle behavior into the shared harness would erase the application-owned responsibility being measured. The target and evaluator remain shared only where identical for all candidates.
