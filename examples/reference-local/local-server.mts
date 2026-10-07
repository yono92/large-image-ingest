
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, open, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface LocalReferenceServerOptions {
  root?: string;
  port?: number;
  host?: string;
  maxBytes?: number;
  chunkResponseDelayMs?: number;
  verifyStoredFile?: (filePath: string, manifest: IngestManifest) => Promise<Pick<VerificationResult, "ok">>;
}
interface LocalUpload {
  uploadId: string;
  manifest: IngestManifest;
  totalBytes: number;
  stagingPath: string;
  targetPath: string;
  chunks: Map<number, { start: number; sizeBytes: number; checksum: string }>;
  receivedBytes: number;
  duplicateBytes: number;
  status: "open" | "completed" | "canceled";
  verification: "pending" | "failed" | "verified";
}

import type { IngestManifest, VerificationResult } from "large-image-ingest/core";

const JSON_BODY_LIMIT = 1024 * 1024;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024 * 1024;

export async function createLocalReferenceServer(options: LocalReferenceServerOptions = {}) {
  const root = path.resolve(options.root ?? path.join(os.tmpdir(), "large-image-ingest-reference-local"));
  const stagingRoot = path.join(root, "staging");
  const targetRoot = path.join(root, "targets");
  const uploads = new Map<string, LocalUpload>();
  const verifyStoredFile = options.verifyStoredFile ?? defaultVerifyStoredFile;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const chunkResponseDelayMs = requireNonNegativeInteger(
    options.chunkResponseDelayMs ?? 0,
    "chunkResponseDelayMs"
  );

  await mkdir(stagingRoot, { recursive: true });
  await mkdir(targetRoot, { recursive: true });

  const server = createServer(async (request, response) => {
    try {
      await routeRequest(request, response);
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      writeJson(response, statusCode, {
        error: statusCode === 500 ? "Local reference target failed." : error instanceof Error ? error.message : "Local reference target failed."
      });
    }
  });

  async function routeRequest(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/api/health") {
      writeJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/uploads") {
      const body = await readJsonBody(request);
      const manifest = requireManifest(body.manifest);
      const totalBytes = requireNonNegativeInteger(body.totalBytes, "totalBytes");
      if (totalBytes !== manifest.original.sizeBytes) {
        throw new HttpError(400, "Declared bytes do not match the manifest.");
      }
      if (totalBytes > maxBytes) {
        throw new HttpError(413, "Declared source exceeds the local example limit.");
      }

      const uploadId = randomUUID();
      const stagingPath = path.join(stagingRoot, `${uploadId}.bin`);
      const targetPath = path.join(targetRoot, `${uploadId}.bin`);
      const handle = await open(stagingPath, "w");
      try {
        await handle.truncate(totalBytes);
      } finally {
        await handle.close();
      }

      uploads.set(uploadId, {
        uploadId,
        manifest,
        totalBytes,
        stagingPath,
        targetPath,
        chunks: new Map(),
        receivedBytes: 0,
        duplicateBytes: 0,
        status: "open",
        verification: "pending"
      });
      writeJson(response, 201, { uploadId });
      return;
    }

    const chunkMatch = /^\/api\/uploads\/([^/]+)\/chunks\/(\d+)$/.exec(url.pathname);
    if (request.method === "PUT" && chunkMatch) {
      const upload = requireUpload(chunkMatch[1]);
      requireOpen(upload);
      const chunkIndex = requireNonNegativeInteger(Number(chunkMatch[2]), "chunkIndex");
      const start = requireNonNegativeInteger(Number(request.headers["x-chunk-start"]), "x-chunk-start");
      const size = requirePositiveInteger(Number(request.headers["x-chunk-size"]), "x-chunk-size");
      if (start + size > upload.totalBytes) {
        throw new HttpError(400, "Chunk range exceeds declared source bytes.");
      }

      const previous = upload.chunks.get(chunkIndex);
      if (previous && (previous.start !== start || previous.sizeBytes !== size)) {
        throw new HttpError(409, "Chunk index conflicts with an acknowledged range.");
      }

      if (previous) {
        await discardRequestBody(request, size);
        response.setHeader("etag", previous.checksum);
        writeJson(response, 200, { chunkIndex, sizeBytes: previous.sizeBytes });
        return;
      }

      const { bytesWritten, checksum } = await writeRequestRange(
        request,
        upload.stagingPath,
        start,
        size
      );
      upload.receivedBytes += bytesWritten;
      if (previous) {
        upload.duplicateBytes += bytesWritten;
      }
      upload.chunks.set(chunkIndex, { start, sizeBytes: bytesWritten, checksum });

      if (chunkResponseDelayMs > 0) {
        await delay(chunkResponseDelayMs);
      }
      response.setHeader("etag", checksum);
      writeJson(response, 200, { chunkIndex, sizeBytes: bytesWritten });
      return;
    }

    const completeMatch = /^\/api\/uploads\/([^/]+)\/complete$/.exec(url.pathname);
    if (request.method === "POST" && completeMatch) {
      const upload = requireUpload(completeMatch[1]);
      requireOpen(upload);
      if (!hasExactCoverage(upload)) {
        throw new HttpError(409, "Upload is incomplete.");
      }

      const verification = await verifyStoredFile(upload.stagingPath, upload.manifest);
      if (!verification.ok) {
        upload.verification = "failed";
        throw new HttpError(422, "Stored-file verification failed.");
      }

      await rename(upload.stagingPath, upload.targetPath);
      upload.status = "completed";
      upload.verification = "verified";
      writeJson(response, 200, { completed: true, verification: "verified" });
      return;
    }

    const uploadMatch = /^\/api\/uploads\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && uploadMatch) {
      writeJson(response, 200, toSafeStatus(requireUpload(uploadMatch[1])));
      return;
    }

    if (request.method === "DELETE" && uploadMatch) {
      const upload = requireUpload(uploadMatch[1]);
      if (upload.status === "completed") {
        throw new HttpError(409, "Completed uploads cannot be canceled.");
      }
      if (upload.status !== "canceled") {
        await rm(upload.stagingPath, { force: true });
        upload.status = "canceled";
      }
      response.statusCode = 204;
      response.end();
      return;
    }

    throw new HttpError(404, "Not found.");
  }

  function requireUpload(uploadId?: string) {
    const upload = uploadId === undefined ? undefined : uploads.get(uploadId);
    if (!upload) {
      throw new HttpError(404, "Upload session was not found.");
    }
    return upload;
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Local reference target did not expose a TCP address.");
  }
  const baseUrl = `http://${options.host ?? "127.0.0.1"}:${address.port}/api`;

  return {
    baseUrl,
    root,
    listUploads() {
      return Array.from(uploads.values(), toSafeStatus);
    },
    resolveStoredPath(manifestId: string) {
      const upload = Array.from(uploads.values()).find(value => value.manifest.id === manifestId);
      if (!upload || upload.status !== "completed") throw new Error("Stored original is unavailable.");
      return upload.targetPath;
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  };
}

class HttpError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function requireOpen(upload: LocalUpload) {
  if (upload.status !== "open") {
    throw new HttpError(409, "Upload session is already terminal.");
  }
}

function requireManifest(value: unknown): IngestManifest {
  if (
    !value ||
    typeof value !== "object" ||
    !("schemaVersion" in value) || value.schemaVersion !== "large-image-ingest.manifest.v1" ||
    !("original" in value) || !value.original || typeof value.original !== "object" || !("sizeBytes" in value.original) || typeof value.original.sizeBytes !== "number" ||
    !Number.isSafeInteger(value.original.sizeBytes) ||
    value.original.sizeBytes < 0
  ) {
    throw new HttpError(400, "Manifest is invalid.");
  }
  // Full manifest structure is checked by the SDK before stored-file verification.
  return value as IngestManifest;
}

function requireNonNegativeInteger(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new HttpError(400, `${name} must be a non-negative safe integer.`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new HttpError(400, `${name} must be a positive safe integer.`);
  }
  return value;
}

async function writeRequestRange(request: IncomingMessage, filePath: string, start: number, expectedSize: number) {
  const { createHash } = await import("node:crypto");
  const digest = createHash("sha256");
  const handle = await open(filePath, "r+");
  let received = 0;
  try {
    for await (const value of request) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      if (received + chunk.byteLength > expectedSize) {
        throw new HttpError(400, "Chunk body exceeds declared size.");
      }
      await handle.write(chunk, 0, chunk.byteLength, start + received);
      digest.update(chunk);
      received += chunk.byteLength;
    }
    if (received !== expectedSize) {
      throw new HttpError(400, "Chunk body does not match declared size.");
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
  return { bytesWritten: received, checksum: digest.digest("hex") };
}

async function discardRequestBody(request: IncomingMessage, expectedSize: number) {
  let received = 0;
  for await (const value of request) {
    received += Buffer.byteLength(value);
    if (received > expectedSize) {
      throw new HttpError(400, "Chunk body exceeds declared size.");
    }
  }
  if (received !== expectedSize) {
    throw new HttpError(400, "Chunk body does not match declared size.");
  }
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function hasExactCoverage(upload: LocalUpload) {
  const chunks = Array.from(upload.chunks.values()).sort((left, right) => left.start - right.start);
  let offset = 0;
  for (const chunk of chunks) {
    if (chunk.start !== offset) {
      return false;
    }
    offset += chunk.sizeBytes;
  }
  return offset === upload.totalBytes;
}

function toSafeStatus(upload: LocalUpload) {
  const acknowledgedChunks = Array.from(upload.chunks.keys()).sort((left, right) => left - right);
  const acknowledgedBytes = Array.from(upload.chunks.values())
    .reduce((total, chunk) => total + chunk.sizeBytes, 0);
  return {
    uploadId: upload.uploadId,
    status: upload.status,
    totalBytes: upload.totalBytes,
    acknowledgedChunks,
    acknowledgedBytes,
    receivedBytes: upload.receivedBytes,
    duplicateBytes: upload.duplicateBytes,
    verification: upload.verification
  };
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks = [];
  let total = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.byteLength;
    if (total > JSON_BODY_LIMIT) {
      throw new HttpError(413, "JSON body exceeds the local example limit.");
    }
    chunks.push(chunk);
  }
  if (total === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks, total).toString("utf8"));
  } catch {
    throw new HttpError(400, "JSON body is invalid.");
  }
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown) {
  const json = JSON.stringify(body);
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.setHeader("content-length", Buffer.byteLength(json));
  response.end(json);
}

async function defaultVerifyStoredFile(filePath: string, manifest: IngestManifest) {
  const { verifyNodeFileManifest } = await import("large-image-ingest/node");
  return verifyNodeFileManifest(filePath, manifest, { checksum: "required" });
}

async function main() {
  const port = Number(process.env.LII_REFERENCE_PORT ?? process.env.LII_UPPY_EXAMPLE_PORT ?? 4174);
  const root = process.env.LII_REFERENCE_ROOT ?? process.env.LII_UPPY_EXAMPLE_ROOT;
  const chunkResponseDelayMs = Number(
    process.env.LII_REFERENCE_CHUNK_DELAY_MS ?? process.env.LII_UPPY_EXAMPLE_CHUNK_DELAY_MS ?? 600
  );
  const local = await createLocalReferenceServer({ port, ...(root === undefined ? {} : { root }), chunkResponseDelayMs });
  process.stdout.write(`Local reference target: ${local.baseUrl}\n`);
  process.stdout.write(`Temporary artifact root: ${local.root}\n`);
  process.stdout.write(`Demonstration chunk response delay: ${chunkResponseDelayMs} ms\n`);

  const shutdown = async () => {
    await local.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error instanceof Error ? error.message : "Local reference target failed." : "Local server failed."}\n`);
    process.exitCode = 1;
  });
}
