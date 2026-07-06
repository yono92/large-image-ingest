# Public Contract: Persistent Resumable Upload

This contract describes the public TypeScript surface implemented for persistent resumable upload. Names and behavior should remain compatible within the `1.x` release line unless a future spec explicitly changes them.

## Resume Store

```ts
export interface ResumeStore {
  get(recordId: string): Promise<ResumeRecord | undefined>;
  put(record: ResumeRecord): Promise<void>;
  list(): Promise<ResumeRecord[]>;
  delete(recordId: string): Promise<void>;
}
```

Behavior:

- `put` must persist the full latest record atomically from the SDK perspective.
- `list` may return completed or canceled records, but helper APIs must not offer them as recoverable by default.
- Store failures must be surfaced as typed resume store failures.

## Resume Record

```ts
export type ResumeRecordSchemaVersion = "large-image-ingest.resume.v0.1";

export type ResumeRecordStatus =
  | "active"
  | "paused"
  | "failed"
  | "completed"
  | "canceled"
  | "expired";

export interface CompletedChunkRange {
  startIndex: number;
  endIndexInclusive: number;
}

export interface ResumeRecord {
  schemaVersion: ResumeRecordSchemaVersion;
  id: string;
  manifest: IngestManifest;
  file: ResumeFileIdentity;
  chunking: ResumeChunkingIdentity;
  transport: ResumeTransportState;
  progress: ResumeProgress;
  createdAt: string;
  updatedAt: string;
}
```

Behavior:

- Records must not contain original bytes, derivative bytes, or decoded image data.
- `manifest.id` must remain the same when resuming a stored record.
- Transport handles are sensitive and must not be logged by default.

## Session Resume

```ts
export interface ResumeOptions {
  store: ResumeStore;
  cleanup?: "delete-on-complete" | "mark-complete";
}

export interface LargeImageIngestSession {
  start(): Promise<IngestManifest>;
  resume(recordId: string): Promise<IngestManifest>;
  pause(reason?: unknown): void;
  cancel(reason?: unknown): Promise<void>;
}
```

Behavior:

- `start()` starts a fresh upload.
- `resume(recordId)` restores a specific stored upload and validates file, chunking, record, expiration, and remote transport state before sending bytes.
- `pause()` leaves a recoverable record after the current in-flight chunk settles.
- `cancel()` prevents the record from being offered for default recovery.

Example:

```ts
const sessionStore = new WebStorageResumeStore(localStorage);

const session = createIngestSession(file, {
  resume: {
    store: sessionStore,
  },
  transport,
});

await session.start();

const records = listRecoverableResumeRecords(await sessionStore.list());
let compatible: ResumeRecord | undefined;

for (const record of records) {
  if ((await classifyResumeRecordForFile(record, file)) === "compatible") {
    compatible = record;
    break;
  }
}

if (compatible) {
  await createIngestSession(file, {
    resume: { store: sessionStore },
    transport,
  }).resume(compatible.id);
}
```

## Transport Resume

```ts
export interface UploadSessionResult {
  uploadId: string;
  resumeToken?: string;
  expiresAt?: string;
  data?: Record<string, unknown>;
}

export interface UploadChunkResult {
  resumeToken?: string;
  expiresAt?: string;
  data?: Record<string, unknown>;
}

export interface ResumeSessionContext extends UploadSessionContext {
  record: ResumeRecord;
}

export interface UploadTransport {
  createSession(context: UploadSessionContext): Promise<UploadSessionResult>;
  resumeSession?(context: ResumeSessionContext): Promise<UploadSessionResult>;
  uploadChunk(context: UploadChunkContext): Promise<void | UploadChunkResult>;
  completeSession(context: UploadSessionContext & { uploadId: string }): Promise<void>;
}
```

Behavior:

- Persistent resume requires `resumeSession`.
- If `resumeSession` is absent, the core fails before upload with `resume.transport_unsupported`.
- `createSession` and `uploadChunk` may refresh transport resume metadata.

## Resume Events

```ts
export type ResumeEvent =
  | { type: "resume:available"; recordId: string; manifestId: string; status: ResumeRecordStatus }
  | { type: "resume:started"; recordId: string; manifestId: string }
  | { type: "resume:checkpoint"; recordId: string; completedChunkRanges: CompletedChunkRange[] }
  | { type: "resume:conflict"; recordId?: string; code: ResumeConflictCode; error: unknown }
  | { type: "upload:paused"; recordId?: string }
  | { type: "upload:canceled"; recordId?: string }
  | { type: "resume:expired"; recordId: string };
```

Behavior:

- Resume events must be distinguishable from transient retry events.
- Sensitive transport handles must not be included in default event payloads.
- Applications that need the full record must read it from their configured `ResumeStore`.

## Retry Versus Resume

Retry is in-process and chunk-scoped. It may retry a failed `uploadChunk` call during the same JavaScript runtime, but it does not persist upload IDs, manifest identity, or completed ranges.

Persistent resume is record-scoped. It writes a checkpoint only after a chunk is acknowledged, validates the selected file and chunking identity, asks the transport to validate remote state through `resumeSession`, then skips only chunks represented in the stored completed ranges.

## Security Considerations

Resume records are operational state, not final audit manifests. They may include remote upload IDs, resume tokens, expiration timestamps, filenames, and customer metadata copied through the manifest snapshot. Default SDK events expose record IDs and typed conflict codes, but not full transport state. Applications should avoid logging full records and should choose a persistence layer appropriate for their sensitivity requirements.
