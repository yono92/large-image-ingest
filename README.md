# large-image-ingest

## Project Brief

`large-image-ingest` is a TypeScript-first SDK for safely ingesting very large inspection images.

The target use cases are semiconductor inspection, microscopy, industrial vision, wafer inspection, medical imaging, satellite imaging, and other workflows where the uploaded image is not just user content, but a source-of-truth artifact.

This project is not a generic drag-and-drop uploader. It focuses on original preservation, resumable upload, manifest generation, checksum verification, and preview derivative handling for large image files.

## Problem

Large inspection images are often difficult to upload reliably from web applications.

Common upload libraries solve file selection and progress UI, but they usually do not provide domain-aware safety features for inspection data:

- Original files must not be resized, recompressed, or mutated.
- Files may be hundreds of MB or multiple GB.
- Browser memory can crash if the full image is decoded at once.
- Uploads must survive network failure, refreshes, and retries.
- The system needs a verifiable manifest for traceability.
- Metadata such as lot ID, wafer ID, tool name, inspection type, and defect region matters.
- Preview images and tiles should be generated separately from the original file.

## Product Positioning

`large-image-ingest` provides the ingestion layer for large inspection images.

It should sit between UI components, storage backends, and image processing pipelines.

```txt
File input / dropzone
        |
        v
large-image-ingest
        |
        +-- validation
        +-- fingerprinting
        +-- manifest generation
        +-- resumable upload
        +-- progress events
        +-- preview derivative hooks
        |
        v
Storage / processing pipeline
```

## Design Principles

1. Preserve the original file by default.
2. Treat resize, compression, and EXIF stripping as derivative-only operations.
3. Use chunked and resumable uploads for large files.
4. Generate a manifest before or during upload.
5. Make upload state observable and recoverable.
6. Keep the core framework-agnostic.
7. Provide React integration as a thin wrapper.
8. Use adapters for upload transports and storage targets.

## Initial Target Users

- Frontend engineers building inspection dashboards.
- Platform engineers building image ingestion pipelines.
- Teams handling semiconductor, microscopy, AOI, defect review, or high-resolution industrial images.
- Internal tool builders who need reliable browser-to-storage upload for large files.

## MVP Scope

The MVP should avoid becoming a full image viewer, labeling tool, or data platform.

The first version should focus on a reliable ingestion path:

- Validate a file before upload.
- Generate file and image metadata.
- Generate a versioned manifest.
- Upload via resumable transport.
- Emit progress, retry, pause, resume, and complete events.
- Preserve the original file.
- Optionally generate lightweight preview metadata.

## Non-Goals

The first version will not include:

- Full image annotation UI.
- Wafer map visualization.
- Defect classification.
- Built-in cloud account management.
- Full DICOM, OME-TIFF, or proprietary semiconductor format parsing.
- Deep image tiling viewer.
- OCR.
- Automatic lossy optimization of original images.

These can be added later as integrations or companion packages.

## Core Concepts

### Original

The original uploaded file. This is immutable and should be stored exactly as provided.

### Derivative

Any generated output, such as:

- Thumbnail
- Preview image
- Tile pyramid
- Normalized JPEG/WebP preview
- Metadata JSON

Derivatives can be compressed, resized, cached, or regenerated. The original cannot.

### Manifest

A JSON document describing the file, image, upload session, metadata, and generated derivatives.

The manifest is the traceability layer.

### Transport

The mechanism used to upload bytes.

Initial transports:

- tus resumable upload
- S3 multipart upload
- Future NAS-backed server adapter or gateway

### Ingest Session

A single upload lifecycle for one file and its metadata.

## Proposed Package Structure

```txt
packages/
  core/
    src/
      create-ingestor.ts
      manifest.ts
      validation.ts
      fingerprint.ts
      upload-session.ts
      events.ts
      types.ts

  transport-tus/
    src/
      tus-transport.ts

  transport-s3/
    src/
      s3-transport.ts

  preview-browser/
    src/
      preview.ts
      dimensions.ts

  node/
    src/
      verify-manifest.ts
      sharp-derivatives.ts

  react/
    src/
      use-ingest.ts
      IngestDropzone.tsx
```

Possible npm package names:

```txt
large-image-ingest
@large-image-ingest/core
@large-image-ingest/tus
@large-image-ingest/s3
@large-image-ingest/react
@large-image-ingest/node
```

For the first implementation, a single package is acceptable. Split packages only when the API stabilizes.

## Current Package Map

The MVP stays in a single npm package and uses subpath exports to keep API boundaries clear. This avoids premature workspace churn while leaving a clean migration path to scoped packages later.

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
- Use `large-image-ingest/node` for server-only NAS gateway APIs.
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
    chunkSize: 64 * 1024 * 1024,
  },
  validation: {
    maxBytes: 10 * 1024 * 1024 * 1024,
    acceptedMimeTypes: ["image/tiff", "image/png", "image/jpeg"],
    acceptedExtensions: ["tif", "tiff", "png", "jpg", "jpeg"],
  },
  metadata: {
    lotId: "LOT-2026-001",
    waferId: "W12",
    tool: "VFVI",
    inspectionType: "defect-review",
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
        body,
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
    },
  },
  onEvent(event) {
    console.log(event.type, event);
  },
  onSnapshot(snapshot) {
    // Persist this in IndexedDB or an application session store for resume.
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

## JavaScript Usage

The npm package ships runnable JavaScript and TypeScript declarations. ESM consumers can import the package directly:

```js
import { createIngestSession } from "large-image-ingest";
```

CommonJS consumers can use `require`:

```js
const { createIngestSession } = require("large-image-ingest");
```

## Manifest Example

```json
{
  "schemaVersion": "large-image-ingest.manifest.v0.1",
  "id": "ing_01J00000000000000000000000",
  "createdAt": "2026-06-30T00:00:00.000Z",
  "library": {
    "name": "large-image-ingest",
    "version": "0.0.0"
  },
  "original": {
    "kind": "original",
    "name": "wafer-aoi-001.tif",
    "extension": "tif",
    "sizeBytes": 1843221900,
    "mediaType": "image/tiff",
    "lastModifiedAt": "2026-06-30T00:00:00.000Z",
    "fingerprint": {
      "algorithm": "metadata-sha256",
      "scope": "file-metadata",
      "value": "..."
    },
    "preservation": {
      "required": true,
      "allowedMutations": []
    }
  },
  "image": {
    "status": "not_inspected",
    "width": null,
    "height": null,
    "colorDepth": null
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
  "storage": {
    "kind": "nas",
    "label": "fab-qc-nas",
    "locationHint": "/inspection/inbox"
  },
  "metadata": {
    "lotId": "LOT-2026-001",
    "waferId": "W12",
    "tool": "VFVI",
    "inspectionType": "defect-review"
  },
  "derivatives": [],
  "validation": {
    "ok": true,
    "issues": []
  }
}
```

## Transport Strategy

### tus

Use tus for resumable browser uploads.

Current implementation:

- `createTusTransport` implements the tus 1.0 creation/core flow with native `fetch`.
- Upload URLs are stored as transport resume tokens and redacted from default snapshot events.
- The transport verifies remote offset with `HEAD` before each sequential `PATCH`.
- `terminateOnAbort` can send tus `DELETE` when the server supports the termination extension.

```ts
import { createIngestSession } from "large-image-ingest/core";
import { createTusTransport } from "large-image-ingest/transport-tus";

const session = createIngestSession(file, {
  transport: createTusTransport({
    endpoint: "/files",
    detectExtensions: true,
    metadata: {
      filename: file.name,
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

Validation should return structured errors:

```ts
type IngestError = {
  code: string;
  message: string;
  path?: string;
  severity: "error" | "warning";
};
```

## Event Model

The upload session should emit typed events:

```ts
type IngestEvent =
  | "session:created"
  | "validation:started"
  | "validation:completed"
  | "hash:started"
  | "hash:progress"
  | "hash:completed"
  | "upload:started"
  | "upload:progress"
  | "chunk:started"
  | "chunk:completed"
  | "chunk:retry"
  | "upload:paused"
  | "upload:resumed"
  | "upload:completed"
  | "upload:failed"
  | "manifest:created";
```

## React Integration

React should be optional.

Example:

```ts
const {
  sessions,
  addFiles,
  pause,
  resume,
  cancel,
} = useLargeImageIngest({
  ingestor,
});
```

The React package should not own the core upload logic. It should only map state and events into React.

## Server Integration

The current Node subpath provides the NAS gateway APIs documented above.

Future Node helpers can provide:

- Manifest verification
- Checksum verification
- Sharp-based thumbnail generation
- Sharp-based preview generation
- Hooks for tile generation

## Architecture Notes

The core should avoid loading entire files into memory.

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

## MVP Milestones

### Milestone 1: Core Session Model

- Define types.
- Implement `createIngestor`.
- Implement `createSession`.
- Implement typed events.
- Implement validation.
- Generate basic manifest.

### Milestone 2: Hashing and Fingerprint

- Implement chunked SHA-256 hashing.
- Add progress events.
- Add duplicate fingerprint helper.
- Avoid reading full files into memory.

### Milestone 3: tus Upload

- Add raw `fetch` tus transport.
- Support start, pause, resume, cancel, and optional termination.
- Persist resume URLs through redacted session snapshots.
- Emit upload progress, retry, and snapshot events.

### Milestone 4: Node Verification

- Add manifest verifier.
- Add checksum verification helper.
- Add minimal `@tus/server` example.

### Milestone 5: Preview Derivatives

- Add browser-safe preview generation.
- Add Node `sharp` preview generation.
- Keep original file untouched.

### Milestone 6: React Adapter

- Add `useLargeImageIngest`.
- Add minimal dropzone example.
- Keep UI unopinionated.

## Open Questions

- Should image dimensions be best-effort only in the browser?
- Which formats matter first: TIFF, PNG, JPEG, BMP, proprietary raw formats?
- Should manifest be uploaded before, after, or alongside the original?
- Should per-chunk checksums be required in v1?
- How much resume state should be persisted client-side?
- When the API stabilizes, should subpath exports migrate to scoped packages?

## Recommended First Build

Start with a single package and browser-safe transports.

Recommended first stack:

- TypeScript
- raw `fetch` tus transport
- broker-backed S3 multipart transport
- optional `@tus/server`
- `sharp` for Node derivative examples
- Vitest for tests
- tsup or tsdown for build

First public demo:

1. Select a large image.
2. Validate file size and type.
3. Generate manifest.
4. Upload with tus or S3 multipart.
5. Pause and resume.
6. Show checksum and final manifest.

## Success Criteria

The MVP is successful if a developer can install the package and reliably upload a multi-GB inspection image with:

- original preservation
- progress events
- resumable upload
- retry behavior
- manifest output
- checksum verification

without building all of that infrastructure from scratch.
