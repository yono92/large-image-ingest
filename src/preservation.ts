import { validateDerivativeReference } from "./derivatives.js";
import { canonicalizeProvenanceJson, validateIngestProvenance, type IngestProvenanceArtifactV1 } from "./provenance.js";
import type { DerivativeManifest, IngestFileLike, IngestManifest } from "./types.js";
import { generatedEntry, generatedJsonBytes, materialize, standardPath, toPublicEntry, validateBagIt, validateManifestInput, validateOcflObject, validatePlannedPaths, verifyBlobEntry, writeBagIt, writeOcflObject } from "./preservation-packages.js";
import { addIssue, deepFreeze, normalizeCreatedAt, safeErrorMessage, sha256Text } from "./preservation-sidecars.js";
import { executionPlans } from "./preservation-shared.js";
import type { MutableMappingState } from "./preservation-shared.js";
export { validateBagIt, validateOcflObject } from "./preservation-packages.js";

/** @experimental */
export const PRESERVATION_MAPPING_SCHEMA_VERSION =
  "large-image-ingest.preservation-mapping.v1" as const;
/** @experimental */
export const PRESERVATION_RELATIONSHIP_SCHEMA_VERSION =
  "large-image-ingest.preservation-relationships.v1" as const;

export type PreservationProfile = "bagit-1.0-sha256" | "ocfl-1.1-sha256";
export type PreservationDigestPolicy = "require-existing" | "calculate-and-verify";
export type PreservationMappingStatus = "exportable" | "exportable_with_warnings" | "blocked";
export type PreservationEntryRole =
  | "original"
  | "derivative"
  | "manifest"
  | "provenance"
  | "relationships";

export type PreservationIssueCode =
  | "preservation.profile_unsupported"
  | "preservation.manifest_invalid"
  | "preservation.source_unavailable"
  | "preservation.source_size_mismatch"
  | "preservation.digest_missing"
  | "preservation.digest_unsupported"
  | "preservation.digest_mismatch"
  | "preservation.derivative_status_invalid"
  | "preservation.derivative_relationship_invalid"
  | "preservation.provenance_missing"
  | "preservation.provenance_invalid"
  | "preservation.mapping_collision"
  | "preservation.path_unsafe"
  | "preservation.mapping_untrusted"
  | "preservation.mapping_blocked"
  | "preservation.destination_exists"
  | "preservation.declaration_invalid"
  | "preservation.payload_manifest_invalid"
  | "preservation.tag_manifest_invalid"
  | "preservation.inventory_invalid"
  | "preservation.inventory_mismatch"
  | "preservation.inventory_digest_invalid"
  | "preservation.content_missing"
  | "preservation.content_changed"
  | "preservation.content_unmanifested"
  | "preservation.relationship_invalid"
  | "preservation.version_unsupported"
  | "preservation.materialization_failed"
  | "preservation.validation_failed";

export interface PreservationIssue {
  code: PreservationIssueCode;
  role?: PreservationEntryRole;
}

export interface PreservationDigest {
  algorithm: "sha256";
  value: string;
}

export interface PreservationMappingEntry {
  role: PreservationEntryRole;
  logicalPath: string;
  contentPath?: string;
  digest: PreservationDigest;
  sizeBytes: number;
  availability: "available";
  derivative?: {
    id: string;
    kind: string;
  };
}

export interface PreservationRelationshipSidecarV1 {
  schemaVersion: typeof PRESERVATION_RELATIONSHIP_SCHEMA_VERSION;
  profile: PreservationProfile;
  manifestId: string;
  original: {
    logicalPath: string;
    digest: PreservationDigest;
  };
  derivatives: readonly {
    id: string;
    kind: string;
    logicalPath: string;
    digest: PreservationDigest;
    sourceManifestId: string;
  }[];
  metadata: {
    manifestPath: string;
    provenancePath?: string;
  };
  integrity: {
    algorithm: "sha256";
    canonicalization: "rfc8785-jcs";
    value: string;
  };
}

export interface PreservationMapping {
  schemaVersion: typeof PRESERVATION_MAPPING_SCHEMA_VERSION;
  profile: PreservationProfile;
  standardVersion: "BagIt 1.0" | "OCFL 1.1";
  status: PreservationMappingStatus;
  manifestId: string;
  entries: readonly PreservationMappingEntry[];
  warnings: readonly PreservationIssue[];
  blockers: readonly PreservationIssue[];
  extensionUsage: {
    relationshipSidecar: typeof PRESERVATION_RELATIONSHIP_SCHEMA_VERSION;
    provenance: "included" | "unavailable";
  };
}

export interface EvaluatePreservationMappingInput {
  profile: PreservationProfile;
  manifest: IngestManifest;
  original?: { bytes?: IngestFileLike };
  derivatives?: readonly {
    derivative: DerivativeManifest;
    bytes?: IngestFileLike;
  }[];
  provenance?: IngestProvenanceArtifactV1 | unknown;
  digestPolicy?: PreservationDigestPolicy;
  checksumChunkSize?: number;
  createdAt?: string;
}

export interface PreservationValidationResult {
  ok: boolean;
  profile: PreservationProfile;
  issues: readonly PreservationIssue[];
  contentFileCount: number;
  verifiedContentFileCount: number;
}

export interface PreservationExportOptions {
  destination: string;
}

export interface PreservationExportResult {
  ok: true;
  profile: PreservationProfile;
  status: "exported";
  contentFileCount: number;
  verifiedContentFileCount: number;
}

/** @experimental */
export class PreservationError extends Error {
  readonly code: PreservationIssueCode;
  readonly issues: readonly PreservationIssue[];

  constructor(code: PreservationIssueCode, issues: readonly PreservationIssue[] = []) {
    super(safeErrorMessage(code));
    this.name = "PreservationError";
    this.code = code;
    this.issues = issues;
  }
}

/** @experimental */
export async function evaluatePreservationMapping(
  input: EvaluatePreservationMappingInput
): Promise<PreservationMapping> {
  const profile = input.profile;
  if (profile !== "bagit-1.0-sha256" && profile !== "ocfl-1.1-sha256") {
    throw new PreservationError("preservation.profile_unsupported");
  }

  const state: MutableMappingState = { entries: [], warnings: [], blockers: [] };
  const digestPolicy = input.digestPolicy ?? "require-existing";
  const originalLogicalPath = standardPath(profile, "original/source.bin", "original");
  const manifestLogicalPath = standardPath(profile, "metadata/ingest-manifest.json", "manifest");
  const provenanceLogicalPath = standardPath(profile, "metadata/provenance.json", "provenance");
  const relationshipLogicalPath = standardPath(profile, "metadata/relationships.json", "relationships");

  validateManifestInput(input.manifest, state);
  const original = await verifyBlobEntry({
    bytes: input.original?.bytes,
    expectedSize: input.manifest.original.sizeBytes,
    expectedDigest: input.manifest.original.checksum,
    digestPolicy,
    logicalPath: originalLogicalPath,
    role: "original",
    ...(input.checksumChunkSize === undefined ? {} : { checksumChunkSize: input.checksumChunkSize })
  }, state);
  if (original) state.entries.push(original);

  const selectedDerivatives = [...(input.derivatives ?? [])];
  for (const [index, selected] of selectedDerivatives.entries()) {
    const derivative = selected.derivative;
    const manifestDerivative = input.manifest.derivatives.find((candidate) => candidate.id === derivative.id);
    const relationship = validateDerivativeReference(derivative, input.manifest, {
      strictSourceIdentity: true
    });
    if (
      derivative.status !== "created" ||
      manifestDerivative?.status !== "created"
    ) {
      addIssue(state.blockers, "preservation.derivative_status_invalid", "derivative");
      continue;
    }
    if (
      !manifestDerivative ||
      relationship.ok === false ||
      manifestDerivative.kind !== derivative.kind ||
      manifestDerivative.checksum?.value !== derivative.checksum?.value
    ) {
      addIssue(state.blockers, "preservation.derivative_relationship_invalid", "derivative");
      continue;
    }
    const idHash = sha256Text(derivative.id).slice(0, 12);
    const relativePath = `derivatives/derivative-${String(index + 1).padStart(4, "0")}-${idHash}.bin`;
    const entry = await verifyBlobEntry({
      bytes: selected.bytes,
      expectedSize: derivative.sizeBytes,
      expectedDigest: derivative.checksum,
      digestPolicy,
      logicalPath: standardPath(profile, relativePath, "derivative"),
      role: "derivative",
      ...(input.checksumChunkSize === undefined ? {} : { checksumChunkSize: input.checksumChunkSize }),
      derivative: { id: derivative.id, kind: derivative.kind }
    }, state);
    if (entry) state.entries.push(entry);
  }

  const manifestBytes = generatedJsonBytes(input.manifest, state, "manifest");
  if (manifestBytes) {
    state.entries.push(generatedEntry("manifest", manifestLogicalPath, manifestBytes, profile));
  }

  let validProvenance: IngestProvenanceArtifactV1 | undefined;
  if (input.provenance === undefined) {
    addIssue(state.warnings, "preservation.provenance_missing", "provenance");
  } else {
    const provenanceResult = await validateIngestProvenance(input.provenance, {
      manifest: input.manifest
    });
    if (!provenanceResult.ok || !provenanceResult.artifact) {
      addIssue(state.blockers, "preservation.provenance_invalid", "provenance");
    } else {
      validProvenance = provenanceResult.artifact;
      const provenanceBytes = generatedJsonBytes(validProvenance, state, "provenance");
      if (provenanceBytes) {
        state.entries.push(generatedEntry("provenance", provenanceLogicalPath, provenanceBytes, profile));
      }
    }
  }

  const contentEntries = state.entries.filter((entry) =>
    entry.role === "original" || entry.role === "derivative"
  );
  const originalEntry = contentEntries.find((entry) => entry.role === "original");
  if (originalEntry) {
    const relationshipBody = {
      schemaVersion: PRESERVATION_RELATIONSHIP_SCHEMA_VERSION,
      profile,
      manifestId: input.manifest.id,
      original: {
        logicalPath: originalEntry.logicalPath,
        digest: originalEntry.digest
      },
      derivatives: contentEntries
        .filter((entry) => entry.role === "derivative" && entry.derivative)
        .map((entry) => ({
          id: entry.derivative!.id,
          kind: entry.derivative!.kind,
          logicalPath: entry.logicalPath,
          digest: entry.digest,
          sourceManifestId: input.manifest.id
        })),
      metadata: {
        manifestPath: manifestLogicalPath,
        ...(validProvenance ? { provenancePath: provenanceLogicalPath } : {})
      }
    };
    const relationship: PreservationRelationshipSidecarV1 = {
      ...relationshipBody,
      integrity: {
        algorithm: "sha256",
        canonicalization: "rfc8785-jcs",
        value: sha256Text(canonicalizeProvenanceJson(relationshipBody))
      }
    };
    const relationshipBytes = generatedJsonBytes(relationship, state, "relationships");
    if (relationshipBytes) {
      state.entries.push(generatedEntry("relationships", relationshipLogicalPath, relationshipBytes, profile));
    }

    validatePlannedPaths(state);
    const publicEntries = state.entries.map(toPublicEntry);
    const status: PreservationMappingStatus = state.blockers.length > 0
      ? "blocked"
      : state.warnings.length > 0
        ? "exportable_with_warnings"
        : "exportable";
    const mapping: PreservationMapping = {
      schemaVersion: PRESERVATION_MAPPING_SCHEMA_VERSION,
      profile,
      standardVersion: profile.startsWith("bagit") ? "BagIt 1.0" : "OCFL 1.1",
      status,
      manifestId: input.manifest.id,
      entries: publicEntries,
      warnings: [...state.warnings],
      blockers: [...state.blockers],
      extensionUsage: {
        relationshipSidecar: PRESERVATION_RELATIONSHIP_SCHEMA_VERSION,
        provenance: validProvenance ? "included" : "unavailable"
      }
    };
    executionPlans.set(mapping, {
      createdAt: normalizeCreatedAt(input.createdAt ?? input.manifest.createdAt),
      entries: state.entries,
      relationship
    });
    return deepFreeze(mapping);
  }

  addIssue(state.blockers, "preservation.source_unavailable", "original");
  const mapping: PreservationMapping = {
    schemaVersion: PRESERVATION_MAPPING_SCHEMA_VERSION,
    profile,
    standardVersion: profile.startsWith("bagit") ? "BagIt 1.0" : "OCFL 1.1",
    status: "blocked",
    manifestId: input.manifest.id,
    entries: state.entries.map(toPublicEntry),
    warnings: [...state.warnings],
    blockers: [...state.blockers],
    extensionUsage: {
      relationshipSidecar: PRESERVATION_RELATIONSHIP_SCHEMA_VERSION,
      provenance: validProvenance ? "included" : "unavailable"
    }
  };
  return deepFreeze(mapping);
}

/** @experimental */
export async function exportBagIt(
  mapping: PreservationMapping,
  options: PreservationExportOptions
): Promise<PreservationExportResult> {
  return materialize(mapping, options, "bagit-1.0-sha256", writeBagIt, validateBagIt);
}

/** @experimental */
export async function exportOcflObject(
  mapping: PreservationMapping,
  options: PreservationExportOptions
): Promise<PreservationExportResult> {
  return materialize(mapping, options, "ocfl-1.1-sha256", writeOcflObject, validateOcflObject);
}
