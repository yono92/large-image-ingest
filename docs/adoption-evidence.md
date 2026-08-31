# Comparative Adoption Evidence

The August 31, 2026 report compares three frozen, credential-free reference integrations against the same original-preserving TIFF ingest journey:

- `sdk-s3`: `large-image-ingest` with an application-owned S3-style broker adapter and stored-object verifier;
- `raw-tus`: a representative tus-style composition whose application owns ingest coordination around a generic protocol client;
- `raw-s3`: a representative presigned multipart composition whose application owns ingest coordination around generic HTTP transfer.

The candidates are review fixtures, not claims about every tus client, S3 library, hosted service, or deployment. Selection UI, styling, account provisioning, provider policy, and media transformation are outside the boundary for all three.

## Recorded Result

All three candidates completed the same validation, whole-file SHA-256, manifest, three-part transfer, durable recovery, completion, and independent stored-original verification journey. The retained report contains 42 candidate-scenario results and 150 raw trials: four timing-sensitive scenarios ran ten times per candidate, and ten deterministic scenarios ran once per candidate.

| Measure | SDK S3-style | Raw tus-style | Raw S3-style |
| --- | ---: | ---: | ---: |
| Application non-comment source lines | 167 | 140 | 142 |
| Application-owned lifecycle responsibilities | 2 | 14 | 14 |
| Dependency-owned lifecycle responsibilities | 12 | 0 | 0 |
| Explicit configuration decisions | 5 | 12 | 12 |
| Public integration boundaries | 4 | 4 | 4 |
| Candidate verification cases | 6 | 6 | 6 |
| Safe controlled scenarios | 14/14 | 14/14 | 14/14 |

The SDK binding reduced application-owned lifecycle responsibilities by 12/14, or 85.71%, and explicit configuration decisions by 7/12, or 58.33%, against each generic composition. Those are unweighted counts over the frozen responsibility taxonomy and configuration lists. Responsibilities and decisions vary in difficulty, so the percentages describe coordination surface rather than engineering effort.

The code-line result is adverse and remains published: the SDK binding used 27/140 (19.29%) more application-owned non-comment lines than the raw tus fixture and 25/142 (17.61%) more than the raw S3 fixture. In this small target, the SDK candidate includes a complete transport-adapter and resume-store binding while the generic fixtures talk directly to the reference target. The result prevents a blanket “less code” claim; the demonstrated reduction is in application-owned lifecycle coordination and configuration, not in this fixture's physical line count.

All 42/42 applicable candidate-scenario pairs satisfied their invariant, with zero exclusions under unweighted candidate-scenario aggregation. This is parity across the controlled matrix. It does not establish a lower production incident rate for any candidate.

Exact raw measurements, candidate revisions, numerators, denominators, weighting, environment categories, claim links, and limitations are retained in [the versioned JSON report](../benchmarks/results/2026-08-adoption-evidence.json).

## Responsibility Boundary

The frozen taxonomy contains validation, whole-file checksum, manifest, chunking, retry, source identity, recovery persistence, reconciliation, progress, completion, stored verification, safe diagnostics, cleanup, and broker integration.

For the SDK candidate, the dependency owns the first twelve except stored verification and broker integration. The application still owns its target adapter, credential exchange boundary, and independent server-side verification decision. For both generic candidates, the reference application owns all fourteen lifecycle responsibilities. A generic transfer dependency is listed separately and is not credited with behavior it does not implement in the fixture.

Shared source generation, storage observation, and fault injection live in the common target and harness and are excluded equally from application line counts. Candidate tests, generated output, retained reports, fixtures, dependency source, comments, blank lines, and unrelated UI are also excluded. Imports, declarations, configuration, branches, and error handling count when their physical line contains a non-comment language token.

## Fault Catalog And Invariants

The protocol injects:

1. failure before acknowledgement;
2. failure after acknowledgement;
3. lost acknowledgement response;
4. metadata-equal source mismatch;
5. stale recovery state;
6. remote-behind state;
7. remote-ahead state;
8. expired session;
9. missing receipt;
10. duplicate receipt;
11. lost completion response;
12. stored-byte corruption;
13. cleanup failure after completion;
14. sensitive provider-error output.

A trial passes only when its scenario-specific invariant passes. Final byte correctness cannot hide retransmission of acknowledged bytes, remote mutation before an authority check, duplicate authoritative completion, missed corruption, unsafe success, or sensitive output. Every trial retains detection, pre-mutation rejection, recovery action, acknowledged-byte retransmission, completion calls, final application status, stored verification, mutation count, safe-output status, and limitation codes. It does not retain raw errors, provider receipts, full manifests, or recovery records.

## Reproduce

From a clean checkout with Node.js 20 or later:

```bash
npm ci
npm run evidence:adoption -- --output benchmarks/results/2026-08-adoption-evidence.json
npm run test:adoption-evidence
```

`evidence:adoption` builds the package, executes all three candidates, validates the bounded report, and writes only to a repository-relative path. The focused test reruns the evidence twice and checks stable revisions, counts, eligibility, classifications, all 150 trials, aggregate recomputation, safe disclosure, prohibited claim language, and staleness detection.

## Staleness

The report input digest covers the protocol digest and exact candidate source/test revisions. A candidate, common journey, counting policy, scenario, invariant, or authoritative SDK behavior change requires regeneration. Validation rejects a changed digest labelled `current`; comments and other excluded material follow the published counting rule but still change a candidate revision when they occur in a frozen candidate artifact.

## Claim Policy And Limitations

Permitted claims must name a report field, the compared candidates, the frozen journey boundary, and the principal limitation. The report deliberately retains parity and adverse results.

Do not use this evidence to claim real-world defect probability, incident-rate reduction, availability, universal provider reliability, developer-hours saved, or superiority over every alternative. The in-memory target does not model latency, load, regional behavior, credentials, quotas, provider policies, browser scheduling, or operator error. Real-provider evidence, if added later, must be opt-in, isolated, versioned, and reported as supplemental evidence rather than silently replacing this reproducible baseline.
