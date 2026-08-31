# Public API Contract: Persistent Identity And Browser Checksum

The declarations below describe additive intent. Exact declaration formatting follows repository style during implementation.

## Core Identity And Compatibility

```ts
type ContentSourceIdentitySchemaVersion =
  "large-image-ingest.source-identity.v1";

interface ContentSourceIdentityV1 {
  schemaVersion: ContentSourceIdentitySchemaVersion;
  algorithm: "sha256";
  scope: "whole-file";
  sizeBytes: number;
  value: string;
}

type ResumeCompatibilityStatus =
  | "resumable"
  | "upgradeable"
  | "restart_only"
  | "expired"
  | "incompatible";

interface ResumeCompatibilityResult {
  status: ResumeCompatibilityStatus;
  reason: ResumeCompatibilityReason;
  recordId: string;
}

createContentSourceIdentity(
  file: IngestFileLike,
  options?: ChecksumOptions
): Promise<ContentSourceIdentityV1>;

classifyPersistentResume(
  record: ResumeRecord,
  file: IngestFileLike,
  options?: PersistentResumeClassificationOptions
): Promise<ResumeCompatibilityResult>;
```

The existing `classifyResumeRecordForFile()` remains exported with its existing return union. It maps only strong compatible/upgradeable outcomes to `compatible`; weak evidence maps to an existing non-recoverable result so old callers cannot authorize unsafe resume.

## Checksum Execution

```ts
interface ChecksumExecutionOptions {
  algorithm: "sha256";
  chunkSize: number;
  signal?: AbortSignal;
  onProgress?: (progress: ChecksumProgress) => void;
}

interface ChecksumExecutor {
  calculate(
    file: IngestFileLike,
    options: ChecksumExecutionOptions
  ): Promise<FileChecksum>;
}

interface ChecksumOptions {
  // existing fields remain
  signal?: AbortSignal;
  executor?: ChecksumExecutor;
  fallback?: "error" | "inline";
  onObserverError?: (failure: ChecksumObserverFailure) => void;
}
```

Cancellation rejects with a non-retryable typed checksum cancellation error. Executor startup, crash, malformed output, or protocol failure rejects with a typed execution error unless explicit inline fallback is selected. Callback exceptions are reported, if configured, and swallowed.

## Browser Subpath

```ts
import {
  createBrowserWorkerChecksumExecutor
} from "large-image-ingest/browser";

const executor = createBrowserWorkerChecksumExecutor();
```

`large-image-ingest/browser` is an ESM browser-only subpath. Importing the root, `/core`, `/node`, `/react`, or CJS output does not require `Worker`.

## Resume Record Schemas

```ts
type ResumeRecordSchemaVersion =
  | "large-image-ingest.resume.v0.1"
  | "large-image-ingest.resume.v0.2"
  | "large-image-ingest.resume.v0.3";

interface ResumeRecordV0_3 extends ResumeRecordBase {
  schemaVersion: "large-image-ingest.resume.v0.3";
  file: ResumeFileIdentity & {
    contentIdentity: ContentSourceIdentityV1;
  };
  receipts: UploadChunkReceipt[];
}
```

Existing v0.1/v0.2 public types and reader entrypoints remain exported. New session-created durable records use v0.3.

## Transport Capability Normalization

```ts
interface TransportRecoveryCapabilities {
  resumable: boolean;
  snapshotResume: boolean;
  persistentResume: boolean;
}

normalizeTransportRecoveryCapabilities(
  capabilities?: TransportCapabilities
): TransportRecoveryCapabilities;
```

`TransportCapabilities.supportsSnapshotResume` and `supportsPersistentResume` remain optional for source compatibility. Normalization treats omissions as false. Ordinary `createSession`/`uploadChunk` behavior does not require either field.

## Manifest Producer

`IngestManifest.library.version` becomes a package release string rather than the historical `"1.0.0"` literal. Manifest schema remains `large-image-ingest.manifest.v1`.

## Error And Event Safety

New typed codes distinguish:

- checksum cancellation;
- checksum executor failure;
- source identity missing/mismatch;
- legacy record restart-only/incompatible;
- unsupported recovery capability.

Routine messages/events contain codes and opaque record IDs only. They do not contain identity values, full manifests/records, metadata, receipts, upload URLs, keys, paths, tokens, or credentials.
