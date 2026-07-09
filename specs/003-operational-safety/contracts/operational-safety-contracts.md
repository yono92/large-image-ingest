# Contracts: 1.1.0 Operational Safety

Draft TypeScript contract direction for additive 1.1.0 APIs. Final names may be adjusted during task generation, but behavior should remain aligned with this contract.

## Safe Summary Helpers

```ts
export interface SafeProgressSummary {
  uploadedBytes: number;
  totalBytes: number;
}

export interface SafeErrorSummary {
  code: IngestIssueCode | ResumeConflictCode | VerificationIssueCode;
  message: string;
  retryable?: boolean;
}

export interface RedactionSummary {
  fields: readonly string[];
}

export interface SafeEventSummary {
  type: IngestEvent["type"];
  manifestId?: string;
  recordId?: string;
  uploadId?: string;
  status?: UploadSessionStatus | ResumeRecordStatus;
  progress?: SafeProgressSummary;
  chunkIndex?: number;
  error?: SafeErrorSummary;
  redactions?: RedactionSummary;
}

export function createSafeEventSummary(event: IngestEvent): SafeEventSummary;
```

Contract rules:

- Must not include full `IngestManifest` objects.
- Must not include raw `metadata`, `resumeToken`, `secretsRef`, `remote`, `opaque`, presigned locations, credentials, or full resume records.
- Must preserve event type, public IDs, progress, status, typed codes, and retryability when present.

## Redaction Helpers

```ts
export interface RedactedSnapshotResult {
  snapshot: UploadSessionSnapshot;
  redactions?: RedactionSummary;
}

export interface RedactedResumeRecord {
  schemaVersion: ResumeRecordSchemaVersion;
  id: string;
  manifestId: string;
  file: ResumeFileIdentity;
  chunking: ResumeChunkingIdentity;
  transport: {
    name?: string;
    uploadId?: string;
  };
  progress: ResumeProgress;
  createdAt: string;
  updatedAt: string;
  redactions?: RedactionSummary;
}

export function redactUploadSessionSnapshot(snapshot: UploadSessionSnapshot): RedactedSnapshotResult;

export function redactResumeRecord(record: ResumeRecord): RedactedResumeRecord;
```

Contract rules:

- Redaction must not mutate the source object.
- Returned redaction metadata must identify removed categories, not removed values.
- Full snapshots remain available to callers through existing APIs for application-owned persistence.

## Verification Report Summary

```ts
export interface SafeVerificationSummary {
  ok: boolean;
  issues: readonly {
    code: VerificationIssueCode | IngestIssueCode;
    path?: string;
    severity: IngestIssueSeverity;
  }[];
}

export function createSafeVerificationSummary(result: VerificationResult): SafeVerificationSummary;
```

Contract rules:

- Must retain issue codes, paths, and severity.
- Must not include raw full manifests, customer metadata, credentials, presigned URLs, or storage secrets in details.

## Retry Policy

```ts
export interface RetryPolicy {
  maxAttempts?: number;
  delayMs?: number;
  backoffFactor?: number;
  maxDelayMs?: number;
  jitter?: "none" | "full";
  isRetryable?: (error: unknown, context: RetryDecisionContext) => boolean;
}

export interface RetryDecisionContext {
  attempt: number;
  chunk: ChunkDescriptor;
  manifestId: string;
}
```

Contract rules:

- Existing `retries` behavior remains valid.
- `retryPolicy.maxAttempts` is the total number of chunk attempts. When `retryPolicy.maxAttempts` is omitted, existing `retries` falls back to `retries + 1` total attempts.
- When both `retries` and `retryPolicy.maxAttempts` are provided, `retryPolicy.maxAttempts` takes precedence.
- Pause, cancel, validation failures, resume conflicts, offset conflicts, expired resume state, and non-retryable errors must not be retried.
