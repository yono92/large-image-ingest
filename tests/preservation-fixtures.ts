import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { calculateChecksum } from "../src/checksum.js";
import { attachDerivative, createDerivativeReference } from "../src/derivatives.js";
import { createManifest } from "../src/manifest.js";
import {
  createIngestProvenanceRecorder,
  type IngestProvenanceArtifactV1
} from "../src/provenance.js";
import type { DerivativeManifest, IngestFileLike, IngestManifest } from "../src/types.js";

export function namedBlob(value: string, name = "untrusted/../inspection.tif"): IngestFileLike {
  const blob = new Blob([value], { type: "image/tiff" });
  Object.defineProperties(blob, {
    name: { value: name },
    lastModified: { value: 0 }
  });
  return blob as IngestFileLike;
}

export async function preservationFixture(options: { duplicateDerivativeBytes?: boolean } = {}): Promise<{
  original: IngestFileLike;
  manifest: IngestManifest;
  provenance: IngestProvenanceArtifactV1;
  derivatives: { derivative: DerivativeManifest; bytes: IngestFileLike }[];
}> {
  const original = namedBlob("verified-original-bytes");
  let manifest = await createManifest(original, {
    manifestIdentity: {
      id: "manifest-preservation-1",
      createdAt: "2026-08-31T00:00:00.000Z"
    }
  });
  const values = options.duplicateDerivativeBytes
    ? ["same-derivative", "same-derivative"]
    : ["preview-derivative", "thumbnail-derivative"];
  const derivatives: { derivative: DerivativeManifest; bytes: IngestFileLike }[] = [];
  for (const [index, value] of values.entries()) {
    const bytes = namedBlob(value, index === 0 ? "same-name.jpg" : "../same-name.jpg");
    const checksum = await calculateChecksum(bytes);
    const derivative = createDerivativeReference({
      manifest,
      id: `derivative-${index + 1}`,
      kind: index === 0 ? "preview" : "thumbnail",
      status: "created",
      sizeBytes: bytes.size,
      checksum
    });
    manifest = attachDerivative(manifest, derivative);
    derivatives.push({ derivative, bytes });
  }
  const recorder = createIngestProvenanceRecorder({
    manifest,
    artifactId: "provenance-preservation-1",
    correlationId: "ingest-preservation-1",
    policy: { id: "inspection-default", version: "1.0.0" },
    transport: { category: "s3-multipart" },
    now: () => new Date("2026-08-31T00:00:01.000Z")
  });
  recorder.observeIngestEvent({ type: "started", manifest, uploadId: "secret-upload" });
  recorder.observeIngestEvent({ type: "completed", manifest, uploadId: "secret-upload" });
  recorder.recordVerification({
    status: "verified",
    verifierCategory: "stored-original",
    expectedEvidenceCategories: ["byte-count", "whole-file-sha256"],
    observedEvidenceCategories: ["byte-count", "whole-file-sha256"],
    issueCodes: []
  });
  for (const { derivative } of derivatives) recorder.recordDerivative({ derivative });
  return { original, manifest, provenance: await recorder.seal(), derivatives };
}

export async function temporaryRoot(): Promise<{ root: string; cleanup(): Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "large-image-ingest-preservation-test-"));
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}
