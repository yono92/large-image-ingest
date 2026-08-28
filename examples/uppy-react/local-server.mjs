#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, open, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const JSON_BODY_LIMIT = 1024 * 1024;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024 * 1024;

export async function createLocalReferenceServer(options = {}) {
  const root = path.resolve(options.root ?? path.join(os.tmpdir(), "large-image-ingest-uppy-reference"));
  const stagingRoot = path.join(root, "staging");
  const targetRoot = path.join(root, "targets");
  const uploads = new Map();
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
        error: statusCode === 500 ? "Local reference target failed." : error.message
      });
    }
  });

  async function routeRequest(request, response) {
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

  function requireUpload(uploadId) {
    const upload = uploads.get(uploadId);
    if (!upload) {
      throw new HttpError(404, "Upload session was not found.");
    }
    return upload;
  }

  await new Promise((resolve, reject) => {
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
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  };
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function requireOpen(upload) {
  if (upload.status !== "open") {
    throw new HttpError(409, "Upload session is already terminal.");
  }
}

function requireManifest(value) {
  if (
    !value ||
    typeof value !== "object" ||
    value.schemaVersion !== "large-image-ingest.manifest.v1" ||
    !value.original ||
    !Number.isSafeInteger(value.original.sizeBytes) ||
    value.original.sizeBytes < 0
  ) {
    throw new HttpError(400, "Manifest is invalid.");
  }
  return value;
}

function requireNonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new HttpError(400, `${name} must be a non-negative safe integer.`);
  }
  return value;
}

function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new HttpError(400, `${name} must be a positive safe integer.`);
  }
  return value;
}

async function writeRequestRange(request, filePath, start, expectedSize) {
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

async function discardRequestBody(request, expectedSize) {
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

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function hasExactCoverage(upload) {
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

function toSafeStatus(upload) {
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

async function readJsonBody(request) {
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

function writeJson(response, statusCode, body) {
  const json = JSON.stringify(body);
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.setHeader("content-length", Buffer.byteLength(json));
  response.end(json);
}

async function defaultVerifyStoredFile(filePath, manifest) {
  const modulePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist/esm/node.js");
  const { verifyNodeFileManifest } = await import(pathToFileURL(modulePath).href);
  return verifyNodeFileManifest(filePath, manifest, { checksum: "required" });
}

async function main() {
  const port = Number(process.env.LII_UPPY_EXAMPLE_PORT ?? 4174);
  const root = process.env.LII_UPPY_EXAMPLE_ROOT;
  const chunkResponseDelayMs = Number(process.env.LII_UPPY_EXAMPLE_CHUNK_DELAY_MS ?? 600);
  const local = await createLocalReferenceServer({ port, root, chunkResponseDelayMs });
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
    process.stderr.write(`${error instanceof Error ? error.message : "Local server failed."}\n`);
    process.exitCode = 1;
  });
}
