# Public Contract Draft: TUS Transport Adapter

This contract describes the public TypeScript surface expected by the feature. Exact names can be refined during implementation, but the behavior and boundaries are required by the spec.

## Adapter Factory

```ts
export interface TusTransportOptions {
  endpoint: string | URL;
  detectExtensions?: boolean;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  metadata?: TusMetadataRecord | TusMetadataMapper;
  credentials?: RequestCredentials;
  fetch?: TusFetch;
  requiredExtensions?: readonly string[];
  terminateOnAbort?: boolean;
  uploadIdPrefix?: string;
}

export type TusFetch = (input: string, init?: RequestInit) => Promise<Response>;
export type TusMetadataValue = string | number | boolean | null | undefined;
export type TusMetadataRecord = Record<string, TusMetadataValue>;
export type TusMetadataMapper = (context: UploadSessionContext) => TusMetadataRecord | Promise<TusMetadataRecord>;

export function createTusTransport(options: TusTransportOptions): UploadTransport;
```

Behavior:

- Creates an `UploadTransport` compatible with `createIngestSession`.
- Keeps TUS-specific state inside transport resume metadata.
- Does not mutate original file bytes.
- Does not emit sensitive headers or upload URLs through default SDK events.

## Resume State

The adapter stores its remote upload URL in the provider-neutral `TransportSession.resumeToken` and `ResumeTransportState.resumeToken` fields. The value is sensitive and is redacted from default snapshot events.

Behavior:

- Stored inside `ResumeTransportState.data` or equivalent adapter-owned state.
- Treated as sensitive by default.
- Refreshed when `resumeSession` validates remote state.

## Failure Codes

```ts
export type TusTransportErrorCode =
  | "transport.failed"
  | "transport.part_rejected"
  | "transport.offset_mismatch"
  | "transport.session_expired"
  | "transport.complete_failed"
  | "transport.abort_failed"
  | "transport.resume_failed";
```

Behavior:

- Retryable failures can flow through existing chunk retry behavior.
- Offset mismatch, missing session, and expired session fail before skipped chunks continue.
- Error details must omit credentials, presigned URLs, and full resume handles.

## Fresh Upload Flow

```ts
const transport = createTusTransport({
  endpoint: "https://uploads.example.test/files",
  metadata({ manifest }) {
    return {
      manifestId: manifest.id,
      filename: manifest.original.name,
      mediaType: manifest.original.mediaType
    };
  }
});

const session = createIngestSession(file, {
  transport,
  resume: { store },
  chunking: { chunkSize: 64 * 1024 * 1024 }
});

await session.start();
```

## Resume Flow

```ts
const records = listRecoverableResumeRecords(await store.list());
const record = records[0];

if (record && (await classifyResumeRecordForFile(record, file)) === "compatible") {
  await createIngestSession(file, {
    transport,
    resume: { store }
  }).resume(record.id);
}
```

Behavior:

- `resume(recordId)` requires the adapter's `resumeSession` behavior.
- The adapter checks remote offset before the core skips completed chunk ranges.
- Mismatch or missing remote state fails before upload bytes are sent.

## Security Contract

- Upload URLs, bearer tokens, cookies, authorization headers, customer metadata, and full resume state are sensitive.
- Default event payloads may include stable record IDs and safe error codes, but not sensitive remote handles.
- Applications that need full resume state must read it from their configured `ResumeStore`.
