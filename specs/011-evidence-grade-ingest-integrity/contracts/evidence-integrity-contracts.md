# Public Contract Draft: Evidence-Grade Ingest Integrity

This document fixes the intended public contract before implementation. Final exported names may be adjusted only if tests and release documentation are updated together.

## Version Constants

```ts
export const LARGE_IMAGE_INGEST_VERSION: string;
export type ResumeRecordSchemaVersion =
  | "large-image-ingest.resume.v0.1"
  | "large-image-ingest.resume.v0.2"
  | "large-image-ingest.resume.v0.3";
export type IngestCompletionEvidenceSchemaVersion =
  "large-image-ingest.completion.v1";
```

## Resume Content Identity

```ts
export interface ResumeContentIdentity {
  algorithm: "sha256";
  scope: "whole-file";
  value: string;
}

export interface ResumeRecordV0_3 extends Omit<ResumeRecordBase, "file"> {
  schemaVersion: "large-image-ingest.resume.v0.3";
  producer: ArtifactProducer;
  receipts: UploadChunkReceipt[];
  file: ResumeFileIdentity & {
    contentIdentity: ResumeContentIdentity;
  };
}
```

New typed conflicts:

```ts
type ResumeConflictCode =
  | ExistingResumeConflictCode
  | "resume.content_identity_missing"
  | "resume.content_mismatch";
```

## Transport Completion Result

```ts
export interface StoredObjectEvidence {
  sizeBytes: number;
  checksum?: ChecksumReceipt;
}

export interface UploadCompletionResult {
  completedAt?: string;
  storage?: StorageTargetManifest;
  storedObject?: StoredObjectEvidence;
}

export interface UploadTransport {
  // Existing methods remain unchanged.
  completeSession(context: UploadCompletionContext):
    Promise<void | UploadCompletionResult>;
}
```

Official transport integration:

- `S3MultipartBroker.completeMultipartUpload` may return `void | UploadCompletionResult`.
- `createS3MultipartTransport` passes normalized broker completion evidence to core.
- `TusTransportOptions.verifyUpload` may optionally perform application-owned final stored-object verification and return `UploadCompletionResult` after the remote offset is complete.
- Existing transports and brokers returning `void` stay valid.
- `createNodeFileCompletionResult` streams a finalized server file and returns normalized size and SHA-256 facts for NAS/filesystem integrations.

## Completion Evidence

```ts
export type IngestCompletionStatus = "verified" | "completed-unverified";

export interface ReceiptSetDigest {
  algorithm: "sha256";
  value: string;
}

export interface ArtifactProducer {
  name: "large-image-ingest";
  version: string;
}

export interface IngestCompletionEvidence {
  schemaVersion: "large-image-ingest.completion.v1";
  id: string;
  createdAt: string;
  completedAt: string;
  producer: ArtifactProducer;
  manifest: {
    id: string;
    schemaVersion: IngestManifestSchemaVersion;
  };
  source: {
    sizeBytes: number;
    checksum?: FileChecksum;
  };
  status: IngestCompletionStatus;
  upload: {
    transportName: string;
    totalBytes: number;
    totalChunks: number;
    acknowledgedChunks: number;
    receiptDigest: ReceiptSetDigest;
  };
  storage?: StorageTargetManifest;
  verification?: {
    verifiedAt: string;
    sourceChecksum: FileChecksum;
    storedChecksum: ChecksumReceipt;
    storedSizeBytes: number;
  };
}
```

## Session And Events

```ts
export class LargeImageIngestSession {
  // Existing start(), resume(), pause(), cancel(), abort(), and getSnapshot()
  // contracts remain source-compatible.
  getCompletionEvidence(): IngestCompletionEvidence | undefined;
}

export type IngestEvent =
  | ExistingIngestEvent
  | {
      type: "completed";
      manifest: IngestManifest;
      uploadId: string;
      evidence: IngestCompletionEvidence;
    };
```

React controller state gains an optional detached `completionEvidence` value after completion.

## Parsing And Diagnostics

```ts
export function validateCompletionEvidence(
  value: unknown
): CompletionEvidenceValidationResult;

export function parseCompletionEvidence(
  value: unknown
): IngestCompletionEvidence;

export function createSafeCompletionSummary(
  evidence: IngestCompletionEvidence
): SafeCompletionSummary;
```

Validation and safe diagnostics never echo checksum values, filenames, metadata, upload identifiers, storage locations, resume handles, or opaque provider values in default messages.

## Packaged Schemas

```text
large-image-ingest/schemas/manifest.v1
large-image-ingest/schemas/resume.v0.3
large-image-ingest/schemas/completion.v1
```

Each export is a JSON Schema Draft 2020-12 document included in the npm tarball.
