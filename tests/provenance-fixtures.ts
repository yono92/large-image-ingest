import { createManifest } from "../src/manifest.js";
import {
  createIngestProvenanceRecorder,
  type IngestProvenanceArtifactV1,
  type IngestProvenanceRecorder
} from "../src/provenance.js";
import type { IngestFileLike, IngestManifest, TransportCapabilities } from "../src/types.js";

export const fixtureCapabilities: TransportCapabilities = {
  name: "fixture-transport",
  resumable: true,
  abortable: true,
  expires: true,
  supportsParallelChunks: false,
  supportsChunkChecksum: true,
  supportsSnapshotResume: true,
  supportsPersistentResume: true
};

export function namedBlob(value = "provenance-source"): IngestFileLike {
  const blob = new Blob([value], { type: "image/tiff" });
  Object.defineProperties(blob, {
    name: { value: "inspection.tif" },
    lastModified: { value: 1 }
  });
  return blob as IngestFileLike;
}

export async function fixtureManifest(value = "provenance-source"): Promise<IngestManifest> {
  return createManifest(namedBlob(value), {
    manifestIdentity: {
      id: "manifest-provenance-1",
      createdAt: "2026-08-31T00:00:00.000Z"
    },
    validation: { requiredMetadata: ["lotId"] },
    metadata: { lotId: "lot-secret-42" }
  });
}

export function fixtureRecorder(
  manifest: IngestManifest,
  options: { now?: () => Date; authorized?: boolean } = {}
): IngestProvenanceRecorder {
  return createIngestProvenanceRecorder({
    manifest,
    artifactId: "provenance-1",
    correlationId: "ingest-1",
    policy: { id: "inspection-default", version: "1.0.0" },
    transport: { category: "s3-multipart", capabilities: fixtureCapabilities },
    disclosureProfile: options.authorized ? "authorized-full" : "audit",
    ...(options.authorized ? { annotations: { caseId: "customer-case-secret" } } : {}),
    now: options.now ?? (() => new Date("2026-08-31T00:00:01.000Z"))
  });
}

export async function completedArtifact(
  options: { verified?: "verified" | "failed" | "unavailable"; authorized?: boolean } = {}
): Promise<{ artifact: IngestProvenanceArtifactV1; manifest: IngestManifest }> {
  const manifest = await fixtureManifest();
  const recorder = fixtureRecorder(manifest, { authorized: options.authorized });
  recorder.observeIngestEvent({ type: "started", manifest, uploadId: "secret-upload-id" });
  recorder.observeIngestEvent({ type: "completed", manifest, uploadId: "secret-upload-id" });
  if (options.verified) {
    recorder.recordVerification({
      status: options.verified,
      verifierCategory: "stored-original",
      expectedEvidenceCategories: ["byte-count", "whole-file-sha256"],
      observedEvidenceCategories: options.verified === "verified"
        ? ["byte-count", "whole-file-sha256"]
        : ["byte-count"],
      issueCodes: options.verified === "failed" ? ["verification.checksum_mismatch"] : []
    });
  }
  return { artifact: await recorder.seal(), manifest };
}

export function mutableArtifact(artifact: IngestProvenanceArtifactV1): Record<string, any> {
  return JSON.parse(JSON.stringify(artifact));
}
