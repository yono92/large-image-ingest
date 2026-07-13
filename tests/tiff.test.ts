import { describe, expect, it } from "vitest";
import { createManifest } from "../src/manifest";
import {
  TiffProbeError,
  probeTiffMetadata,
  toTiffImageMetadata
} from "../src/tiff";
import {
  createTiffFixture,
  createUnsafeBigTiffOffsetFixture
} from "./tiff-fixtures";

describe("TIFF metadata probe", () => {
  it("probes little- and big-endian classic TIFF metadata without raster payloads", async () => {
    const little = await probeTiffMetadata(createTiffFixture({ littleEndian: true }));
    const big = await probeTiffMetadata(createTiffFixture({ littleEndian: false }));

    expect(little).toMatchObject({
      container: "tiff",
      byteOrder: "little-endian",
      directoryCount: 1,
      directories: [{
        index: 0,
        width: 64,
        height: 32,
        bitsPerSample: [16],
        samplesPerPixel: 1,
        layout: "stripped",
        compression: 1,
        orientation: 1,
        rowsPerStrip: 32
      }]
    });
    expect(big.byteOrder).toBe("big-endian");
    expect(big.directories[0]).toMatchObject({ width: 64, height: 32 });
  });

  it("probes supported BigTIFF metadata and tiled layout", async () => {
    const result = await probeTiffMetadata(createTiffFixture({
      bigTiff: true,
      directories: [{ tiled: true, tileWidth: 32, tileHeight: 16 }]
    }));

    expect(result).toMatchObject({
      container: "bigtiff",
      directoryCount: 1,
      directories: [{
        layout: "tiled",
        tileWidth: 32,
        tileHeight: 16
      }]
    });
  });

  it("preserves ordered multi-directory metadata within the configured bound", async () => {
    const source = createTiffFixture({
      directories: [
        { width: 128, height: 64 },
        { width: 64, height: 32 }
      ]
    });
    const result = await probeTiffMetadata(source, { maxDirectories: 2 });

    expect(result.directoryCount).toBe(2);
    expect(result.directories.map(({ index, width, height }) => ({ index, width, height }))).toEqual([
      { index: 0, width: 128, height: 64 },
      { index: 1, width: 64, height: 32 }
    ]);
    await expect(probeTiffMetadata(source, { maxDirectories: 1 })).rejects.toMatchObject({
      code: "tiff.directory_limit"
    });
  });

  it("rejects invalid, truncated, unsafe-offset, and aborted inputs with typed errors", async () => {
    await expect(probeTiffMetadata(new Blob([new Uint8Array([1, 2, 3])]))).rejects.toMatchObject({
      code: "tiff.invalid_header"
    });
    await expect(probeTiffMetadata(new Blob([new Uint8Array(8)]))).rejects.toMatchObject({
      code: "tiff.invalid_header"
    });
    await expect(probeTiffMetadata(createUnsafeBigTiffOffsetFixture())).rejects.toMatchObject({
      code: "tiff.unsafe_offset"
    });
    const controller = new AbortController();
    controller.abort();
    await expect(probeTiffMetadata(createTiffFixture(), { signal: controller.signal })).rejects.toMatchObject({
      code: "tiff.aborted"
    });
    await expect(probeTiffMetadata(createTiffFixture(), { maxDirectories: 0 })).rejects.toThrow(
      "maxDirectories must be a positive safe integer."
    );
  });

  it("converts one directory to existing manifest image metadata without mutation", async () => {
    const result = await probeTiffMetadata(createTiffFixture({
      directories: [{ width: 4096, height: 2048, bitsPerSample: 16 }]
    }));
    const before = structuredClone(result);
    const image = toTiffImageMetadata(result);
    const file = new File([new Uint8Array(32)], "wafer.tif", { type: "image/tiff" });
    const manifest = await createManifest(file, { image, checksum: false });

    expect(image).toEqual({ format: "tiff", width: 4096, height: 2048, colorDepth: 16 });
    expect(manifest.image).toMatchObject(image);
    expect(result).toEqual(before);
    expect(() => toTiffImageMetadata(result, 2)).toThrow(TiffProbeError);
  });
});
