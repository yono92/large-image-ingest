import { describe, expect, it } from "vitest";
import { validateDerivativeReference } from "../src/derivatives";
import { createManifest } from "../src/manifest";
import {
  createMetadataDerivative,
  createTilePyramidDerivative
} from "../src/node-metadata";

async function createInspectionManifest(name = "wafer-aoi-001.tif") {
  return createManifest(new File(["inspection-data"], name, { type: "image/tiff" }), {
    checksum: false,
    image: {
      format: "tiff",
      width: 4096,
      height: 4096,
      colorDepth: 16
    }
  });
}

describe("metadata derivatives", () => {
  it("records metadata enrichment as a traceable derivative", async () => {
    const manifest = await createInspectionManifest();

    const metadata = createMetadataDerivative({
      manifest,
      id: "metadata-extraction",
      status: "created",
      format: "tiff",
      width: 4096,
      height: 4096,
      colorDepth: 16,
      channels: 1,
      provenance: {
        generator: "inspection-metadata-reader",
        generatorVersion: "1.0.0",
        environment: "server"
      }
    });

    expect(metadata).toMatchObject({
      id: "metadata-extraction",
      kind: "metadata",
      status: "created",
      source: "original",
      sourceIdentity: {
        manifestId: manifest.id
      },
      metadata: {
        format: "tiff",
        width: 4096,
        height: 4096,
        colorDepth: 16,
        channels: 1
      }
    });
  });

  it("validates tile pyramid descriptors", async () => {
    const manifest = await createInspectionManifest();

    const tile = createTilePyramidDerivative({
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
          rows: 16,
          scale: 1
        }
      ],
      storage: {
        kind: "object",
        locationHint: "tiles/wafer-aoi-001/{level}/{row}/{column}.jpg"
      }
    });

    expect(tile).toMatchObject({
      id: "tile-pyramid",
      kind: "tile",
      status: "created",
      tilePyramid: {
        tileWidth: 256,
        tileHeight: 256
      }
    });
    expect(validateDerivativeReference(tile, manifest).ok).toBe(true);

    expect(() =>
      createTilePyramidDerivative({
        manifest,
        id: "invalid-tile-pyramid",
        status: "created",
        tileWidth: 0,
        tileHeight: 256,
        levels: []
      })
    ).toThrow(/invalid tile pyramid/i);
  });

  it("reports stale source identity for metadata enrichment", async () => {
    const manifest = await createInspectionManifest();
    const otherManifest = await createInspectionManifest("other-wafer.tif");
    const metadata = createMetadataDerivative({
      manifest,
      id: "metadata-extraction",
      status: "created",
      width: 4096,
      height: 4096
    });

    const result = validateDerivativeReference(metadata, otherManifest);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("derivative.source.mismatch");
  });
});
