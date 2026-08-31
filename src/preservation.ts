import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { calculateChecksum } from "./checksum.js";
import { validateDerivativeReference } from "./derivatives.js";
import {
  canonicalizeProvenanceJson,
  validateIngestProvenance,
  type IngestProvenanceArtifactV1
} from "./provenance.js";
import type { DerivativeManifest, IngestFileLike, IngestManifest } from "./types.js";

export const PRESERVATION_MAPPING_SCHEMA_VERSION =
  "large-image-ingest.preservation-mapping.v1" as const;
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

interface SourceEntry extends PreservationMappingEntry {
  source: { kind: "blob"; bytes: IngestFileLike } | { kind: "generated"; bytes: Uint8Array };
}

interface ExecutionPlan {
  createdAt: string;
  entries: readonly SourceEntry[];
  relationship: PreservationRelationshipSidecarV1;
}

interface MutableMappingState {
  entries: SourceEntry[];
  warnings: PreservationIssue[];
  blockers: PreservationIssue[];
}

interface OcflInventory {
  id: string;
  type: "https://ocfl.io/1.1/spec/#inventory";
  digestAlgorithm: "sha256";
  head: "v1";
  manifest: Record<string, string[]>;
  versions: {
    v1: {
      created: string;
      state: Record<string, string[]>;
    };
  };
}

const executionPlans = new WeakMap<PreservationMapping, ExecutionPlan>();
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const BAGIT_DECLARATION = "BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n";
const OCFL_DECLARATION = "ocfl_object_1.1\n";
const OCFL_INVENTORY_TYPE = "https://ocfl.io/1.1/spec/#inventory" as const;

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

export async function exportBagIt(
  mapping: PreservationMapping,
  options: PreservationExportOptions
): Promise<PreservationExportResult> {
  return materialize(mapping, options, "bagit-1.0-sha256", writeBagIt, validateBagIt);
}

export async function exportOcflObject(
  mapping: PreservationMapping,
  options: PreservationExportOptions
): Promise<PreservationExportResult> {
  return materialize(mapping, options, "ocfl-1.1-sha256", writeOcflObject, validateOcflObject);
}

export async function validateBagIt(root: string): Promise<PreservationValidationResult> {
  const issues: PreservationIssue[] = [];
  let verified = 0;
  let contentCount = 0;
  try {
    const declaration = await readFile(join(root, "bagit.txt"), "utf8");
    if (declaration !== BAGIT_DECLARATION) {
      addIssue(issues, "preservation.declaration_invalid");
    }

    const payloadManifestPath = join(root, "manifest-sha256.txt");
    const payloadManifest = parseDigestManifest(await readFile(payloadManifestPath, "utf8"), "data/");
    if (!payloadManifest.ok) {
      addIssue(issues, "preservation.payload_manifest_invalid");
    }
    const payloadFiles = await listFiles(join(root, "data"));
    contentCount = payloadFiles.length;
    const payloadRelative = payloadFiles.map((path) => toPosix(relative(root, path))).sort();
    if (!sameStrings(payloadRelative, [...payloadManifest.entries.keys()].sort())) {
      addIssue(issues, payloadRelative.some((path) => !payloadManifest.entries.has(path))
        ? "preservation.content_unmanifested"
        : "preservation.content_missing");
    }
    for (const [path, digest] of payloadManifest.entries) {
      if (!safeRelativePath(path, "data/") || !withinRoot(root, join(root, ...path.split("/")))) {
        addIssue(issues, "preservation.path_unsafe");
        continue;
      }
      try {
        if (await sha256File(join(root, ...path.split("/"))) !== digest) {
          addIssue(issues, "preservation.content_changed");
        } else {
          verified += 1;
        }
      } catch {
        addIssue(issues, "preservation.content_missing");
      }
    }

    const tagManifestText = await readFile(join(root, "tagmanifest-sha256.txt"), "utf8");
    const tagManifest = parseDigestManifest(tagManifestText);
    const allFiles = (await listFiles(root)).map((path) => toPosix(relative(root, path)));
    const expectedTagFiles = allFiles
      .filter((path) => !path.startsWith("data/") && path !== "tagmanifest-sha256.txt")
      .sort();
    if (!tagManifest.ok || !sameStrings(expectedTagFiles, [...tagManifest.entries.keys()].sort())) {
      addIssue(issues, "preservation.tag_manifest_invalid");
    }
    for (const [path, digest] of tagManifest.entries) {
      if (!safeRelativePath(path) || path.startsWith("data/") || !withinRoot(root, join(root, ...path.split("/")))) {
        addIssue(issues, "preservation.path_unsafe");
        continue;
      }
      try {
        if (await sha256File(join(root, ...path.split("/"))) !== digest) {
          addIssue(issues, "preservation.tag_manifest_invalid");
        }
      } catch {
        addIssue(issues, "preservation.tag_manifest_invalid");
      }
    }

    const allDeclaredDigests = new Map<string, string>([
      ...payloadManifest.entries,
      ...tagManifest.entries
    ]);
    await validateRelationshipFile(
      join(root, "large-image-ingest", "relationships.json"),
      "bagit-1.0-sha256",
      allDeclaredDigests,
      issues
    );
  } catch {
    addIssue(issues, "preservation.validation_failed");
  }
  return validationResult("bagit-1.0-sha256", issues, contentCount, verified);
}

export async function validateOcflObject(root: string): Promise<PreservationValidationResult> {
  const issues: PreservationIssue[] = [];
  let verified = 0;
  let contentCount = 0;
  try {
    const declaration = await readFile(join(root, "0=ocfl_object_1.1"), "utf8");
    if (declaration !== OCFL_DECLARATION) addIssue(issues, "preservation.declaration_invalid");

    const rootInventoryBytes = await readFile(join(root, "inventory.json"));
    const versionInventoryBytes = await readFile(join(root, "v1", "inventory.json"));
    if (!rootInventoryBytes.equals(versionInventoryBytes)) {
      addIssue(issues, "preservation.inventory_mismatch");
    }
    const inventoryDigest = sha256Bytes(rootInventoryBytes);
    await validateInventorySidecar(join(root, "inventory.json.sha256"), inventoryDigest, issues);
    await validateInventorySidecar(join(root, "v1", "inventory.json.sha256"), inventoryDigest, issues);

    const inventory = JSON.parse(rootInventoryBytes.toString("utf8")) as unknown;
    if (!isOcflInventory(inventory)) {
      addIssue(issues, "preservation.inventory_invalid");
      return validationResult("ocfl-1.1-sha256", issues, 0, 0);
    }
    const manifestPaths = new Map<string, string>();
    for (const [digest, paths] of Object.entries(inventory.manifest)) {
      if (!SHA256.test(digest) || paths.length !== 1) {
        addIssue(issues, "preservation.inventory_invalid");
        continue;
      }
      const contentPath = paths[0]!;
      if (
        !safeRelativePath(contentPath, "v1/content/") ||
        contentPath !== `v1/content/${digest.slice(0, 2)}/${digest}` ||
        !withinRoot(root, join(root, ...contentPath.split("/")))
      ) {
        addIssue(issues, "preservation.path_unsafe");
        continue;
      }
      if (manifestPaths.has(contentPath)) {
        addIssue(issues, "preservation.inventory_invalid");
        continue;
      }
      manifestPaths.set(contentPath, digest);
      try {
        if (await sha256File(join(root, ...contentPath.split("/"))) !== digest) {
          addIssue(issues, "preservation.content_changed");
        } else {
          verified += 1;
        }
      } catch {
        addIssue(issues, "preservation.content_missing");
      }
    }
    contentCount = manifestPaths.size;
    const actualContentPaths = (await listFiles(join(root, "v1", "content")))
      .map((path) => toPosix(relative(root, path)))
      .sort();
    if (!sameStrings(actualContentPaths, [...manifestPaths.keys()].sort())) {
      addIssue(issues, actualContentPaths.some((path) => !manifestPaths.has(path))
        ? "preservation.content_unmanifested"
        : "preservation.content_missing");
    }

    const logicalPaths = new Map<string, string>();
    for (const [digest, paths] of Object.entries(inventory.versions.v1.state)) {
      if (!SHA256.test(digest) || !inventory.manifest[digest] || paths.length === 0) {
        addIssue(issues, "preservation.inventory_invalid");
      }
      for (const logicalPath of paths) {
        if (!safeRelativePath(logicalPath) || logicalPaths.has(logicalPath)) {
          addIssue(issues, "preservation.path_unsafe");
        } else {
          logicalPaths.set(logicalPath, digest);
        }
      }
    }
    if (hasPathPrefixCollision([...logicalPaths.keys()])) addIssue(issues, "preservation.path_unsafe");
    if (Object.keys(inventory.manifest).some((digest) => !inventory.versions.v1.state[digest])) {
      addIssue(issues, "preservation.inventory_mismatch");
    }

    const relationshipDigest = logicalPaths.get("metadata/relationships.json");
    const relationshipContentPath = relationshipDigest
      ? inventory.manifest[relationshipDigest]?.[0]
      : undefined;
    if (!relationshipDigest || !relationshipContentPath) {
      addIssue(issues, "preservation.relationship_invalid");
    } else {
      const contentDigestByLogical = new Map<string, string>(logicalPaths);
      await validateRelationshipFile(
        join(root, ...relationshipContentPath.split("/")),
        "ocfl-1.1-sha256",
        contentDigestByLogical,
        issues
      );
    }
  } catch {
    addIssue(issues, "preservation.validation_failed");
  }
  return validationResult("ocfl-1.1-sha256", issues, contentCount, verified);
}

async function materialize(
  mapping: PreservationMapping,
  options: PreservationExportOptions,
  expectedProfile: PreservationProfile,
  writer: (root: string, mapping: PreservationMapping, plan: ExecutionPlan) => Promise<void>,
  validator: (root: string) => Promise<PreservationValidationResult>
): Promise<PreservationExportResult> {
  const plan = executionPlans.get(mapping);
  if (!plan || mapping.schemaVersion !== PRESERVATION_MAPPING_SCHEMA_VERSION) {
    throw new PreservationError("preservation.mapping_untrusted");
  }
  if (mapping.profile !== expectedProfile) throw new PreservationError("preservation.profile_unsupported");
  if (mapping.status === "blocked") {
    throw new PreservationError("preservation.mapping_blocked", mapping.blockers);
  }
  const destination = validateDestination(options?.destination);
  if (await pathExists(destination)) throw new PreservationError("preservation.destination_exists");
  await mkdir(dirname(destination), { recursive: true });
  const staging = join(dirname(destination), `.${basename(destination)}.incomplete-${randomUUID()}`);
  try {
    await mkdir(staging, { recursive: false });
    await writer(staging, mapping, plan);
    const validation = await validator(staging);
    if (!validation.ok) throw new PreservationError("preservation.validation_failed", validation.issues);
    if (await pathExists(destination)) throw new PreservationError("preservation.destination_exists");
    await rename(staging, destination);
    return {
      ok: true,
      profile: mapping.profile,
      status: "exported",
      contentFileCount: validation.contentFileCount,
      verifiedContentFileCount: validation.verifiedContentFileCount
    };
  } catch (error) {
    if (error instanceof PreservationError) throw error;
    throw new PreservationError("preservation.materialization_failed");
  }
}

async function writeBagIt(root: string, _mapping: PreservationMapping, plan: ExecutionPlan): Promise<void> {
  await writeSafeFile(root, "bagit.txt", new TextEncoder().encode(BAGIT_DECLARATION));
  const payloadLines: string[] = [];
  for (const entry of plan.entries) {
    if (entry.role !== "original" && entry.role !== "derivative") continue;
    await writeSourceEntry(root, entry);
    payloadLines.push(`${entry.digest.value}  ${entry.logicalPath}`);
  }
  payloadLines.sort();
  await writeSafeFile(root, "manifest-sha256.txt", new TextEncoder().encode(`${payloadLines.join("\n")}\n`));
  for (const entry of plan.entries) {
    if (entry.role === "original" || entry.role === "derivative") continue;
    await writeSourceEntry(root, entry);
  }
  const tagFiles = (await listFiles(root))
    .map((path) => toPosix(relative(root, path)))
    .filter((path) => !path.startsWith("data/") && path !== "tagmanifest-sha256.txt")
    .sort();
  const tagLines: string[] = [];
  for (const path of tagFiles) {
    tagLines.push(`${await sha256File(join(root, ...path.split("/")))}  ${path}`);
  }
  await writeSafeFile(root, "tagmanifest-sha256.txt", new TextEncoder().encode(`${tagLines.join("\n")}\n`));
}

async function writeOcflObject(root: string, mapping: PreservationMapping, plan: ExecutionPlan): Promise<void> {
  await writeSafeFile(root, "0=ocfl_object_1.1", new TextEncoder().encode(OCFL_DECLARATION));
  const manifest: Record<string, string[]> = {};
  const state: Record<string, string[]> = {};
  const uniqueEntries = new Map<string, SourceEntry>();
  for (const entry of plan.entries) {
    const contentPath = entry.contentPath!;
    manifest[entry.digest.value] = [contentPath];
    (state[entry.digest.value] ??= []).push(entry.logicalPath);
    if (!uniqueEntries.has(entry.digest.value)) uniqueEntries.set(entry.digest.value, entry);
  }
  for (const entry of uniqueEntries.values()) await writeSourceEntry(root, entry);
  for (const logicalPaths of Object.values(state)) logicalPaths.sort();
  const inventory: OcflInventory = {
    id: `urn:large-image-ingest:${sha256Text(mapping.manifestId).slice(0, 32)}`,
    type: OCFL_INVENTORY_TYPE,
    digestAlgorithm: "sha256",
    head: "v1",
    manifest: sortRecord(manifest),
    versions: {
      v1: {
        created: plan.createdAt,
        state: sortRecord(state)
      }
    }
  };
  const inventoryBytes = new TextEncoder().encode(canonicalizeProvenanceJson(inventory));
  const inventoryDigest = sha256Bytes(inventoryBytes);
  const sidecar = new TextEncoder().encode(`${inventoryDigest}  inventory.json\n`);
  await writeSafeFile(root, "inventory.json", inventoryBytes);
  await writeSafeFile(root, "inventory.json.sha256", sidecar);
  await writeSafeFile(root, "v1/inventory.json", inventoryBytes);
  await writeSafeFile(root, "v1/inventory.json.sha256", sidecar);
}

async function verifyBlobEntry(
  input: {
    bytes: IngestFileLike | undefined;
    expectedSize: number | undefined;
    expectedDigest: { algorithm: string; value: string; scope?: string } | undefined;
    digestPolicy: PreservationDigestPolicy;
    logicalPath: string;
    role: "original" | "derivative";
    checksumChunkSize?: number;
    derivative?: { id: string; kind: string };
  },
  state: MutableMappingState
): Promise<SourceEntry | undefined> {
  if (!input.bytes) {
    addIssue(state.blockers, "preservation.source_unavailable", input.role);
    return undefined;
  }
  if (input.expectedSize !== undefined && input.expectedSize !== input.bytes.size) {
    addIssue(state.blockers, "preservation.source_size_mismatch", input.role);
    return undefined;
  }
  const expected = input.expectedDigest;
  if (expected && (
    expected.algorithm !== "sha256" ||
    expected.scope !== "whole-file" ||
    !SHA256.test(expected.value.toLowerCase())
  )) {
    addIssue(state.blockers, "preservation.digest_unsupported", input.role);
    return undefined;
  }
  if (!expected && input.digestPolicy === "require-existing") {
    addIssue(state.blockers, "preservation.digest_missing", input.role);
    return undefined;
  }
  try {
    const checksum = await calculateChecksum(input.bytes, {
      algorithm: "sha256",
      ...(input.checksumChunkSize === undefined ? {} : { chunkSize: input.checksumChunkSize })
    });
    if (expected && checksum.value !== expected.value.toLowerCase()) {
      addIssue(state.blockers, "preservation.digest_mismatch", input.role);
      return undefined;
    }
    const entry: SourceEntry = {
      role: input.role,
      logicalPath: input.logicalPath,
      ...(input.logicalPath.startsWith("data/")
        ? {}
        : { contentPath: `v1/content/${checksum.value.slice(0, 2)}/${checksum.value}` }),
      digest: { algorithm: "sha256", value: checksum.value },
      sizeBytes: input.bytes.size,
      availability: "available",
      ...(input.derivative ? { derivative: input.derivative } : {}),
      source: { kind: "blob", bytes: input.bytes }
    };
    return entry;
  } catch {
    addIssue(state.blockers, "preservation.digest_mismatch", input.role);
    return undefined;
  }
}

function validateManifestInput(manifest: IngestManifest, state: MutableMappingState): void {
  if (
    !manifest ||
    manifest.schemaVersion !== "large-image-ingest.manifest.v1" ||
    !SAFE_ID.test(manifest.id) ||
    manifest.original.kind !== "original" ||
    manifest.original.preservation.required !== true ||
    manifest.original.preservation.allowedMutations.length !== 0 ||
    manifest.validation.ok !== true
  ) {
    addIssue(state.blockers, "preservation.manifest_invalid", "manifest");
  }
}

function generatedJsonBytes(
  value: unknown,
  state: MutableMappingState,
  role: "manifest" | "provenance" | "relationships"
): Uint8Array | undefined {
  try {
    return new TextEncoder().encode(`${canonicalizeProvenanceJson(value)}\n`);
  } catch {
    addIssue(state.blockers, role === "provenance"
      ? "preservation.provenance_invalid"
      : role === "manifest"
        ? "preservation.manifest_invalid"
        : "preservation.relationship_invalid", role);
    return undefined;
  }
}

function generatedEntry(
  role: "manifest" | "provenance" | "relationships",
  logicalPath: string,
  bytes: Uint8Array,
  profile: PreservationProfile
): SourceEntry {
  const digest = sha256Bytes(bytes);
  return {
    role,
    logicalPath,
    ...(profile === "ocfl-1.1-sha256"
      ? { contentPath: `v1/content/${digest.slice(0, 2)}/${digest}` }
      : {}),
    digest: { algorithm: "sha256", value: digest },
    sizeBytes: bytes.byteLength,
    availability: "available",
    source: { kind: "generated", bytes }
  };
}

function standardPath(
  profile: PreservationProfile,
  relativePath: string,
  role: PreservationEntryRole
): string {
  if (profile === "ocfl-1.1-sha256") return relativePath;
  if (role === "original" || role === "derivative") return `data/${relativePath}`;
  return `large-image-ingest/${basename(relativePath)}`;
}

function validatePlannedPaths(state: MutableMappingState): void {
  const logicalPaths = state.entries.map((entry) => entry.logicalPath);
  if (logicalPaths.some((path) => !safeRelativePath(path)) || hasPathPrefixCollision(logicalPaths)) {
    addIssue(state.blockers, "preservation.path_unsafe");
  }
  const normalized = logicalPaths.map((path) => path.normalize("NFC").toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    addIssue(state.blockers, "preservation.mapping_collision");
  }
}

function toPublicEntry(entry: SourceEntry): PreservationMappingEntry {
  return {
    role: entry.role,
    logicalPath: entry.logicalPath,
    ...(entry.contentPath ? { contentPath: entry.contentPath } : {}),
    digest: { ...entry.digest },
    sizeBytes: entry.sizeBytes,
    availability: entry.availability,
    ...(entry.derivative ? { derivative: { ...entry.derivative } } : {})
  };
}

async function writeSourceEntry(root: string, entry: SourceEntry): Promise<void> {
  const targetPath = entry.contentPath ?? entry.logicalPath;
  if (!safeRelativePath(targetPath) || !withinRoot(root, join(root, ...targetPath.split("/")))) {
    throw new PreservationError("preservation.path_unsafe");
  }
  const absolutePath = join(root, ...targetPath.split("/"));
  await mkdir(dirname(absolutePath), { recursive: true });
  if (entry.source.kind === "generated") {
    await writeFile(absolutePath, entry.source.bytes, { flag: "wx" });
    return;
  }
  let writtenBytes = 0;
  const hash = createHash("sha256");
  const verifier = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      writtenBytes += chunk.byteLength;
      hash.update(chunk);
      callback(null, chunk);
    },
    flush(callback) {
      const digest = hash.digest("hex");
      callback(
        writtenBytes === entry.sizeBytes && digest === entry.digest.value
          ? undefined
          : new PreservationError("preservation.digest_mismatch", [
              { code: "preservation.digest_mismatch", role: entry.role }
            ])
      );
    }
  });
  const stream = Readable.from(
    entry.source.bytes.stream() as unknown as AsyncIterable<Uint8Array>
  );
  await pipeline(stream, verifier, createWriteStream(absolutePath, { flags: "wx" }));
}

async function writeSafeFile(root: string, path: string, bytes: Uint8Array): Promise<void> {
  if (!safeRelativePath(path) || !withinRoot(root, join(root, ...path.split("/")))) {
    throw new PreservationError("preservation.path_unsafe");
  }
  const absolutePath = join(root, ...path.split("/"));
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes, { flag: "wx" });
}

async function validateRelationshipFile(
  path: string,
  profile: PreservationProfile,
  digestByLogicalPath: ReadonlyMap<string, string>,
  issues: PreservationIssue[]
): Promise<void> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!isRelationshipSidecar(parsed) || parsed.profile !== profile) {
      addIssue(issues, "preservation.relationship_invalid");
      return;
    }
    const { integrity: _integrity, ...body } = parsed;
    if (sha256Text(canonicalizeProvenanceJson(body)) !== parsed.integrity.value) {
      addIssue(issues, "preservation.relationship_invalid");
    }
    if (digestByLogicalPath.get(parsed.original.logicalPath) !== parsed.original.digest.value) {
      addIssue(issues, "preservation.relationship_invalid");
    }
    for (const derivative of parsed.derivatives) {
      if (
        derivative.sourceManifestId !== parsed.manifestId ||
        digestByLogicalPath.get(derivative.logicalPath) !== derivative.digest.value
      ) {
        addIssue(issues, "preservation.relationship_invalid");
      }
    }
    if (!digestByLogicalPath.has(parsed.metadata.manifestPath)) {
      addIssue(issues, "preservation.relationship_invalid");
    }
    if (
      parsed.metadata.provenancePath &&
      !digestByLogicalPath.has(parsed.metadata.provenancePath)
    ) {
      addIssue(issues, "preservation.relationship_invalid");
    }
    const derivativePrefix = profile === "bagit-1.0-sha256"
      ? "data/derivatives/"
      : "derivatives/";
    const declaredDerivativePaths = parsed.derivatives.map((item) => item.logicalPath).sort();
    const actualDerivativePaths = [...digestByLogicalPath.keys()]
      .filter((logicalPath) => logicalPath.startsWith(derivativePrefix))
      .sort();
    if (!sameStrings(declaredDerivativePaths, actualDerivativePaths)) {
      addIssue(issues, "preservation.relationship_invalid");
    }
  } catch {
    addIssue(issues, "preservation.relationship_invalid");
  }
}

function isRelationshipSidecar(value: unknown): value is PreservationRelationshipSidecarV1 {
  if (!isRecord(value) || value.schemaVersion !== PRESERVATION_RELATIONSHIP_SCHEMA_VERSION) return false;
  if (value.profile !== "bagit-1.0-sha256" && value.profile !== "ocfl-1.1-sha256") return false;
  if (!SAFE_ID.test(String(value.manifestId))) return false;
  if (!isRecord(value.original) || !isDigest(value.original.digest) || !safeRelativePath(String(value.original.logicalPath))) return false;
  if (!Array.isArray(value.derivatives) || !isRecord(value.metadata) || !isRecord(value.integrity)) return false;
  if (
    value.integrity.algorithm !== "sha256" ||
    value.integrity.canonicalization !== "rfc8785-jcs" ||
    !SHA256.test(String(value.integrity.value))
  ) return false;
  if (!safeRelativePath(String(value.metadata.manifestPath))) return false;
  if (value.metadata.provenancePath !== undefined && !safeRelativePath(String(value.metadata.provenancePath))) return false;
  return value.derivatives.every((item) =>
    isRecord(item) &&
    typeof item.id === "string" &&
    typeof item.kind === "string" &&
    item.sourceManifestId === value.manifestId &&
    safeRelativePath(String(item.logicalPath)) &&
    isDigest(item.digest)
  );
}

function isDigest(value: unknown): value is PreservationDigest {
  return isRecord(value) && value.algorithm === "sha256" && SHA256.test(String(value.value));
}

function isOcflInventory(value: unknown): value is OcflInventory {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" ||
    value.type !== OCFL_INVENTORY_TYPE ||
    value.digestAlgorithm !== "sha256" ||
    value.head !== "v1" ||
    !isRecord(value.manifest) ||
    !isRecord(value.versions) ||
    !isRecord(value.versions.v1) ||
    typeof value.versions.v1.created !== "string" ||
    !Number.isFinite(Date.parse(value.versions.v1.created)) ||
    !isRecord(value.versions.v1.state)
  ) return false;
  return recordOfStringArrays(value.manifest) && recordOfStringArrays(value.versions.v1.state);
}

function recordOfStringArrays(value: Record<string, unknown>): value is Record<string, string[]> {
  return Object.values(value).every((item) => Array.isArray(item) && item.every((part) => typeof part === "string"));
}

async function validateInventorySidecar(
  path: string,
  expectedDigest: string,
  issues: PreservationIssue[]
): Promise<void> {
  try {
    if (await readFile(path, "utf8") !== `${expectedDigest}  inventory.json\n`) {
      addIssue(issues, "preservation.inventory_digest_invalid");
    }
  } catch {
    addIssue(issues, "preservation.inventory_digest_invalid");
  }
}

function parseDigestManifest(
  value: string,
  requiredPrefix?: string
): { ok: boolean; entries: Map<string, string> } {
  const entries = new Map<string, string>();
  let ok = value.endsWith("\n");
  const lines = value.split("\n").filter(Boolean);
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) {
      ok = false;
      continue;
    }
    const digest = match[1]!;
    const path = match[2]!;
    if (!safeRelativePath(path, requiredPrefix) || entries.has(path)) ok = false;
    entries.set(path, digest);
  }
  return { ok, entries };
}

async function listFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new PreservationError("preservation.path_unsafe");
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) output.push(path);
      else throw new PreservationError("preservation.path_unsafe");
    }
  };
  await visit(root);
  return output;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeRelativePath(path: string, requiredPrefix?: string): boolean {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.length > 1024 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(path) ||
    path.normalize("NFC") !== path ||
    (requiredPrefix !== undefined && !path.startsWith(requiredPrefix))
  ) return false;
  const segments = path.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function hasPathPrefixCollision(paths: readonly string[]): boolean {
  const sorted = [...paths].sort();
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current === previous || current.startsWith(`${previous}/`)) return true;
  }
  return false;
}

function withinRoot(root: string, candidate: string): boolean {
  const rootPath = resolve(root);
  const candidatePath = resolve(candidate);
  return candidatePath === rootPath || candidatePath.startsWith(`${rootPath}${sep}`);
}

function validateDestination(value: string | undefined): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.includes("\0")) {
    throw new PreservationError("preservation.path_unsafe");
  }
  return resolve(value);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    return isRecord(error) && error.code === "ENOENT" ? false : Promise.reject(error);
  }
}

function normalizeCreatedAt(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new PreservationError("preservation.manifest_invalid");
  return new Date(value).toISOString();
}

function validationResult(
  profile: PreservationProfile,
  issues: PreservationIssue[],
  contentFileCount: number,
  verifiedContentFileCount: number
): PreservationValidationResult {
  const deduped = dedupeIssues(issues);
  return {
    ok: deduped.length === 0 && contentFileCount === verifiedContentFileCount,
    profile,
    issues: deduped,
    contentFileCount,
    verifiedContentFileCount
  };
}

function addIssue(
  issues: PreservationIssue[],
  code: PreservationIssueCode,
  role?: PreservationEntryRole
): void {
  if (!issues.some((issue) => issue.code === code && issue.role === role)) {
    issues.push({ code, ...(role ? { role } : {}) });
  }
}

function dedupeIssues(issues: readonly PreservationIssue[]): PreservationIssue[] {
  const output: PreservationIssue[] = [];
  for (const issue of issues) addIssue(output, issue.code, issue.role);
  return output;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function sortRecord(value: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function safeErrorMessage(code: PreservationIssueCode): string {
  const messages: Partial<Record<PreservationIssueCode, string>> = {
    "preservation.profile_unsupported": "Preservation profile is unsupported.",
    "preservation.mapping_untrusted": "Preservation mapping is not trusted.",
    "preservation.mapping_blocked": "Preservation mapping is blocked.",
    "preservation.destination_exists": "Preservation destination already exists.",
    "preservation.path_unsafe": "Preservation path is unsafe.",
    "preservation.validation_failed": "Preservation validation failed.",
    "preservation.materialization_failed": "Preservation materialization failed."
  };
  return messages[code] ?? "Preservation operation failed.";
}
