# large-image-ingest

TypeScript-first SDK for safely ingesting very large inspection images.

The package is built for semiconductor inspection, microscopy, industrial vision, wafer inspection, medical imaging, satellite imaging, and other workflows where the uploaded original is a source-of-truth artifact that must remain verifiable.

It is not a generic drag-and-drop uploader. The core focuses on original preservation, validation, checksums, manifest generation, chunk planning, resumable session state, safe diagnostics, derivative references, and adapter-based upload orchestration.

## Install

```bash
npm install large-image-ingest
```

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
```

More examples are in [docs/quickstart.md](docs/quickstart.md).

## What It Provides

- Original-preserving manifest schema `large-image-ingest.manifest.v1`
- File validation for size, MIME type, extension, metadata, dimensions, and checksum mismatch
- Whole-file SHA-256 checksums using bounded `Blob.slice` reads
- Deterministic chunk planning for large files
- Upload sessions with progress, retry, pause, cancel, failure, completion, and resume events
- Versioned persistent resume records with durable chunk receipts and redacted session snapshots
- Safe diagnostics helpers for logs, telemetry, support traces, and recovery UI
- Derivative references for previews, thumbnails, tiles, metadata enrichments, and custom outputs
- Browser-safe tus and S3 multipart transport helpers
- Server-side NAS gateway and stored-file verification helpers under the Node subpath
- ESM, CommonJS, and TypeScript declaration entrypoints

The package does not include React, image decoding, thumbnail rendering, tile generation, cloud SDKs, or UI implementations. Those remain caller-owned adapters or companion packages.

## Package Map

```txt
large-image-ingest
large-image-ingest/core
large-image-ingest/transport-tus
large-image-ingest/transport-s3
large-image-ingest/node
```

- Use `large-image-ingest/core` for framework-agnostic browser-safe core APIs.
- Use `large-image-ingest/transport-tus` for the raw `fetch` tus transport.
- Use `large-image-ingest/transport-s3` for broker-backed S3 multipart uploads.
- Use `large-image-ingest/node` for server-only NAS gateway, metadata derivative, tile descriptor, and stored-file verification APIs.
- Use `large-image-ingest` as a compatibility root for core plus browser-safe transports.

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

Persistent resume records created by 1.2.0 use schema `large-image-ingest.resume.v0.2` and retain acknowledged chunk receipts. This allows S3 multipart uploads to resume after a page or process restart without relying on an in-memory snapshot. Legacy v0.1 records remain readable when the transport can recover safely; progressed S3 v0.1 records are rejected because their ETags cannot be reconstructed safely.

Full resume records can contain upload identifiers, tus upload URLs, customer metadata, object keys, and provider receipt evidence. Store them according to application security policy and use the diagnostic redaction helpers for logs and support output.

Server-owned credential, object key, NAS path, cleanup, and final verification responsibilities are documented in [docs/server-operational-guide.md](docs/server-operational-guide.md).

## Documentation

- [Quickstart and API examples](docs/quickstart.md)
- [Derivative and preview foundations](docs/derivatives.md)
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
npm pack --dry-run
```

Default verification is local and credential-free. Real tus servers, S3-compatible buckets, and mounted NAS paths are covered only by explicit opt-in integration checks.

## Design Principles

1. Preserve the original file by default.
2. Treat resize, compression, EXIF stripping, previews, thumbnails, and tiles as derivatives.
3. Use chunked upload flows for large files.
4. Generate a manifest before upload starts.
5. Make upload state observable and recoverable.
6. Keep the core framework-agnostic.
7. Use adapters for upload transports and storage targets.
8. Keep runtime dependencies small.
