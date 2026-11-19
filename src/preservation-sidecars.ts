// Part of preservation.ts, split out to keep modules under 500 lines; public exports stay on preservation.ts.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile
} from "node:fs/promises";
import {
  dirname,
  join,
  resolve,
  sep
} from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { canonicalizeProvenanceJson } from "./provenance.js";
import { PRESERVATION_RELATIONSHIP_SCHEMA_VERSION, PreservationError } from "./preservation.js";
import type { PreservationDigest, PreservationEntryRole, PreservationIssue, PreservationIssueCode, PreservationProfile, PreservationRelationshipSidecarV1, PreservationValidationResult } from "./preservation.js";
import { OCFL_INVENTORY_TYPE, SAFE_ID, SHA256 } from "./preservation-shared.js";
import type { OcflInventory, SourceEntry } from "./preservation-shared.js";

export async function writeSourceEntry(root: string, entry: SourceEntry): Promise<void> {
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

export async function writeSafeFile(root: string, path: string, bytes: Uint8Array): Promise<void> {
  if (!safeRelativePath(path) || !withinRoot(root, join(root, ...path.split("/")))) {
    throw new PreservationError("preservation.path_unsafe");
  }
  const absolutePath = join(root, ...path.split("/"));
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes, { flag: "wx" });
}

export async function validateRelationshipFile(
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

export function isOcflInventory(value: unknown): value is OcflInventory {
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

export async function validateInventorySidecar(
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

export function parseDigestManifest(
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

export async function listFiles(root: string): Promise<string[]> {
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

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function safeRelativePath(path: string, requiredPrefix?: string): boolean {
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

export function hasPathPrefixCollision(paths: readonly string[]): boolean {
  const sorted = [...paths].sort();
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current === previous || current.startsWith(`${previous}/`)) return true;
  }
  return false;
}

export function withinRoot(root: string, candidate: string): boolean {
  const rootPath = resolve(root);
  const candidatePath = resolve(candidate);
  return candidatePath === rootPath || candidatePath.startsWith(`${rootPath}${sep}`);
}

export function validateDestination(value: string | undefined): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.includes("\0")) {
    throw new PreservationError("preservation.path_unsafe");
  }
  return resolve(value);
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    return isRecord(error) && error.code === "ENOENT" ? false : Promise.reject(error);
  }
}

export function normalizeCreatedAt(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new PreservationError("preservation.manifest_invalid");
  return new Date(value).toISOString();
}

export function validationResult(
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

export function addIssue(
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

export function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function toPosix(path: string): string {
  return path.split(sep).join("/");
}

export function sortRecord(value: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function safeErrorMessage(code: PreservationIssueCode): string {
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
