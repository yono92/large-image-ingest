# Derivatives And Preview Foundations

`large-image-ingest` treats previews, thumbnails, tile pyramids, metadata extractions, compressed outputs, and custom transformed outputs as derivatives. A derivative is related to an original manifest, but it never replaces the original source artifact.

The core package owns derivative references, source identity capture, immutable manifest attachment, and derivative validation. Image decoding, thumbnail rendering, tile generation, derivative upload, UI rendering, and provider-specific storage behavior remain caller-owned or adapter-owned.

## Status Model

- `planned`: The application expects a derivative to exist later, but no generated asset is being claimed yet.
- `created`: The derivative asset or metadata output exists and is represented by metadata and an application-owned storage reference.
- `failed`: Derivative generation or extraction failed, while the original manifest remains valid unless the application makes that derivative required.

## Boundary Summary

- Browser preview helpers record caller-provided preview or thumbnail descriptors.
- Node metadata helpers record server-side or external extraction outputs.
- Tile helpers record tile pyramid metadata and storage references, not tile bytes.
- Storage references are hints or labels, not credential containers.
- Default tests and verification remain credential-free and service-free.

## Core Helpers

```ts
import {
  attachDerivative,
  createDerivativeReference,
  validateManifestDerivatives
} from "large-image-ingest/core";

const metadataPlan = createDerivativeReference({
  manifest,
  id: "metadata-extraction",
  kind: "metadata",
  status: "planned",
  role: "server-side inspection metadata"
});

const nextManifest = attachDerivative(manifest, metadataPlan);
const result = validateManifestDerivatives(nextManifest, {
  requiredDerivativeIds: ["metadata-extraction"]
});
```

`attachDerivative()` returns a new manifest object. It does not mutate the source manifest and does not change `original`, `image`, `chunking`, `upload`, or original validation state.

## Preview And Thumbnail References

```ts
import { createPreviewDerivative } from "large-image-ingest";

const thumbnail = createPreviewDerivative({
  manifest,
  id: "thumbnail-256",
  kind: "thumbnail",
  status: "created",
  mediaType: "image/jpeg",
  width: 256,
  height: 256,
  storage: {
    kind: "object",
    label: "preview-store",
    locationHint: "thumbnails/manifest-id-256.jpg"
  },
  provenance: {
    generator: "app-preview-worker",
    environment: "browser"
  }
});
```

The preview helper records metadata and references only. It does not decode industrial image formats, draw to canvas, create thumbnails, or upload generated assets.

## Metadata And Tile References

```ts
import {
  createMetadataDerivative,
  createTilePyramidDerivative
} from "large-image-ingest/node";

const metadata = createMetadataDerivative({
  manifest,
  id: "server-metadata",
  status: "created",
  format: "tiff",
  width: 4096,
  height: 4096,
  colorDepth: 16,
  provenance: {
    generator: "inspection-metadata-reader",
    environment: "server"
  }
});

const tiles = createTilePyramidDerivative({
  manifest,
  id: "tile-pyramid",
  status: "created",
  mediaType: "image/jpeg",
  tileWidth: 256,
  tileHeight: 256,
  levels: [
    {
      level: 0,
      width: 4096,
      height: 4096,
      columns: 16,
      rows: 16
    }
  ],
  storage: {
    kind: "object",
    locationHint: "tiles/manifest-id/{level}/{row}/{column}.jpg"
  }
});
```

Node helpers describe server-derived metadata and tile outputs. They do not read a file, parse image formats, generate tiles, or write to storage by themselves.

## Sensitive Data Rules

Derivative records should not include:

- original bytes
- derivative bytes
- tile bytes
- base64 image payloads
- credentials
- presigned URLs
- customer metadata beyond caller-approved labels
- stack traces that contain paths, tokens, or customer data

Validation reports derivative problems separately from original file validation. Optional derivative failures do not invalidate the source artifact.
