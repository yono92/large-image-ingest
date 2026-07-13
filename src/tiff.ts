import GeoTIFF, { type GeoTIFFImage } from "geotiff";
import type { ImageMetadataInput } from "./types.js";

const DEFAULT_MAX_DIRECTORIES = 256;
const CLASSIC_TIFF_MAGIC = 42;
const BIG_TIFF_MAGIC = 43;

export type TiffContainer = "tiff" | "bigtiff";
export type TiffByteOrder = "little-endian" | "big-endian";
export type TiffLayout = "tiled" | "stripped";
export type TiffProbeErrorCode =
  | "tiff.invalid_header"
  | "tiff.malformed"
  | "tiff.directory_limit"
  | "tiff.unsafe_offset"
  | "tiff.unsupported"
  | "tiff.aborted"
  | "tiff.directory_not_found";

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

  constructor(code: TiffProbeErrorCode, message: string, directoryIndex?: number) {
    super(message);
    this.name = "TiffProbeError";
    this.code = code;
    if (directoryIndex !== undefined) {
      this.directoryIndex = directoryIndex;
    }
  }
}

interface TiffHeader {
  container: TiffContainer;
  byteOrder: TiffByteOrder;
  littleEndian: boolean;
  firstDirectoryOffset: bigint;
  countBytes: number;
  entryBytes: number;
  offsetBytes: number;
}

export async function probeTiffMetadata(
  source: Blob,
  options: TiffProbeOptions = {}
): Promise<TiffProbeResult> {
  const maxDirectories = normalizeMaxDirectories(options.maxDirectories);
  throwIfAborted(options.signal);
  const header = await readHeader(source, options.signal);
  const directoryCount = await countDirectories(source, header, maxDirectories, options.signal);
  let parsed: GeoTIFF | undefined;

  try {
    parsed = await GeoTIFF.fromSource(new BlobRangeSource(source), {}, options.signal);
    const directories: TiffDirectoryMetadata[] = [];
    for (let index = 0; index < directoryCount; index += 1) {
      throwIfAborted(options.signal);
      const image = await parsed.getImage(index);
      directories.push(await normalizeDirectory(image, index));
    }

    return {
      container: header.container,
      byteOrder: header.byteOrder,
      directoryCount,
      directories
    };
  } catch (error) {
    if (error instanceof TiffProbeError) {
      throw error;
    }
    if (options.signal?.aborted || isAbortError(error)) {
      throw new TiffProbeError("tiff.aborted", "TIFF metadata probing was aborted.");
    }
    throw new TiffProbeError(
      header.container === "bigtiff" ? "tiff.unsupported" : "tiff.malformed",
      header.container === "bigtiff"
        ? "BigTIFF metadata is not supported by the active parser for this file."
        : "TIFF directory metadata is malformed or unsupported."
    );
  } finally {
    await parsed?.close();
  }
}

export function toTiffImageMetadata(
  result: TiffProbeResult,
  directoryIndex = 0
): ImageMetadataInput {
  if (!Number.isSafeInteger(directoryIndex) || directoryIndex < 0) {
    throw new TiffProbeError("tiff.directory_not_found", "TIFF directory index is invalid.");
  }
  const directory = result.directories[directoryIndex];
  if (!directory || directory.index !== directoryIndex) {
    throw new TiffProbeError(
      "tiff.directory_not_found",
      "TIFF directory does not exist.",
      directoryIndex
    );
  }
  const colorDepth = Math.max(...directory.bitsPerSample);
  return {
    format: "tiff",
    width: directory.width,
    height: directory.height,
    colorDepth
  };
}

async function readHeader(source: Blob, signal?: AbortSignal): Promise<TiffHeader> {
  if (source.size < 8) {
    throw new TiffProbeError("tiff.invalid_header", "TIFF header is truncated.");
  }
  const bytes = await readSlice(source, 0, Math.min(source.size, 16), signal);
  const view = new DataView(bytes);
  const marker = view.getUint16(0, false);
  const littleEndian = marker === 0x4949;
  if (!littleEndian && marker !== 0x4d4d) {
    throw new TiffProbeError("tiff.invalid_header", "TIFF byte order marker is invalid.");
  }
  const byteOrder: TiffByteOrder = littleEndian ? "little-endian" : "big-endian";
  const magic = view.getUint16(2, littleEndian);

  if (magic === CLASSIC_TIFF_MAGIC) {
    return {
      container: "tiff",
      byteOrder,
      littleEndian,
      firstDirectoryOffset: BigInt(view.getUint32(4, littleEndian)),
      countBytes: 2,
      entryBytes: 12,
      offsetBytes: 4
    };
  }

  if (magic !== BIG_TIFF_MAGIC || source.size < 16) {
    throw new TiffProbeError("tiff.invalid_header", "TIFF magic number is invalid.");
  }
  if (view.getUint16(4, littleEndian) !== 8 || view.getUint16(6, littleEndian) !== 0) {
    throw new TiffProbeError("tiff.unsupported", "BigTIFF offset format is unsupported.");
  }
  return {
    container: "bigtiff",
    byteOrder,
    littleEndian,
    firstDirectoryOffset: view.getBigUint64(8, littleEndian),
    countBytes: 8,
    entryBytes: 20,
    offsetBytes: 8
  };
}

async function countDirectories(
  source: Blob,
  header: TiffHeader,
  maxDirectories: number,
  signal?: AbortSignal
): Promise<number> {
  let offset = header.firstDirectoryOffset;
  if (offset === 0n) {
    throw new TiffProbeError("tiff.malformed", "TIFF does not contain an image directory.");
  }

  for (let index = 0; index < maxDirectories; index += 1) {
    throwIfAborted(signal);
    const directoryOffset = toSafeOffset(offset, source.size, index);
    const countBuffer = await readSlice(
      source,
      directoryOffset,
      directoryOffset + header.countBytes,
      signal,
      index
    );
    const countView = new DataView(countBuffer);
    const entryCount = header.container === "bigtiff"
      ? countView.getBigUint64(0, header.littleEndian)
      : BigInt(countView.getUint16(0, header.littleEndian));
    const nextOffsetPosition = offset + BigInt(header.countBytes) + entryCount * BigInt(header.entryBytes);
    const safeNextOffsetPosition = toSafeOffset(nextOffsetPosition, source.size, index);
    const nextOffsetBuffer = await readSlice(
      source,
      safeNextOffsetPosition,
      safeNextOffsetPosition + header.offsetBytes,
      signal,
      index
    );
    const nextOffsetView = new DataView(nextOffsetBuffer);
    offset = header.container === "bigtiff"
      ? nextOffsetView.getBigUint64(0, header.littleEndian)
      : BigInt(nextOffsetView.getUint32(0, header.littleEndian));

    if (offset === 0n) {
      return index + 1;
    }
  }

  throw new TiffProbeError(
    "tiff.directory_limit",
    "TIFF directory count exceeds the configured limit.",
    maxDirectories
  );
}

async function normalizeDirectory(
  image: GeoTIFFImage,
  index: number
): Promise<TiffDirectoryMetadata> {
  const width = requirePositiveInteger(image.getWidth(), "width", index);
  const height = requirePositiveInteger(image.getHeight(), "height", index);
  const samplesPerPixel = requirePositiveInteger(image.getSamplesPerPixel(), "samples per pixel", index);
  const bitsPerSample = Array.from({ length: samplesPerPixel }, (_, sampleIndex) => (
    requirePositiveInteger(image.getBitsPerSample(sampleIndex), "bits per sample", index)
  ));
  const sampleFormat = Array.from({ length: samplesPerPixel }, (_, sampleIndex) => (
    requirePositiveInteger(image.getSampleFormat(sampleIndex), "sample format", index)
  ));
  const directory = image.getFileDirectory();
  const metadata: TiffDirectoryMetadata = {
    index,
    width,
    height,
    bitsPerSample,
    samplesPerPixel,
    layout: image.isTiled ? "tiled" : "stripped",
    sampleFormat
  };

  assignOptionalNumber(metadata, "compression", await directory.loadValue("Compression"), index);
  assignOptionalNumber(metadata, "photometricInterpretation", await directory.loadValue("PhotometricInterpretation"), index);
  assignOptionalNumber(metadata, "orientation", await directory.loadValue("Orientation"), index);
  assignOptionalNumber(metadata, "planarConfiguration", await directory.loadValue("PlanarConfiguration"), index);

  if (image.isTiled) {
    metadata.tileWidth = requirePositiveInteger(image.getTileWidth(), "tile width", index);
    metadata.tileHeight = requirePositiveInteger(image.getTileHeight(), "tile height", index);
  } else {
    assignOptionalNumber(metadata, "rowsPerStrip", await directory.loadValue("RowsPerStrip"), index);
  }

  return metadata;
}

function assignOptionalNumber<K extends keyof TiffDirectoryMetadata>(
  target: TiffDirectoryMetadata,
  key: K,
  value: unknown,
  directoryIndex: number
): void {
  if (value === undefined) {
    return;
  }
  const normalized = Array.isArray(value) || ArrayBuffer.isView(value)
    ? Number((value as { readonly [index: number]: unknown })[0])
    : Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new TiffProbeError("tiff.malformed", `TIFF directory ${String(key)} is invalid.`, directoryIndex);
  }
  Object.assign(target, { [key]: normalized });
}

function normalizeMaxDirectories(value: number | undefined): number {
  const normalized = value ?? DEFAULT_MAX_DIRECTORIES;
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new RangeError("maxDirectories must be a positive safe integer.");
  }
  return normalized;
}

function requirePositiveInteger(value: number, label: string, directoryIndex: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TiffProbeError("tiff.malformed", `TIFF directory ${label} is invalid.`, directoryIndex);
  }
  return value;
}

function toSafeOffset(offset: bigint, size: number, directoryIndex: number): number {
  if (offset < 0n || offset > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TiffProbeError("tiff.unsafe_offset", "TIFF directory offset is not safely representable.", directoryIndex);
  }
  const value = Number(offset);
  if (value >= size) {
    throw new TiffProbeError("tiff.malformed", "TIFF directory offset is outside the source file.", directoryIndex);
  }
  return value;
}

async function readSlice(
  source: Blob,
  start: number,
  end: number,
  signal?: AbortSignal,
  directoryIndex?: number
): Promise<ArrayBuffer> {
  throwIfAborted(signal);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > source.size) {
    throw new TiffProbeError("tiff.malformed", "TIFF metadata is truncated.", directoryIndex);
  }
  const buffer = await source.slice(start, end).arrayBuffer();
  throwIfAborted(signal);
  return buffer;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new TiffProbeError("tiff.aborted", "TIFF metadata probing was aborted.");
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

interface ParserSlice {
  offset: number;
  length: number;
}

interface ParserSliceWithData extends ParserSlice {
  data: ArrayBuffer;
}

class BlobRangeSource {
  constructor(private readonly source: Blob) {}

  get fileSize(): number {
    return this.source.size;
  }

  async fetch(slices: ParserSlice[], signal?: AbortSignal): Promise<ArrayBuffer[]> {
    return Promise.all(slices.map(async (slice) => (await this.fetchSlice(slice, signal)).data));
  }

  async fetchSlice(slice: ParserSlice, signal?: AbortSignal): Promise<ParserSliceWithData> {
    throwIfAborted(signal);
    if (!Number.isSafeInteger(slice.offset) || !Number.isSafeInteger(slice.length) || slice.offset < 0 || slice.length <= 0) {
      throw new TiffProbeError("tiff.malformed", "TIFF parser requested an invalid source range.");
    }
    const data = await this.source.slice(slice.offset, slice.offset + slice.length).arrayBuffer();
    throwIfAborted(signal);
    return { ...slice, data };
  }

  async close(): Promise<void> {}
}
