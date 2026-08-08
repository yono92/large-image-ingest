# large-image-ingest

TypeScript SDK for verifiable, resumable ingestion of very large inspection images while preserving the original file as the source of truth.

The package is built for semiconductor inspection, microscopy, industrial vision, wafer inspection, medical imaging, satellite imaging, and other workflows where the uploaded original is a source-of-truth artifact that must remain verifiable.

The package orchestrates validation, checksums, manifest generation, chunk planning, resumable session state, bounded multi-file queues, safe diagnostics, derivative references, and adapter-based storage transfer. It does not decode, resize, compress, tile, or otherwise transform images.

## Install

```bash
npm install large-image-ingest
```

## Verified Reference Run

The repository reference harness exercises the built package through real loopback HTTP, forces an interruption after durable progress, resumes with a replacement session, and verifies the stored file against its manifest.

| Scenario | Result |
| --- | ---: |
| Source size | 3 GiB |
| SHA-256 and manifest | 55.60 MiB/s |
| HTTP transfer including resume | 51.91 MiB/s |
| Peak JavaScript heap / RSS | 12.95 MiB / 185.64 MiB |
| Acknowledged bytes retransmitted | 0 |
| Remote completion calls | 1 |
| Stored-file SHA-256 | Verified |

This July 13, 2026 measurement used Node.js 24.17.0 on Windows with a 64 MiB upload chunk. The client and local reference server shared one process; loopback throughput is not a remote-provider guarantee. See the [methodology, full memory metrics, limitations, and reproduction commands](docs/benchmarks.md).

## Quick Start

```ts
import { createIngestSession } from "large-image-ingest/core";

const session = createIngestSession(file, {
  chunking: {
    chunkSize: 64 * 1024 * 1024
  },
  validation: {
    maxBytes: 10 * 1024 * 1024 * 1024,
    acceptedMimeTypes: ["image/tiff", "image/png", "image/jpeg"],
    acceptedExtensions: ["tif", "tiff", "png", "jpg", "jpeg"],
    requiredMetadata: ["lotId", "waferId"]
  },
  image: {
    format: "tiff",
    width: 4096,
    height: 4096,
    colorDepth: 16
  },
  metadata: {
    lotId: "LOT-2026-001",
    waferId: "W12"
  },
  transport: {
    capabilities: {
      name: "app-api",
      resumable: true,
      abortable: true,
      expires: false,
      supportsParallelChunks: false,
      supportsChunkChecksum: false
    },
    async createSession({ manifest }) {
      return {
        uploadId: `upload-${manifest.id}`,
        transportName: "app-api",
        createdAt: new Date().toISOString()
      };
    },
    async uploadChunk({ chunk, body }) {
      await fetch(`/api/uploads/chunks/${chunk.index}`, {
        method: "PUT",
        body
      });

      return {
        chunkIndex: chunk.index,
        sizeBytes: body.size,
        completedAt: new Date().toISOString(),
        transport: { name: "app-api" }
      };
    },
    async completeSession({ manifest, uploadId, receipts }) {
      await fetch(`/api/uploads/${uploadId}/complete`, {
        method: "POST",
        body: JSON.stringify({ manifest, receipts })
      });
    }
  },
  onEvent(event) {
    console.log(event.type);
  }
});

const manifest = await session.start();
const evidence = session.getCompletionEvidence();

if (evidence?.status === "verified") {
  // Whole stored-object size and checksum match the source manifest.
} else {
  // Transport completion succeeded without equivalent stored-byte proof.
}
```

More examples are in [docs/quickstart.md](docs/quickstart.md).

## What It Provides

- Original-preserving manifest schema `large-image-ingest.manifest.v1`
- Evidence-grade completion schema `large-image-ingest.completion.v1` with explicit verified/unverified status
- File validation for size, MIME type, extension, metadata, dimensions, and checksum mismatch
- Whole-file SHA-256 checksums using bounded `Blob.slice` reads
- Optional Web Worker-compatible checksum execution with cancellation and validated progress
- Deterministic chunk planning for large files
- Upload sessions with progress, retry, pause, cancel, failure, completion, and resume events
- Opt-in bounded parallel chunk scheduling for transports that explicitly advertise support
- Content-bound persistent resume records (`large-image-ingest.resume.v0.3`) with durable chunk receipts
- Safe diagnostics helpers for logs, telemetry, support traces, and recovery UI
- Derivative references for previews, thumbnails, tiles, metadata enrichments, and custom outputs
- Browser-safe tus and S3 multipart transport helpers
- Server-side NAS gateway and stored-file verification helpers under the Node subpath
- ESM, CommonJS, and TypeScript declaration entrypoints

The optional React subpath contains headless state and control hooks only. The package does not include styled React components, image decoding, raster or thumbnail rendering, resize, tile generation, image viewing, or cloud SDKs. The optional TIFF subpath probes structural metadata without decoding pixels. Processing, presentation, and provider SDKs remain caller-owned adapters or companion packages.

## Package Map

```txt
large-image-ingest
large-image-ingest/core
large-image-ingest/transport-tus
large-image-ingest/transport-s3
large-image-ingest/node
large-image-ingest/react
large-image-ingest/tiff
large-image-ingest/schemas/manifest.v1
large-image-ingest/schemas/resume.v0.3
large-image-ingest/schemas/completion.v1
```

- Use `large-image-ingest/core` for framework-agnostic browser-safe core APIs.
- Use `large-image-ingest/transport-tus` for the raw `fetch` tus transport.
- Use `large-image-ingest/transport-s3` for broker-backed S3 multipart uploads.
- Use `large-image-ingest/node` for server-only NAS gateway, metadata derivative, tile descriptor, and stored-file verification APIs.
- Use `large-image-ingest/react` for optional headless React state and upload controls.
- Use `large-image-ingest/tiff` for optional bounded TIFF and BigTIFF structural metadata probing.
- Use `large-image-ingest` as a compatibility root for core plus browser-safe transports.
- Use the `large-image-ingest/schemas/*` subpaths for packaged JSON Schema Draft 2020-12 contracts.

## React Headless Adapter

Install React alongside the SDK only when the optional React subpath is used.

```bash
npm install large-image-ingest react
```

The adapter provides state and controls without rendering a dropzone, dashboard, buttons, or CSS.

```tsx
import { useState } from "react";
import type { CreateIngestSessionOptions, IngestFileLike } from "large-image-ingest";
import {
  IngestProvider,
  createIngestController,
  useIngestSession,
  useUploadControls,
  useUploadProgress
} from "large-image-ingest/react";

function UploadStatus() {
  const { status, error } = useIngestSession();
  const { progress } = useUploadProgress();
  const { start, pause, cancel, canStart, canPause, canCancel } = useUploadControls();

  return (
    <section>
      <progress value={progress} max={1} />
      <output>{status}</output>
      <button onClick={() => void start()} disabled={!canStart}>Upload</button>
      <button onClick={() => pause()} disabled={!canPause}>Pause</button>
      <button onClick={() => void cancel()} disabled={!canCancel}>Cancel</button>
      {error ? <output>Upload failed</output> : null}
    </section>
  );
}

function UploadPanel({
  file,
  options
}: {
  file: IngestFileLike;
  options: CreateIngestSessionOptions;
}) {
  const [controller] = useState(() => createIngestController(file, options));
  return (
    <IngestProvider controller={controller}>
      <UploadStatus />
    </IngestProvider>
  );
}
```

Keep the controller mounted above route changes when uploads must continue while individual UI components unmount.

## TIFF And BigTIFF Metadata

Install the optional parser peer only when TIFF metadata probing is needed.

```bash
npm install large-image-ingest geotiff
```

The TIFF subpath validates binary headers, bounds image file directory traversal, and reports structural metadata without decoding raster pixels.

```ts
import {
  probeTiffMetadata,
  toTiffImageMetadata
} from "large-image-ingest/tiff";

const probe = await probeTiffMetadata(file, {
  maxDirectories: 64,
  signal: abortController.signal
});

const primary = probe.directories[0];
console.log(probe.container, probe.directoryCount, primary?.layout);

const image = toTiffImageMetadata(probe);
const session = createIngestSession(file, {
  ...options,
  image
});
```

The probe reports width, height, bit depth, samples, compression, photometric interpretation, orientation, planar configuration, and tile or strip layout when available. GeoTIFF.js documents limited BigTIFF support; unsupported 64-bit offsets or parser-specific BigTIFF structures fail with typed errors. This subpath does not render TIFF, read raster pixels, generate thumbnails, resize images, or create tile pyramids.

## Derivatives

Previews, thumbnails, tile pyramids, metadata extractions, compressed outputs, and custom transformed outputs are modeled as derivatives. They never replace or rewrite the original source artifact.

```ts
import {
  attachDerivative,
  createPreviewDerivative,
  validateManifestDerivatives
} from "large-image-ingest";

const preview = createPreviewDerivative({
  manifest,
  id: "preview-1024",
  kind: "preview",
  status: "created",
  mediaType: "image/jpeg",
  width: 1024,
  height: 1024,
  storage: {
    kind: "object",
    label: "preview-store",
    locationHint: "previews/manifest-id-1024.jpg"
  }
});

const manifestWithPreview = attachDerivative(manifest, preview);
const derivativeValidation = validateManifestDerivatives(manifestWithPreview);
```

See [docs/derivatives.md](docs/derivatives.md) for derivative boundaries and examples.

## Transports And Storage

- tus: resumable browser uploads through `large-image-ingest/transport-tus`
- S3 multipart: broker-backed presigned part upload flow through `large-image-ingest/transport-s3`
- NAS: server-side staging/finalize gateway through `large-image-ingest/node`

The browser core does not write directly to SMB, NFS, NAS, WebDAV, SFTP, or a filesystem. Use a server-side gateway for those targets.

### Extreme-file execution

Checksum calculation stays sequential and bounded by default. Applications that need to keep the browser UI responsive during multi-gigabyte hashing can inject `createWorkerChecksumExecutor()` and bundle the small runtime installer in their own module Worker. The application owns the Worker URL, CSP, and bundler configuration; see [examples/worker-checksum.ts](examples/worker-checksum.ts).

Chunk transfer also remains sequential by default. Set `execution.maxParallelChunks` only when the configured transport reports `supportsParallelChunks: true`:

```ts
const session = createIngestSession(file, {
  execution: { maxParallelChunks: 4 },
  transport: parallelCapableTransport
});
```

The SDK accepts limits from 1 through 32, settles work in bounded batches, and serializes validated durable checkpoints by chunk index. Start conservatively: each active chunk consumes a request, provider/broker capacity, and transport-specific buffering even though Blob slices do not copy the whole file. The official tus and S3 helpers remain sequential.

### Production multi-file orchestration

`createIngestQueue()` composes existing single-file sessions into a FIFO queue with explicit active-item, admitted-byte, and stored-item limits. It remains framework- and provider-neutral: the application supplies `CreateIngestSessionOptions` per item, so transports and credentials are runtime-only.

```ts
import { createIngestQueue, WebStorageQueueStore } from "large-image-ingest/core";

const queue = createIngestQueue({
  maxActiveItems: 2,
  maxActiveBytes: 8 * 1024 ** 3,
  store: new WebStorageQueueStore(localStorage),
  createSessionOptions({ itemId }) {
    return {
      checksum: { required: true },
      resume: { store: resumeStore },
      transport: createTransportForItem(itemId)
    };
  },
  resolveSource(identity, itemId) {
    return reattachExactSource(identity, itemId);
  }
});

await queue.restore();
await queue.enqueue(file);
await queue.start();
```

Queue storage contains versioned operational intent, never source bytes, live `File`/`Blob` objects, manifests, checksums, transport handles, receipts, URLs, credentials, callbacks, or raw errors. Restored work stays `needs-source` until the application supplies a metadata-matching source; session resume then performs the authoritative whole-file content check.

`maxActiveBytes` is an admission budget based on source sizes, not exact heap usage. Total active network calls can approach `maxActiveItems × execution.maxParallelChunks`, so measure both limits conservatively. See [the multi-file example](examples/multi-file-queue.ts) and [1.6 migration guide](docs/migration-1.6.md).

### Inspection policies and signable evidence

Versioned metadata profiles and policy packs turn manifest/completion facts into deterministic inspection decisions without decoding pixels or importing a provider SDK:

```ts
import {
  EVIDENCE_GRADE_INSPECTION_POLICY_V1,
  createEvidenceBundle,
  evaluateInspectionPolicy,
  signEvidenceBundle
} from "large-image-ingest/core";

const policyReport = evaluateInspectionPolicy({
  manifest,
  completion: session.getCompletionEvidence(),
  policy: EVIDENCE_GRADE_INSPECTION_POLICY_V1
});

const bundle = createEvidenceBundle({ manifest, completion, policyReport });
const envelope = await signEvidenceBundle(bundle, applicationOwnedSigner);
```

The built-in evidence-grade policy requires semiconductor lot/wafer/inspection/tool identity, original preservation, whole-file SHA-256, verified completion, and matching stored checksum facts. Custom serializable profiles/policies are supported.

Signing callbacks receive canonical bundle bytes only. Private keys, KMS/HSM clients, certificate chains, trust stores, timestamp authorities, and regulatory interpretation remain application responsibilities. Verification recomputes the payload digest before calling the application trust callback. See [the 1.7 migration guide](docs/migration-1.7.md), [custom policy example](examples/inspection-policy.ts), and [WebCrypto boundary example](examples/evidence-signing.ts).

NAS gateway instances that share a staging root coordinate same-session staging, finalization, cancellation, and expired cleanup. Session metadata is promoted atomically from unique same-directory candidates so concurrent or interrupted updates preserve the last committed state without changing the v0.1 session schema.

Persistent resume records created by 1.4.0 use schema `large-image-ingest.resume.v0.3`. In addition to acknowledged chunk receipts, each new record binds progress to the original whole-file SHA-256 identity. The selected source is hashed again before any transport resume lookup. Matching metadata with different bytes fails as `resume.content_mismatch`; missing trustworthy identity fails as `resume.content_identity_missing`.

Legacy v0.1/v0.2 records remain readable. They resume only when the embedded manifest supplies equivalent whole-file identity and the transport has enough authoritative receipt state. Progressed S3 v0.1 records remain rejected because ETags cannot be reconstructed safely. See the [1.4 migration guide](docs/migration-1.4.md).

Full resume records can contain upload identifiers, tus upload URLs, customer metadata, object keys, and provider receipt evidence. Store them according to application security policy and use the diagnostic redaction helpers for logs and support output.

Starting in 1.3.0, successful transport completion remains authoritative even when local resume-record cleanup fails. The session still resolves with a completed snapshot and emits a non-fatal `resume:cleanup-failed` event so applications can inspect or remove stale local state without retrying remote completion.

Starting in 1.4.0, the pre-upload manifest remains an immutable intent artifact with `upload.status: "pending"`. Every successful session separately exposes one `completion.v1` evidence record through `getCompletionEvidence()`, the completed event, and React controller state. A `verified` result requires matching whole stored-object size and same-algorithm checksum; multipart ETags, tus offsets, and HTTP success alone yield `completed-unverified`.

Event and snapshot observers are isolated from upload control flow. Use `onObserverError` when UI or telemetry callback failures need separate reporting; exceptions from observers or from the reporter itself never change session state.

```ts
const session = createIngestSession(file, {
  ...options,
  onEvent(event) {
    if (event.type === "resume:cleanup-failed") {
      reportLocalCleanupWarning(createSafeEventSummary(event));
    }
  },
  onObserverError({ observer, eventType, error }) {
    reportUiObserverFailure({ observer, eventType, error });
  }
});
```

Server-owned credential, object key, NAS path, cleanup, and final verification responsibilities are documented in [docs/server-operational-guide.md](docs/server-operational-guide.md).

## Documentation

- [Quickstart and API examples](docs/quickstart.md)
- [Derivative and preview foundations](docs/derivatives.md)
- [Reference integration and benchmarks](docs/benchmarks.md)
- [Opt-in integration test policy](docs/integration-tests.md)
- [Server operational guide](docs/server-operational-guide.md)
- [Roadmap](docs/roadmap.md)
- [Changelog](CHANGELOG.md)

## Verification

```bash
npm ci
npm run typecheck
npm run typecheck:examples
npm test
npm run build
npm run test:reference
npm pack --dry-run
```

Default verification is local and credential-free. The reference gate performs a 64 MiB HTTP interruption-and-resume scenario with stored-file verification. Real tus servers, S3-compatible buckets, and mounted NAS paths remain explicit opt-in integration checks.

## Design Principles

1. Preserve the original file by default.
2. Treat resize, compression, EXIF stripping, previews, thumbnails, and tiles as derivatives.
3. Use chunked upload flows for large files.
4. Generate a manifest before upload starts.
5. Make upload state observable and recoverable.
6. Keep the core framework-agnostic.
7. Use adapters for upload transports and storage targets.
8. Keep runtime dependencies small.
