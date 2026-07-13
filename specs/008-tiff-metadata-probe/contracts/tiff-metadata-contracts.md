# Public Contracts: TIFF And BigTIFF Metadata Probe

```ts
export type TiffContainer = "tiff" | "bigtiff";
export type TiffByteOrder = "little-endian" | "big-endian";
export type TiffLayout = "tiled" | "stripped";

export interface TiffDirectoryMetadata {
  index: number;
  width: number;
  height: number;
  bitsPerSample: readonly number[];
  samplesPerPixel: number;
  layout: TiffLayout;
  compression?: number;
  photometricInterpretation?: number;
  orientation?: number;
  planarConfiguration?: number;
  sampleFormat?: readonly number[];
  tileWidth?: number;
  tileHeight?: number;
  rowsPerStrip?: number;
}

export interface TiffProbeResult {
  container: TiffContainer;
  byteOrder: TiffByteOrder;
  directoryCount: number;
  directories: readonly TiffDirectoryMetadata[];
}

export interface TiffProbeOptions {
  maxDirectories?: number;
  signal?: AbortSignal;
}

export class TiffProbeError extends Error {
  readonly code: TiffProbeErrorCode;
  readonly directoryIndex?: number;
}

export function probeTiffMetadata(
  source: Blob,
  options?: TiffProbeOptions
): Promise<TiffProbeResult>;

export function toTiffImageMetadata(
  result: TiffProbeResult,
  directoryIndex?: number
): ImageMetadataInput;
```

The subpath does not export raster reading, rendering, resize, thumbnail, or tile generation functions.
