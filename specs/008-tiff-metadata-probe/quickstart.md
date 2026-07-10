# Quickstart Validation: TIFF And BigTIFF Metadata Probe

## Install

```bash
npm install large-image-ingest geotiff
```

## Probe Metadata

Import from `large-image-ingest/tiff`, pass a browser `File` or `Blob`, and inspect the returned directory metadata before creating an ingest session.

Expected outcomes:

- binary header determines TIFF versus BigTIFF and byte order
- directory traversal is bounded
- dimensions, samples, bit depth, compression, orientation, and layout are normalized when present
- no raster decoder is called
- the original Blob remains unchanged

## Connect To Existing Validation

Select a directory and convert it to `ImageMetadataInput`, then pass the result as the existing ingest session `image` option. Page and sample details remain in the probe result because manifest v1 does not model them.

## Verification

```bash
npm run typecheck
npm run typecheck:examples
npm test
npm run build
npm pack --dry-run
```
