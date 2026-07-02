# Data Model: Official Transport Adapters

## Transport Capability

```ts
export interface TransportCapabilities {
  name: string;
  resumable: boolean;
  abortable: boolean;
  expires: boolean;
  supportsParallelChunks: boolean;
  supportsChunkChecksum: boolean;
  minChunkSizeBytes?: number;
  minFinalChunkSizeBytes?: number;
  maxChunkSizeBytes?: number;
  maxChunkCount?: number;
  partNumberBase?: 0 | 1;
}
```

Purpose:

- Lets core validate a chunk plan before upload starts.
- Represents provider-specific exceptions such as a smaller final S3 multipart part.
- Lets UI and application code display available actions.
- Keeps transport-specific limits out of generic validation rules.

## Transport Session

```ts
export interface TransportSession {
  uploadId: string;
  transportName: string;
  createdAt: string;
  expiresAt?: string;
  resumeToken?: string;
  secretsRef?: string;
  remote?: Record<string, unknown>;
}
```

Transport-specific examples:

- tus: `resumeToken` may be the upload URL or an opaque reference to it.
- S3: `remote` may contain a broker session ID, object key reference, or multipart upload ID.
- NAS: `remote` may contain a server-side staging session ID.

Sensitive values such as presigned URLs, bearer-style tus upload URLs, and broker authorization tokens should be stored only when the application explicitly opts in. They should not be emitted in default events or manifests. `secretsRef` is for pointing at an application-controlled secret store without putting the secret directly into the snapshot.

## Chunk Receipt

```ts
export interface UploadChunkReceipt {
  chunkIndex: number;
  sizeBytes: number;
  completedAt: string;
  checksum?: {
    algorithm: "sha256" | "crc64nvme" | "crc32c" | "crc32" | "md5" | "custom";
    value: string;
  };
  transport: {
    name: string;
    partNumber?: number;
    etag?: string;
    offset?: number;
    location?: string;
    opaque?: Record<string, unknown>;
  };
}
```

Purpose:

- S3 completion receives `partNumber` and `etag`.
- tus resume receives `offset`.
- NAS finalization receives staged chunk references or gateway tokens.

Receipt rules:

- `chunkIndex` must match the chunk being uploaded.
- `sizeBytes` must match the expected chunk size.
- A retried chunk replaces the previous failed attempt and records one successful receipt.
- `completeSession` receives receipts sorted by chunk index unless a transport explicitly requires another stable order.

## Upload Session Snapshot

```ts
export type UploadSessionStatus =
  | "idle"
  | "validating"
  | "creating"
  | "uploading"
  | "paused"
  | "resuming"
  | "completing"
  | "completed"
  | "failed"
  | "canceled";

export interface UploadSessionSnapshot {
  manifestId: string;
  status: UploadSessionStatus;
  transportSession?: TransportSession;
  chunkPlan: ChunkPlan;
  completedChunks: UploadChunkReceipt[];
  failedChunk?: ChunkDescriptor;
  uploadedBytes: number;
  totalBytes: number;
  createdAt: string;
  updatedAt: string;
  error?: {
    code:
      | IngestIssueCode
      | "transport.paused"
      | "transport.canceled"
      | "transport.session_expired"
      | "transport.offset_mismatch"
      | "transport.part_rejected"
      | "transport.receipt_missing"
      | "transport.receipt_invalid"
      | "transport.complete_failed"
      | "transport.abort_failed"
      | "transport.resume_failed"
      | "transport.unsafe_path"
      | "transport.unrecoverable";
    message: string;
    retryable: boolean;
  };
  redactions?: {
    transportSession?: readonly string[];
    receipts?: readonly string[];
  };
}
```

Purpose:

- Provides a stable persistence object for resume.
- Lets application UI restore progress after reload.
- Avoids forcing adapters to hide important state in closures.
- Allows event snapshots to record which sensitive fields were removed.

## Transport Contract

```ts
export interface UploadTransport {
  readonly capabilities: TransportCapabilities;

  createSession(context: UploadSessionContext): Promise<TransportSession>;

  resumeSession?(
    context: UploadSessionContext & {
      snapshot: UploadSessionSnapshot;
    }
  ): Promise<TransportSession>;

  uploadChunk(
    context: UploadChunkContext & {
      session: TransportSession;
      previousReceipts: readonly UploadChunkReceipt[];
    }
  ): Promise<UploadChunkReceipt>;

  completeSession(
    context: UploadSessionContext & {
      session: TransportSession;
      receipts: readonly UploadChunkReceipt[];
    }
  ): Promise<void>;

  abortSession?(
    context: UploadSessionContext & {
      session: TransportSession;
      receipts: readonly UploadChunkReceipt[];
    }
  ): Promise<void>;
}
```

Compatibility note:

The current prototype interface can remain supported temporarily through a legacy adapter wrapper, but official transports should target the receipt-aware contract.
