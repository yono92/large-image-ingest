// Part of preservation.ts, split out to keep modules under 500 lines; public exports stay on preservation.ts.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename } from "node:fs/promises";
import {
  basename,
  dirname,
  join,
  relative
} from "node:path";
import { calculateChecksum } from "./checksum.js";
import { canonicalizeProvenanceJson } from "./provenance.js";
import type { IngestFileLike, IngestManifest } from "./types.js";
import { PRESERVATION_MAPPING_SCHEMA_VERSION, PreservationError } from "./preservation.js";
import type { PreservationDigestPolicy, PreservationEntryRole, PreservationExportOptions, PreservationExportResult, PreservationIssue, PreservationMapping, PreservationMappingEntry, PreservationProfile, PreservationValidationResult } from "./preservation.js";
import { addIssue, hasPathPrefixCollision, isOcflInventory, listFiles, parseDigestManifest, pathExists, safeRelativePath, sameStrings, sha256Bytes, sha256File, sha256Text, sortRecord, toPosix, validateDestination, validateInventorySidecar, validateRelationshipFile, validationResult, withinRoot, writeSafeFile, writeSourceEntry } from "./preservation-sidecars.js";
import { BAGIT_DECLARATION, OCFL_DECLARATION, OCFL_INVENTORY_TYPE, SAFE_ID, SHA256, executionPlans } from "./preservation-shared.js";
import type { ExecutionPlan, MutableMappingState, OcflInventory, SourceEntry } from "./preservation-shared.js";

/** @experimental */
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

/** @experimental */
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

export async function materialize(
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

export async function writeBagIt(root: string, _mapping: PreservationMapping, plan: ExecutionPlan): Promise<void> {
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

export async function writeOcflObject(root: string, mapping: PreservationMapping, plan: ExecutionPlan): Promise<void> {
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

export async function verifyBlobEntry(
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

export function validateManifestInput(manifest: IngestManifest, state: MutableMappingState): void {
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

export function generatedJsonBytes(
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

export function generatedEntry(
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

export function standardPath(
  profile: PreservationProfile,
  relativePath: string,
  role: PreservationEntryRole
): string {
  if (profile === "ocfl-1.1-sha256") return relativePath;
  if (role === "original" || role === "derivative") return `data/${relativePath}`;
  return `large-image-ingest/${basename(relativePath)}`;
}

export function validatePlannedPaths(state: MutableMappingState): void {
  const logicalPaths = state.entries.map((entry) => entry.logicalPath);
  if (logicalPaths.some((path) => !safeRelativePath(path)) || hasPathPrefixCollision(logicalPaths)) {
    addIssue(state.blockers, "preservation.path_unsafe");
  }
  const normalized = logicalPaths.map((path) => path.normalize("NFC").toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    addIssue(state.blockers, "preservation.mapping_collision");
  }
}

export function toPublicEntry(entry: SourceEntry): PreservationMappingEntry {
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
