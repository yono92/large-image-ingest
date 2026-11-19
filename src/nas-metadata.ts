// Part of nas.ts, split out to keep modules under 500 lines; public exports stay on nas.ts.
import { createHash, randomUUID } from "node:crypto";
import { type Dirent } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { join, resolve } from "node:path";
import type { NasGatewayChecksum, NasGatewayChunkBody, NasGatewayChunkRecord, NasGatewayError, NasGatewayErrorCode, NasGatewaySessionMetadata, NasGatewaySessionSnapshot } from "./nas.js";
import { metadataPath, resolveTargetPath, resolveWithinRoot, sessionPath } from "./nas-integrity.js";
import { chunksDirectoryName, metadataCandidatePrefix, metadataCandidateSuffix } from "./nas-shared.js";

export async function readSnapshot(
  stagingRoot: string,
  targetRoot: string,
  sessionId: string
): Promise<NasGatewaySessionSnapshot> {
  const stagingPath = sessionPath(stagingRoot, sessionId);
  const metadata = await readMetadata(stagingPath);

  return {
    ...metadata,
    stagingPath,
    targetPath: resolveTargetPath(targetRoot, metadata.targetRelativePath)
  };
}

async function readMetadata(stagingPath: string): Promise<NasGatewaySessionMetadata> {
  const metadata = await readMetadataOrUndefined(stagingPath);

  if (!metadata) {
    throw createNasError("nas.session_not_found", "NAS session metadata was not found.", {
      stagingPath
    });
  }

  return metadata;
}

export async function readMetadataOrUndefined(stagingPath: string): Promise<NasGatewaySessionMetadata | undefined> {
  try {
    const raw = await readFile(metadataPath(stagingPath), "utf8");
    const parsed = JSON.parse(raw) as NasGatewaySessionMetadata;

    if (parsed.schemaVersion !== "large-image-ingest.nas-session.v0.1") {
      return undefined;
    }

    return parsed;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return undefined;
    }

    throw error;
  }
}

export async function writeMetadata(
  stagingPath: string,
  metadata: NasGatewaySessionMetadata
): Promise<void> {
  await mkdir(stagingPath, { recursive: true });
  const candidatePath = join(
    stagingPath,
    `${metadataCandidatePrefix}${randomUUID()}${metadataCandidateSuffix}`
  );

  try {
    await writeFile(candidatePath, `${JSON.stringify(metadata, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx"
    });
    await rename(candidatePath, metadataPath(stagingPath));
  } finally {
    await rm(candidatePath, { force: true }).catch(() => {});
  }
}

export async function cleanupMetadataCandidates(stagingPath: string): Promise<void> {
  let entries: Dirent[];

  try {
    entries = await readdir(stagingPath, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return;
    }

    throw error;
  }

  await Promise.all(entries
    .filter((entry) => entry.isFile() && isMetadataCandidateFileName(entry.name))
    .map((entry) => rm(join(stagingPath, entry.name), { force: true })));
}

export async function cleanupUnreferencedChunkArtifacts(
  stagingPath: string,
  chunks: readonly NasGatewayChunkRecord[]
): Promise<void> {
  const chunksPath = join(stagingPath, chunksDirectoryName);
  let entries: Dirent[];

  try {
    entries = await readdir(chunksPath, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return;
    }

    throw error;
  }

  const referencedPaths = new Set(chunks.map((chunk) => resolveWithinRoot(stagingPath, chunk.path)));

  await Promise.all(entries
    .filter((entry) => entry.isFile() && isManagedChunkArtifactFileName(entry.name))
    .map((entry) => join(chunksPath, entry.name))
    .filter((path) => !referencedPaths.has(resolve(path)))
    .map((path) => rm(path, { force: true })));
}

function isMetadataCandidateFileName(fileName: string): boolean {
  return fileName.startsWith(metadataCandidatePrefix) && fileName.endsWith(metadataCandidateSuffix);
}

function isManagedChunkArtifactFileName(fileName: string): boolean {
  return /^\d{8}(?:-[A-Za-z0-9-]+)?\.part(?:\.[A-Za-z0-9-]+)?\.tmp$/.test(fileName) ||
    /^\d{8}(?:-[A-Za-z0-9-]+)?\.part$/.test(fileName);
}

export function toMetadata(
  snapshot: NasGatewaySessionSnapshot,
  update: Partial<NasGatewaySessionMetadata>
): NasGatewaySessionMetadata {
  return {
    schemaVersion: snapshot.schemaVersion,
    sessionId: snapshot.sessionId,
    status: snapshot.status,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    expiresAt: snapshot.expiresAt,
    targetRelativePath: snapshot.targetRelativePath,
    totalBytes: snapshot.totalBytes,
    expectedChunks: snapshot.expectedChunks,
    metadata: snapshot.metadata,
    chunks: snapshot.chunks,
    finalizedAt: snapshot.finalizedAt,
    canceledAt: snapshot.canceledAt,
    ...update
  };
}

export async function toUint8Array(body: NasGatewayChunkBody): Promise<Uint8Array> {
  if (body instanceof Blob) {
    return new Uint8Array(await body.arrayBuffer());
  }

  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body);
  }

  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }

  throw createNasError("nas.invalid_chunk", "Unsupported NAS chunk body type.");
}

export function createSha256(bytes: Uint8Array): NasGatewayChecksum {
  return {
    algorithm: "sha256",
    value: createHash("sha256").update(bytes).digest("hex")
  };
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return false;
    }

    throw error;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function createNasError(
  code: NasGatewayErrorCode,
  message: string,
  details?: Record<string, unknown>
): NasGatewayError {
  const error = new Error(message) as NasGatewayError;
  error.code = code;

  if (details) {
    error.details = details;
  }

  return error;
}

export function isNasGatewayError(error: unknown): error is NasGatewayError {
  return Boolean(error && typeof error === "object" && "code" in error);
}

export function isNodeError(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === code);
}

export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return fallback;
}
