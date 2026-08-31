import { createManifest } from "../src/manifest.js";
import type { IngestFileLike, IngestManifest } from "../src/types.js";

export function profileFile(
  name: string,
  type = "image/tiff",
  value = "domain-profile-source"
): IngestFileLike {
  const blob = new Blob([value], { type });
  Object.defineProperties(blob, { name: { value: name }, lastModified: { value: 0 } });
  return blob as IngestFileLike;
}

export async function profileManifest(
  domain: "semiconductor" | "microscopy" | "satellite"
): Promise<{ file: IngestFileLike; manifest: IngestManifest }> {
  const file = profileFile(
    domain === "semiconductor" ? "inspection.tif" :
      domain === "microscopy" ? "sample.ome.tiff" : "scene.geotiff"
  );
  const metadata = domain === "semiconductor"
    ? {
        lotId: "LOT-2026-001",
        waferId: "W12",
        inspectionTimestamp: "2026-08-31T10:00:00+09:00"
      }
    : domain === "microscopy"
      ? {
          specimenId: "SPECIMEN-1",
          acquisitionId: "ACQ-1",
          instrumentId: "MICROSCOPE-1",
          acquisitionTimestamp: "2026-08-31T01:00:00Z"
        }
      : {
          sceneId: "SCENE-1",
          sensorId: "SENSOR-1",
          acquisitionTimestamp: "2026-08-31T01:00:00Z"
        };
  const manifest = await createManifest(file, {
    manifestIdentity: {
      id: `manifest-${domain}-profile`,
      createdAt: "2026-08-31T00:00:00.000Z"
    },
    metadata,
    image: { width: 4096, height: 2048, colorDepth: 16 }
  });
  return { file, manifest };
}

export function structuralEvidence(domain: "semiconductor" | "microscopy" | "satellite") {
  return {
    source: "sdk_observed" as const,
    format: domain === "semiconductor" ? "tiff" as const :
      domain === "microscopy" ? "ome-tiff" as const : "geotiff" as const,
    width: 4096,
    height: 2048,
    bitDepth: 16
  };
}
