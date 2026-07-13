export interface TiffFixtureDirectory {
  width?: number;
  height?: number;
  bitsPerSample?: number;
  compression?: number;
  photometricInterpretation?: number;
  orientation?: number;
  samplesPerPixel?: number;
  planarConfiguration?: number;
  sampleFormat?: number;
  tiled?: boolean;
  tileWidth?: number;
  tileHeight?: number;
  rowsPerStrip?: number;
}

export function createTiffFixture(options: {
  bigTiff?: boolean;
  littleEndian?: boolean;
  directories?: readonly TiffFixtureDirectory[];
} = {}): Blob {
  const bigTiff = options.bigTiff ?? false;
  const littleEndian = options.littleEndian ?? true;
  const directories = options.directories ?? [{}];
  const headerSize = bigTiff ? 16 : 8;
  const countSize = bigTiff ? 8 : 2;
  const entrySize = bigTiff ? 20 : 12;
  const nextSize = bigTiff ? 8 : 4;
  const entries = directories.map(createEntries);
  const offsets: number[] = [];
  let totalSize = headerSize;
  for (const directoryEntries of entries) {
    offsets.push(totalSize);
    totalSize += countSize + directoryEntries.length * entrySize + nextSize;
  }
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  view.setUint8(0, littleEndian ? 0x49 : 0x4d);
  view.setUint8(1, littleEndian ? 0x49 : 0x4d);
  view.setUint16(2, bigTiff ? 43 : 42, littleEndian);
  if (bigTiff) {
    view.setUint16(4, 8, littleEndian);
    view.setUint16(6, 0, littleEndian);
    view.setBigUint64(8, BigInt(offsets[0] ?? 0), littleEndian);
  } else {
    view.setUint32(4, offsets[0] ?? 0, littleEndian);
  }

  entries.forEach((directoryEntries, directoryIndex) => {
    const offset = offsets[directoryIndex] ?? 0;
    if (bigTiff) {
      view.setBigUint64(offset, BigInt(directoryEntries.length), littleEndian);
    } else {
      view.setUint16(offset, directoryEntries.length, littleEndian);
    }
    directoryEntries.forEach((entry, entryIndex) => {
      writeEntry(view, offset + countSize + entryIndex * entrySize, entry, bigTiff, littleEndian);
    });
    const nextPosition = offset + countSize + directoryEntries.length * entrySize;
    const nextOffset = offsets[directoryIndex + 1] ?? 0;
    if (bigTiff) {
      view.setBigUint64(nextPosition, BigInt(nextOffset), littleEndian);
    } else {
      view.setUint32(nextPosition, nextOffset, littleEndian);
    }
  });

  return new Blob([buffer], { type: "image/tiff" });
}

export function createUnsafeBigTiffOffsetFixture(): Blob {
  const buffer = new ArrayBuffer(16);
  const view = new DataView(buffer);
  view.setUint8(0, 0x49);
  view.setUint8(1, 0x49);
  view.setUint16(2, 43, true);
  view.setUint16(4, 8, true);
  view.setBigUint64(8, BigInt(Number.MAX_SAFE_INTEGER) + 1n, true);
  return new Blob([buffer], { type: "image/tiff" });
}

interface TiffEntry {
  tag: number;
  type: 3 | 4;
  value: number;
}

function createEntries(directory: TiffFixtureDirectory): TiffEntry[] {
  const tiled = directory.tiled ?? false;
  const entries: TiffEntry[] = [
    { tag: 256, type: 4, value: directory.width ?? 64 },
    { tag: 257, type: 4, value: directory.height ?? 32 },
    { tag: 258, type: 3, value: directory.bitsPerSample ?? 16 },
    { tag: 259, type: 3, value: directory.compression ?? 1 },
    { tag: 262, type: 3, value: directory.photometricInterpretation ?? 1 },
    { tag: 274, type: 3, value: directory.orientation ?? 1 },
    { tag: 277, type: 3, value: directory.samplesPerPixel ?? 1 },
    { tag: 284, type: 3, value: directory.planarConfiguration ?? 1 },
    { tag: 339, type: 3, value: directory.sampleFormat ?? 1 }
  ];
  if (tiled) {
    entries.push(
      { tag: 322, type: 4, value: directory.tileWidth ?? 16 },
      { tag: 323, type: 4, value: directory.tileHeight ?? 16 },
      { tag: 324, type: 4, value: 0 },
      { tag: 325, type: 4, value: 0 }
    );
  } else {
    entries.push(
      { tag: 273, type: 4, value: 0 },
      { tag: 278, type: 4, value: directory.rowsPerStrip ?? directory.height ?? 32 },
      { tag: 279, type: 4, value: 0 }
    );
  }
  return entries.sort((left, right) => left.tag - right.tag);
}

function writeEntry(
  view: DataView,
  offset: number,
  entry: TiffEntry,
  bigTiff: boolean,
  littleEndian: boolean
): void {
  view.setUint16(offset, entry.tag, littleEndian);
  view.setUint16(offset + 2, entry.type, littleEndian);
  if (bigTiff) {
    view.setBigUint64(offset + 4, 1n, littleEndian);
    if (entry.type === 3) {
      view.setUint16(offset + 12, entry.value, littleEndian);
    } else {
      view.setUint32(offset + 12, entry.value, littleEndian);
    }
  } else {
    view.setUint32(offset + 4, 1, littleEndian);
    if (entry.type === 3) {
      view.setUint16(offset + 8, entry.value, littleEndian);
    } else {
      view.setUint32(offset + 8, entry.value, littleEndian);
    }
  }
}
