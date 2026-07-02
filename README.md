# large-image-ingest

`large-image-ingest` is a TypeScript-first core SDK for safely ingesting very large inspection images.

The primary use cases are semiconductor inspection, microscopy, industrial vision, wafer inspection, medical imaging, satellite imaging, and other workflows where the uploaded original is a source-of-truth artifact.

This is not a generic drag-and-drop uploader. The core package focuses on original preservation, validation, checksums, manifest generation, chunk planning, resumable session state, and adapter-based upload orchestration.

## Installation

```bash
npm install large-image-ingest
```

## Core 1.0 Scope

The 1.0 package provides a framework-agnostic core:

- File validation for size, MIME type, extension, required metadata, and caller-provided dimensions.
- Whole-file SHA-256 checksum generation with bounded `Blob.slice` reads.
- Deterministic chunk planning for large files.
- Manifest schema `large-image-ingest.manifest.v1`.
- Upload session state machine with progress, retry, pause, resume, abort, failure, and completion events.
- Serializable session snapshots for app-owned persistence.
- Provider-neutral transport adapter interface.
- ESM, CommonJS, and TypeScript declaration entrypoints.

The 1.0 core does not include built-in S3, tus, NAS, React, thumbnail, preview, tile, or image decoding implementations. Those belong in optional adapters or companion packages.

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

## Basic Upload

```ts
import { createIngestSession } from "large-image-ingest";

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
    async createSession({ manifest }) {
      return { uploadId: `upload-${manifest.id}` };
    },
    async uploadChunk({ chunk, body }) {
      await fetch(`/api/uploads/chunks/${chunk.index}`, {
        method: "PUT",
        body
      });
    },
    async completeSession({ manifest, uploadId }) {
      await fetch(`/api/uploads/${uploadId}/complete`, {
        method: "POST",
        body: JSON.stringify(manifest)
      });
    }
  },
  onEvent(event) {
    console.log(event.type, event);
  }
});

const manifest = await session.start();
```

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

## Session State

Upload sessions expose this state model:

```ts
type IngestSessionState =
  | "idle"
  | "validating"
  | "ready"
  | "uploading"
  | "paused"
  | "completed"
  | "failed"
  | "aborted";
```

Pause takes effect between chunks:

```ts
const snapshot = session.pause();
await persistSnapshot(snapshot);

session.resume();
```

Abort stops the session through `AbortController`:

```ts
session.abort();
```

## Snapshot Resume

The core exposes snapshots but does not persist them. Store snapshots in your application storage, such as IndexedDB or your own backend.

```ts
const resumed = createIngestSession(file, {
  resumeFrom: savedSnapshot,
  transport
});

await resumed.start();
```

Transports can skip chunks that already exist remotely:

```ts
const transport = {
  async createSession() {
    return { uploadId: "upload-1" };
  },
  async shouldUploadChunk({ chunk, uploadId }) {
    return !(await chunkExists(uploadId, chunk.index));
  },
  async uploadChunk({ chunk, body }) {
    await uploadChunk(chunk, body);
  },
  async completeSession({ manifest, uploadId }) {
    await completeUpload(uploadId, manifest);
  }
};
```

## Events

Events are typed objects. Important event names include:

```txt
session:created
validation:started
validation:completed
checksum:started
checksum:progress
checksum:completed
manifest:created
upload:started
upload:progress
chunk:started
chunk:completed
chunk:skipped
chunk:retry
upload:paused
upload:resumed
upload:completed
upload:failed
upload:aborted
```

## Errors

Core-thrown errors use `LargeImageIngestError` with stable `code` values.

```ts
import { LargeImageIngestError } from "large-image-ingest";

try {
  await session.start();
} catch (error) {
  if (error instanceof LargeImageIngestError) {
    console.log(error.code, error.details);
  }
}
```

## Storage And Transport Notes

The core does not write directly to S3, tus, SMB, NFS, NAS, WebDAV, SFTP, or a filesystem. It only calls your adapter.

NAS compatibility should be implemented through a server-side adapter or gateway. Browsers cannot safely or generally write directly to SMB or NFS shares.

## Future Packages

Possible companion packages:

```txt
@large-image-ingest/transport-tus
@large-image-ingest/transport-s3
@large-image-ingest/transport-nas
@large-image-ingest/preview-browser
@large-image-ingest/node
@large-image-ingest/react
```

These should build on the stable 1.0 core transport and manifest contracts.

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run
```
