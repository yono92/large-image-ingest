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

## Example API

```ts
import { createIngestSession } from "large-image-ingest";

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
    async createSession({ manifest }) {
      return { uploadId: `upload-${manifest.id}` };
    },
    async uploadChunk({ chunk, body }) {
      await fetch(`/api/uploads/chunks/${chunk.index}`, {
        method: "PUT",
        body,
      });
    },
    async completeSession({ manifest, uploadId }) {
      await fetch(`/api/uploads/${uploadId}/complete`, {
        method: "POST",
        body: JSON.stringify(manifest),
      });
    },
  },
  onEvent(event) {
    console.log(event.type, event);
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

Candidate dependencies:

- `tus-js-client`
- `@tus/server`

Best for:

- Pause/resume
- Browser refresh recovery
- Network instability
- Self-hosted upload server

### S3 Multipart

Use S3 multipart upload for direct-to-object-storage workflows.

Candidate dependencies:

- `@aws-sdk/lib-storage`
- S3 presigned multipart API

Best for:

- Cloud-native storage
- Very large files
- Avoiding app server bandwidth usage

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

The Node package can provide:

- Manifest verification
- Checksum verification
- Sharp-based thumbnail generation
- Sharp-based preview generation
- Hooks for tile generation

Example:

```ts
import { verifyManifest, createDerivatives } from "large-image-ingest/node";

await verifyManifest(manifest, {
  requireChecksum: true,
});

await createDerivatives({
  input: "/data/originals/wafer-aoi-001.tif",
  outputDir: "/data/derivatives/ing_01J...",
  preview: {
    maxWidth: 2048,
    format: "webp",
  },
});
```

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

- Add `tus-js-client` transport.
- Support start, pause, resume, cancel.
- Persist resume URLs.
- Emit upload progress and retry events.

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

- Should the first package be single-package or monorepo?
- Should tus or S3 be the first official transport?
- Should image dimensions be best-effort only in the browser?
- Which formats matter first: TIFF, PNG, JPEG, BMP, proprietary raw formats?
- Should manifest be uploaded before, after, or alongside the original?
- Should per-chunk checksums be required in v1?
- How much resume state should be persisted client-side?

## Recommended First Build

Start with a single package and one transport.

Recommended first stack:

- TypeScript
- `tus-js-client`
- `@tus/server`
- `sharp` for Node derivative examples
- Vitest for tests
- tsup or tsdown for build

First public demo:

1. Select a large image.
2. Validate file size and type.
3. Generate manifest.
4. Upload with tus.
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
