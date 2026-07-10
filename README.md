# large-image-ingest

`large-image-ingest` is a TypeScript-first core SDK for safely ingesting very large inspection images.

The primary use cases are semiconductor inspection, microscopy, industrial vision, wafer inspection, medical imaging, satellite imaging, and other workflows where the uploaded original is a source-of-truth artifact.

This is not a generic drag-and-drop uploader. The core package focuses on original preservation, validation, checksums, manifest generation, chunk planning, resumable session state, and adapter-based upload orchestration.

## Installation

```bash
npm install large-image-ingest
```

## Core Scope

The package provides a framework-agnostic core:

- File validation for size, MIME type, extension, required metadata, and caller-provided dimensions.
- Whole-file SHA-256 checksum generation with bounded `Blob.slice` reads.
- Deterministic chunk planning for large files.
- Manifest schema `large-image-ingest.manifest.v1`.
- Upload sessions with progress, retry, pause, cancel, failure, completion, and resume events.
- Redacted session snapshots and persistent resume records for app-owned persistence.
- Provider-neutral transport adapter interface.
- Manifest, receipt, and stored-file verification helpers.
- Derivative references for previews, thumbnails, tiles, metadata enrichments, and custom outputs.
- Browser-safe tus and S3 multipart transport helpers.
- Server-side NAS gateway helpers under the Node subpath.
- ESM, CommonJS, and TypeScript declaration entrypoints.

The package does not include React, image decoding, thumbnail rendering, tile generation, cloud SDKs, or UI implementations. Those remain optional adapters or companion packages.

## Design Principles

1. Preserve the original file by default.
2. Treat resize, compression, EXIF stripping, previews, thumbnails, and tiles as derivatives.
3. Use chunked upload flows for large files.
4. Generate a manifest before upload starts.
5. Make upload state observable and recoverable.
6. Keep the core framework-agnostic.
7. Use adapters for upload transports and storage targets.
8. Keep runtime dependencies small.

## JavaScript And TypeScript

ESM:

```js
import { createIngestSession } from "large-image-ingest";
```

CommonJS:

```js
const { createIngestSession } = require("large-image-ingest");
```

TypeScript declarations are published with the package.

## Current Package Map

The 1.0 package stays in a single npm package and uses subpath exports to keep API boundaries clear. This avoids premature workspace churn while leaving a clean migration path to scoped packages later.

```txt
large-image-ingest
large-image-ingest/core
large-image-ingest/transport-tus
large-image-ingest/transport-s3
large-image-ingest/node
```

Import guidance:

- Use `large-image-ingest/core` for framework-agnostic browser-safe core APIs.
- Use `large-image-ingest/transport-tus` for the raw `fetch` tus transport.
- Use `large-image-ingest/transport-s3` for the broker-backed S3 multipart transport.
- Use `large-image-ingest/node` for server-only NAS gateway and stored-file verification APIs.
- Use `large-image-ingest` as a compatibility root for core plus browser-safe transports.

Future package migration, if needed, should map these subpaths directly to scoped packages:

```txt
large-image-ingest/core          -> @large-image-ingest/core
large-image-ingest/transport-tus -> @large-image-ingest/transport-tus
large-image-ingest/transport-s3  -> @large-image-ingest/transport-s3
large-image-ingest/node          -> @large-image-ingest/node
```

## Example API

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
    waferId: "W12",
    tool: "VFVI",
    inspectionType: "defect-review"
  },
  transport: {
    capabilities: {
      name: "app-api",
      resumable: true,
      abortable: true,
      expires: false,
      supportsParallelChunks: false,
      supportsChunkChecksum: false,
    },
    async createSession({ manifest }) {
      return {
        uploadId: `upload-${manifest.id}`,
        transportName: "app-api",
        createdAt: new Date().toISOString(),
      };
    },
    async uploadChunk({ chunk, body }) {
      const response = await fetch(`/api/uploads/chunks/${chunk.index}`, {
        method: "PUT",
        body
      });

      return {
        chunkIndex: chunk.index,
        sizeBytes: body.size,
        completedAt: new Date().toISOString(),
        transport: {
          name: "app-api",
          etag: response.headers.get("etag") ?? undefined,
        },
      };
    },
    async completeSession({ manifest, uploadId, receipts }) {
      await fetch(`/api/uploads/${uploadId}/complete`, {
        method: "POST",
        body: JSON.stringify({ manifest, receipts }),
      });
    }
  },
  onEvent(event) {
    if (event.type === "chunk:completed") {
      console.log(event.type, event.uploadedBytes, event.totalBytes);
      return;
    }

    console.log(event.type);
  },
  onSnapshot(snapshot) {
    // Full snapshots may include transport resume handles. Store them only in
    // an application-approved persistence layer, and do not log the full object.
    console.log(snapshot.status, snapshot.uploadedBytes);
  },
});

const manifest = await session.start();
```

## Persistent Resume

Transient retry and persistent resume are separate behaviors:

- Retry happens inside one running session. A failed chunk can be attempted again before the session fails.
- Persistent resume stores a versioned resume record so a later session can recover after a refresh, crash, or process restart.

Browser resume still requires the application to ask the user for the same original file again. The SDK stores upload metadata, chunk checkpoints, manifest identity, and transport resume handles; it does not store original image bytes.

```ts
import {
  WebStorageResumeStore,
  classifyResumeRecordForFile,
  createIngestSession,
  listRecoverableResumeRecords,
} from "large-image-ingest";

const resumeStore = new WebStorageResumeStore(localStorage);

const transport = {
  async createSession({ manifest }) {
    const response = await fetch("/api/uploads", {
      method: "POST",
      body: JSON.stringify({ manifestId: manifest.id }),
    });
    return response.json() as Promise<{
      uploadId: string;
      resumeToken?: string;
      expiresAt?: string;
    }>;
  },
  async resumeSession({ record }) {
    const response = await fetch(`/api/uploads/${record.transport.uploadId}/resume`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${record.transport.resumeToken}`,
      },
    });
    return response.json() as Promise<{
      uploadId: string;
      resumeToken?: string;
      expiresAt?: string;
    }>;
  },
  async uploadChunk({ uploadId, chunk, body }) {
    const response = await fetch(`/api/uploads/${uploadId}/chunks/${chunk.index}`, {
      method: "PUT",
      body,
    });
    return response.json() as Promise<{ resumeToken?: string; expiresAt?: string }>;
  },
  async completeSession({ uploadId, manifest }) {
    await fetch(`/api/uploads/${uploadId}/complete`, {
      method: "POST",
      body: JSON.stringify(manifest),
    });
  },
};

const session = createIngestSession(file, {
  chunking: { chunkSize: 64 * 1024 * 1024 },
  resume: { store: resumeStore },
  transport,
  onEvent(event) {
    if (event.type === "resume:checkpoint") {
      // Persisted after an acknowledged chunk. Safe to update UI progress.
    }
  },
});

await session.start();
```

To offer recovery after a reload:

```ts
const records = listRecoverableResumeRecords(await resumeStore.list());
const record = records[0];

if (record && (await classifyResumeRecordForFile(record, file)) === "compatible") {
  const session = createIngestSession(file, {
    resume: { store: resumeStore },
    transport,
  });
  await session.resume(record.id);
}
```

By default completed records are deleted. Use `resume: { store, cleanup: "mark-complete" }` when an application wants to retain terminal records for local audit or debugging.

### Resume Security Notes

Resume records can contain sensitive transport handles, remote upload IDs, filenames, and user metadata. Do not print full resume records, presigned URLs, credentials, or customer metadata in default logs. Store records only in an application-approved persistence layer, and prefer short-lived or revocable transport resume tokens. Canceling a session marks the record `canceled`, so default recovery helpers will not offer it again.

## Checksum

By default, `createManifest` and `createIngestSession` calculate a whole-file SHA-256 checksum. The implementation reads the file in bounded chunks with `Blob.slice`, so the core does not need to load the entire image into memory at once.

```ts
import { calculateChecksum } from "large-image-ingest";

const checksum = await calculateChecksum(file, {
  chunkSize: 4 * 1024 * 1024,
  onProgress(progress) {
    console.log(progress.loadedBytes, progress.totalBytes);
  }
});
```

You can require an expected checksum:

```ts
const manifest = await createManifest(file, {
  checksum: {
    expected: "known-sha256-hex-value"
  }
});

if (!manifest.validation.ok) {
  console.log(manifest.validation.issues);
}
```

For specialized workflows where checksum calculation is handled elsewhere, pass `checksum: false`.

## Verification

Use core verification when you need to check a manifest, file-like object, and upload receipts before promoting an upload in application state.

```ts
import { verifyIngestIntegrity } from "large-image-ingest/core";

const report = await verifyIngestIntegrity({
  manifest,
  file,
  receipts,
});

if (!report.ok) {
  console.log(report.issues.map((issue) => issue.code));
}
```

Use Node verification after a server-side publish or NAS finalize step to compare the stored file against the manifest without loading the whole file into memory.

```ts
import { verifyNodeFileManifest } from "large-image-ingest/node";

const report = await verifyNodeFileManifest(
  "/mnt/inspection-originals/fab-a/lot-001/wafer-12/original.tif",
  manifest
);

if (!report.ok) {
  throw new Error(`Stored original failed verification: ${report.issues[0]?.code}`);
}
```

Verification reports use typed `verification.*` issue codes and avoid including presigned URLs, credentials, raw customer metadata, or full manifests in default issue details.

## Validation

```ts
import { validateFile } from "large-image-ingest";

const result = validateFile(
  file,
  {
    acceptedExtensions: ["tif", "tiff"],
    acceptedMimeTypes: ["image/tiff"],
    maxBytes: 10 * 1024 * 1024 * 1024,
    minWidth: 1024,
    minHeight: 1024,
    requiredMetadata: ["lotId", "waferId"]
  },
  {
    lotId: "LOT-2026-001",
    waferId: "W12"
  },
  {
    width: 4096,
    height: 4096
  }
);
```

Dimension validation uses caller-provided image metadata. The core does not decode TIFF, microscopy, satellite, DICOM, OME-TIFF, or proprietary inspection formats in 1.0.

## Manifest

Manifest creation preserves the original and records validation, checksum, chunking, storage hints, metadata, and derivative placeholders.

```ts
import { createManifest } from "large-image-ingest";

const manifest = await createManifest(file, {
  chunking: { chunkSize: 64 * 1024 * 1024 },
  metadata: {
    lotId: "LOT-2026-001",
    waferId: "W12"
  },
  storage: {
    kind: "nas",
    label: "fab-qc-nas",
    locationHint: "/inspection/inbox"
  }
});
```

Example shape:

```json
{
  "schemaVersion": "large-image-ingest.manifest.v1",
  "id": "manifest_...",
  "createdAt": "2026-07-01T00:00:00.000Z",
  "library": {
    "name": "large-image-ingest",
    "version": "1.0.0"
  },
  "original": {
    "kind": "original",
    "name": "wafer-aoi-001.tif",
    "extension": "tif",
    "sizeBytes": 1843221900,
    "mediaType": "image/tiff",
    "lastModifiedAt": "2026-07-01T00:00:00.000Z",
    "fingerprint": {
      "algorithm": "metadata-sha256",
      "scope": "file-metadata",
      "value": "..."
    },
    "checksum": {
      "algorithm": "sha256",
      "scope": "whole-file",
      "value": "...",
      "chunkSizeBytes": 4194304,
      "calculatedAt": "2026-07-01T00:00:00.000Z"
    },
    "preservation": {
      "required": true,
      "allowedMutations": []
    }
  },
  "image": {
    "status": "provided",
    "format": "tiff",
    "width": 4096,
    "height": 4096,
    "colorDepth": 16
  },
  "chunking": {
    "strategy": "fixed-size",
    "chunkSizeBytes": 67108864,
    "totalBytes": 1843221900,
    "totalChunks": 28,
    "chunkRangesIncluded": false
  },
  "upload": {
    "status": "pending",
    "resumable": true,
    "retryLimit": 2
  },
  "metadata": {
    "lotId": "LOT-2026-001",
    "waferId": "W12"
  },
  "derivatives": [],
  "validation": {
    "ok": true,
    "issues": []
  }
}
```

## Derivatives And Previews

Derivatives are separate manifest entries that point back to the original source identity. Adding a preview, thumbnail, tile pyramid, metadata extraction, or custom output never rewrites `manifest.original`.

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
  },
  provenance: {
    generator: "app-preview-worker",
    environment: "browser"
  }
});

const manifestWithPreview = attachDerivative(manifest, preview);
const derivativeValidation = validateManifestDerivatives(manifestWithPreview);
```

Derivative statuses:

- `planned`: expected later, but no generated asset is claimed yet.
- `created`: the derivative asset or metadata output exists and is referenced outside the manifest.
- `failed`: derivative generation failed while the original manifest remains intact unless the application marks the derivative as required.

Browser preview helpers accept caller-provided descriptors and do not read, decode, rewrite, or embed original bytes by default. Server-side metadata and tile helpers are available from `large-image-ingest/node`.

See [docs/derivatives.md](docs/derivatives.md) for derivative boundaries and examples.

## Session State

### tus

Use tus for resumable browser uploads.

Current implementation:

- `createTusTransport` implements the tus 1.0 creation/core flow with native `fetch`.
- Upload URLs are stored as transport resume tokens and redacted from default snapshot events.
- The transport verifies remote offset with `HEAD` before each sequential `PATCH`.
- Persistent `resume(recordId)` validates the remote offset before completed local chunks are skipped.
- `terminateOnAbort` can send tus `DELETE` when the server supports the termination extension.

```ts
import { createIngestSession } from "large-image-ingest/core";
import { createTusTransport } from "large-image-ingest/transport-tus";

const session = createIngestSession(file, {
  transport: createTusTransport({
    endpoint: "/files",
    detectExtensions: true,
    metadata({ manifest }) {
      return {
        manifestId: manifest.id,
        filename: manifest.original.name,
        mediaType: manifest.original.mediaType,
      };
    },
  }),
});
```

Optional companion dependencies:

- `@tus/server`
- `tus-js-client` if broader tus client behavior is needed later

Best for:

- Pause/resume
- Browser refresh recovery
- Network instability
- Self-hosted upload server

### S3 Multipart

Use S3 multipart upload for direct-to-object-storage workflows.

Current implementation:

- `createS3MultipartTransport` uploads parts with browser-safe presigned `PUT` requests.
- The application broker owns credentials, bucket policy, object key generation, multipart creation, completion, and abort.
- Intermediate parts must satisfy S3 multipart limits. The final part may be smaller.
- Completion uses locally recorded `partNumber` and `ETag` receipts, not list-parts output.

```ts
import {
  createIngestSession,
} from "large-image-ingest/core";
import {
  createS3MultipartTransport,
  type S3MultipartBroker,
} from "large-image-ingest/transport-s3";

const broker: S3MultipartBroker = {
  async createMultipartUpload({ manifest }) {
    const response = await fetch("/api/s3/multipart", {
      method: "POST",
      body: JSON.stringify({ manifestId: manifest.id }),
    });

    return response.json();
  },
  async getUploadPartUrl({ uploadId, key, partNumber }) {
    const response = await fetch("/api/s3/multipart/part-url", {
      method: "POST",
      body: JSON.stringify({ uploadId, key, partNumber }),
    });

    return response.json();
  },
  async completeMultipartUpload({ uploadId, key, parts }) {
    await fetch("/api/s3/multipart/complete", {
      method: "POST",
      body: JSON.stringify({ uploadId, key, parts }),
    });
  },
  async abortMultipartUpload({ uploadId, key }) {
    await fetch("/api/s3/multipart/abort", {
      method: "POST",
      body: JSON.stringify({ uploadId, key }),
    });
  },
};

const session = createIngestSession(file, {
  chunking: {
    chunkSize: 64 * 1024 * 1024,
  },
  transport: createS3MultipartTransport({ broker }),
});
```

Broker requirements:

- Generate or approve object keys from trusted application policy, not raw filenames.
- Do not return cloud credentials to browser code.
- Return only short-lived part upload URLs from `getUploadPartUrl`.
- Expose `ETag` to browser code through CORS so part receipts can be recorded.
- Configure lifecycle cleanup for incomplete multipart uploads.

Optional companion dependencies:

- AWS SDK on the application server or broker
- S3-compatible object storage SDKs on the broker

Best for:

- Cloud-native storage
- Very large files
- Avoiding app server bandwidth usage

### NAS Gateway

Use the NAS gateway on the server side. Browsers should upload chunks to an application server or upload gateway, and that server should stage and finalize files into mounted NAS-backed storage.

Current implementation:

- `createNasGateway` is exported from `large-image-ingest/node`.
- Sessions write JSON metadata under a staging root.
- Chunks are staged under generated session directories.
- Target paths are resolved under a configured target root and reject path traversal.
- Finalize verifies all chunks, assembles a temporary target file, then renames it into place.
- Finalize is serialized per session through a lock provider. The default uses a shared file lock under `stagingRoot/.locks`.
- Redis, database, or orchestration-specific locks can be provided with the same `lockProvider` interface.
- Canceled and expired staging sessions can be cleaned up.

```ts
import { createNasFileLockProvider, createNasGateway } from "large-image-ingest/node";

const gateway = createNasGateway({
  stagingRoot: "/mnt/inspection-staging",
  targetRoot: "/mnt/inspection-originals",
  defaultExpiresInMs: 24 * 60 * 60 * 1000,
  lockProvider: createNasFileLockProvider({
    lockRoot: "/mnt/inspection-staging/.locks",
    staleLockMs: 2 * 60 * 60 * 1000,
  }),
});

const session = await gateway.createSession({
  sessionId: "upload_01",
  targetRelativePath: "fab-a/lot-001/wafer-12/original.tif",
  totalBytes: fileSize,
  expectedChunks: totalChunks,
  metadata: {
    lotId: "LOT-001",
    waferId: "W12",
  },
});

await gateway.stageChunk({
  sessionId: session.sessionId,
  index: 0,
  body: chunkBytes,
});

await gateway.finalizeSession({
  sessionId: session.sessionId,
});
```

Deployment patterns:

- Browser to application server, then application server to mounted NAS.
- Browser to tus gateway, then gateway finalizes into NAS with `createNasGateway`.
- Browser to WebDAV/SFTP gateway, then gateway stages chunks under the server-controlled staging root.

Safety rules:

- Treat filenames and metadata as labels, not trusted paths.
- Generate `targetRelativePath` from application policy.
- Keep staging and target roots on the same volume when atomic rename behavior matters.
- Keep `lockRoot` on shared storage, or provide a Redis/database-backed `lockProvider`, when multiple servers can finalize the same session.
- Set `staleLockMs` longer than the maximum expected finalize duration if stale file locks should be reclaimed automatically.
- Run cleanup for expired staging sessions.

## Examples

The repository includes focused examples for the current package map:

- `examples/custom-transport.ts`: custom application upload API.
- `examples/tus-transport.ts`: browser upload through a tus endpoint.
- `examples/s3-multipart.ts`: browser upload through a broker-backed S3 multipart flow.
- `examples/nas-gateway-route.ts`: server-side NAS staging and finalize route shape.

## Integration Tests

Default verification remains local and credential-free. Real tus servers, S3-compatible buckets, and mounted NAS paths should be covered by explicit opt-in integration tests only.

See `docs/integration-tests.md` for the integration test policy, required safeguards, and suggested environment variables.

Run the opt-in harness without configuration to verify that real infrastructure is skipped:

```bash
npm run test:integration
```

## Validation Rules

Initial validation should support:

- Required metadata fields
- Maximum file size
- Allowed MIME types
- Allowed extensions
- Minimum and maximum dimensions when detectable
- Empty file detection
- Duplicate file detection by fingerprint
- Optional checksum requirement

Validation returns structured issues:

```ts
if (!result.ok) {
  for (const issue of result.issues) {
    console.log(issue.code, issue.path, issue.message);
  }
}
```

## Session Snapshots And Events

Sessions emit typed events through `onEvent` and can publish full caller-controlled snapshots through `onSnapshot`.

Snapshot events emitted through `onEvent` are redacted before delivery. Full snapshots delivered through `onSnapshot` are intended for application-owned persistence, such as IndexedDB or a server-side session store, and may include transport resume handles needed for recovery. Do not log full events, manifests, resume records, or snapshots by default; log stable identifiers, status, progress counters, and typed error codes instead.

Snapshot status values include:

```txt
idle
validating
creating
uploading
paused
resuming
completing
completed
failed
canceled
```

Important event names include:

```txt
validated
started
snapshot
chunk:started
chunk:completed
retry
resume:available
resume:started
resume:checkpoint
resume:conflict
resume:expired
upload:paused
upload:canceled
paused
canceled
completed
failed
```

Pause and cancel are lifecycle actions. A paused session records a recoverable snapshot or resume record when possible. A canceled session asks the transport to abort the remote upload when the adapter supports it.

```ts
const session = createIngestSession(file, {
  transport,
  onSnapshot(snapshot) {
    // Full snapshot for caller-controlled persistence; avoid default full-object logging.
    void saveSnapshot(snapshot);
  },
});

const upload = session.start();
session.pause();
await upload.catch(() => undefined);
```

## Safe Diagnostics

Use diagnostics helpers when writing logs, telemetry, support traces, or recovery UI state. These helpers keep public IDs, status, progress, typed codes, and retryability while omitting full manifests, customer metadata, resume tokens, presigned URLs, opaque transport payloads, and sensitive resume state.

```ts
import {
  createSafeEventSummary,
  redactResumeRecord,
  redactUploadSessionSnapshot,
} from "large-image-ingest/core";

const session = createIngestSession(file, {
  transport,
  onEvent(event) {
    void writeLog(createSafeEventSummary(event));
  },
  onSnapshot(snapshot) {
    const { snapshot: safeSnapshot } = redactUploadSessionSnapshot(snapshot);
    void updateSupportPanel(safeSnapshot.status, safeSnapshot.uploadedBytes);
  },
});

const safeRecord = redactResumeRecord(record);
```

## Retry Policy

The `retries` option remains supported. For more explicit behavior, use `retryPolicy`.

```ts
const session = createIngestSession(file, {
  transport,
  retryPolicy: {
    maxAttempts: 4,
    delayMs: 250,
    backoffFactor: 2,
    maxDelayMs: 5_000,
    jitter: "full",
  },
});
```

`maxAttempts` is the total number of attempts for a chunk operation. Pause, cancel, aborted signals, validation failures, checksum mismatches, resume conflicts, remote offset mismatches, expired resume state, and non-retryable transport errors bypass retry.

## Errors

Session, validation, transport, and resume failures use stable `code` values so applications can show useful recovery UI.

```ts
try {
  await session.start();
} catch (error) {
  if (error && typeof error === "object" && "code" in error) {
    console.log(error.code);
  }
}
```

## Storage And Transport Notes

The browser core does not write directly to SMB, NFS, NAS, WebDAV, SFTP, or a filesystem. Use a server-side gateway for those targets.

The current Node subpath provides the NAS gateway and stored-file verification APIs documented above.

See [docs/server-operational-guide.md](docs/server-operational-guide.md) for server-owned credential, object key, NAS path, cleanup, and final verification responsibilities.

## Architecture Notes

The package is intentionally shipped as one npm package with subpath exports for the 1.0 line. The subpaths preserve architectural boundaries without forcing a workspace split before the API surface proves it needs separate scoped packages.

- `large-image-ingest/core` owns validation, fingerprinting, manifest generation, chunk planning, resumable session orchestration, state events, checksum helpers, resume records, and verification contracts.
- `large-image-ingest/transport-tus` and `large-image-ingest/transport-s3` are adapters over the provider-neutral `UploadTransport` contract. They do not change core session semantics and do not mutate original bytes.
- `large-image-ingest/node` isolates server-only filesystem behavior, NAS gateway helpers, and stored-file verification from browser-safe core imports.
- Transport adapters receive original file slices from the active chunk plan. Derivatives, previews, tiles, and transformed images should remain separate manifest entries instead of replacing or rewriting the original artifact.
- Event snapshots are redacted for default observer flows. Full snapshots and resume records are caller-controlled operational state and should be stored only in an application-approved persistence layer.

Future scoped packages should map directly from the current subpaths if independent release cadence or package size starts to matter.

## Development

```bash
npm ci
npm run typecheck
npm run typecheck:examples
npm test
npm run build
npm pack --dry-run
```

Browser code should use:

- `Blob.slice`
- Web Workers for hashing where possible
- streaming APIs when available
- IndexedDB or local storage for resumable session references

Server code should use:

- streams
- temporary upload directories
- object storage multipart APIs
- checksum verification after upload

## Release Status

The `1.1.0` release candidate includes:

- original-preserving manifest v1 generation
- file validation for size, MIME type, extension, required metadata, caller-provided dimensions, and checksum mismatch
- dependency-free whole-file SHA-256 calculation with bounded `Blob.slice` reads
- receipt-aware upload sessions with retry, checkpoint, pause, cancel, completion, and failure events
- persistent resumable upload records with compatibility checks and Web Storage support
- manifest, receipt, and stored-file verification helpers
- tus transport through `large-image-ingest/transport-tus`
- S3 multipart transport through `large-image-ingest/transport-s3`
- server-side NAS gateway APIs through `large-image-ingest/node`
- safe diagnostics helpers for logs, telemetry, support traces, and recovery UI
- configurable retry policy for transient upload failures
- derivative reference helpers for previews, thumbnails, tile pyramids, metadata enrichments, and custom outputs
- browser-safe preview descriptors that avoid default full-file reads or embedded derivative bytes
- server-side metadata and tile descriptor helpers through `large-image-ingest/node`
- opt-in integration harness entry point through `npm run test:integration`
- ESM, CommonJS, TypeScript declaration, and package export smoke tests

Default verification is credential-free and should pass with:

```bash
npm run prepublishOnly
npm pack --dry-run
```

## Post-1.0 Roadmap

Likely follow-up work after the first npm release is tracked in [docs/roadmap.md](docs/roadmap.md).

Near-term 1.1.0 work focuses on derivative and preview foundations:

- separate derivative manifest entries for previews, thumbnails, tiles, metadata enrichments, and custom outputs
- browser-safe preview descriptors
- server-side metadata and tile descriptor helpers
- adapter boundaries that keep image processing, storage upload, UI, and providers outside core

Later 1.3 candidates are kept as TODOs in the roadmap until they receive dedicated Spec Kit artifacts.
