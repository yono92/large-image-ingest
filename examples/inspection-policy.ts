import {
  compileInspectionMetadataProfile,
  evaluateInspectionPolicy,
  parseInspectionPolicyPack,
  type IngestCompletionEvidence,
  type IngestManifest
} from "large-image-ingest/core";

const microscopyProfile = compileInspectionMetadataProfile({
  schemaVersion: "large-image-ingest.inspection-profile.v1",
  id: "microscopy-capture",
  version: "1.0.0",
  fields: [
    { key: "inspectionId", type: "string", required: true, minLength: 1, maxLength: 128 },
    { key: "sampleId", type: "string", required: true, minLength: 1, maxLength: 128 },
    { key: "magnification", type: "number", minimum: 1, maximum: 100_000 }
  ]
});

const microscopyPolicy = parseInspectionPolicyPack({
  schemaVersion: "large-image-ingest.inspection-policy.v1",
  id: "microscopy-evidence",
  version: "1.0.0",
  metadataProfile: microscopyProfile,
  requireOriginalPreserved: true,
  requireWholeFileChecksum: true,
  allowedCompletionStatuses: ["verified"],
  requireStoredChecksum: true,
  allowedMediaTypes: ["image/tiff"]
});

export function evaluateMicroscopyEvidence(
  manifest: IngestManifest,
  completion: IngestCompletionEvidence
) {
  return evaluateInspectionPolicy({ manifest, completion, policy: microscopyPolicy });
}
