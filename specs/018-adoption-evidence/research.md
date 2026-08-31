# Research: Comparative Adoption Evidence

## Candidate Boundaries

**Decision**: Compare one SDK S3-style integration, one raw tus-style resumable integration, and one raw presigned multipart integration. Selection UI and provider provisioning are excluded equally.

**Rationale**: The candidates represent plausible choices for the same browser-to-storage journey while keeping protocol/server responsibilities visible. They do not claim to represent every uploader, hosted service, or provider SDK.

## tus Semantics

**Decision**: The tus reference uses offset authority, explicit expiration, and idempotent reconciliation behavior as application-owned logic.

**Rationale**: The tus protocol defines resumable offsets and optional expiration/termination extensions, but a generic protocol composition still needs application identity, manifest, persistence, verification, safe diagnostics, and UI state coordination.

**Source**: [tus 1.0 protocol](https://tus.io/protocols/resumable-upload)

## Multipart Semantics

**Decision**: The multipart reference uses opaque upload IDs and authoritative part receipts; it cannot invent a missing receipt and must reconcile ambiguous completion.

**Rationale**: Multipart completion depends on the uploaded part identity list. Presigned transfer alone does not provide application manifest, durable local recovery, safe error projection, or stored-original verification.

**Source**: [Amazon S3 multipart upload overview](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)

## Implementation Metric

**Decision**: Count physical source lines with at least one non-comment token, not raw bytes, elapsed developer time, or dependency source lines.

**Rationale**: This deterministic metric is reviewable and resistant to blank lines/comments, while still counting imports, types/config, branches, and error handling that applications maintain. Responsibility and dependency tables remain adjacent because line counts alone are incomplete.

## Fault Evidence And Claims

**Decision**: Publish scenario coverage as observed safe passes divided by applicable candidate-scenario pairs, with raw trials and unweighted denominators. Never translate coverage into defect probability or availability.

**Rationale**: Controlled injection measures behavior only at defined boundaries. The repository has no representative production incident population, exposure time, provider mix, or user distribution from which a real-world probability could be estimated.

## Developer Time

**Decision**: Omit developer elapsed time from the initial report.

**Rationale**: No controlled, equally experienced evaluator study exists. Source/revision metrics and deterministic outcomes are stronger evidence for this release.
