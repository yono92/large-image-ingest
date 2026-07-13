const { createHash, randomUUID } = require("node:crypto");
const { createServer } = require("node:http");
const { mkdir, open, rename, rm } = require("node:fs/promises");
const path = require("node:path");

const JSON_BODY_LIMIT = 1024 * 1024;

async function createReferenceServer(options) {
  const root = path.resolve(options.root);
  const stagingRoot = path.join(root, "staging");
  const targetRoot = path.join(root, "targets");
  const uploads = new Map();

  await mkdir(stagingRoot, { recursive: true });
  await mkdir(targetRoot, { recursive: true });

  const server = createServer(async (request, response) => {
    try {
      await routeRequest(request, response);
    } catch (error) {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : "reference target failed"
      });
    }
  });

  async function routeRequest(request, response) {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "POST" && url.pathname === "/uploads") {
      const body = await readJsonBody(request);
      const totalBytes = requireNonNegativeInteger(body.totalBytes, "totalBytes");
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
        manifest: body.manifest,
        totalBytes,
        stagingPath,
        targetPath,
        chunks: new Map(),
        receivedBytes: 0,
        duplicateBytes: 0,
        completeCalls: 0,
        completed: false,
        integrityVerified: false
      });

      writeJson(response, 201, { uploadId });
      return;
    }

    const chunkMatch = /^\/uploads\/([^/]+)\/chunks\/(\d+)$/.exec(url.pathname);
    if (request.method === "PUT" && chunkMatch) {
      const upload = requireUpload(chunkMatch[1]);
      const chunkIndex = Number(chunkMatch[2]);
      const start = requireNonNegativeInteger(
        Number(request.headers["x-chunk-start"]),
        "x-chunk-start"
      );
      const expectedSize = requirePositiveInteger(
        Number(request.headers["x-chunk-size"]),
        "x-chunk-size"
      );

      if (start + expectedSize > upload.totalBytes) {
        throw new RangeError("Chunk range exceeds the declared upload size.");
      }

      const digest = createHash("sha256");
      const handle = await open(upload.stagingPath, "r+");
      let received = 0;
      try {
        for await (const value of request) {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
          if (received + chunk.byteLength > expectedSize) {
            throw new RangeError("Chunk body exceeds the declared chunk size.");
          }
          await handle.write(chunk, 0, chunk.byteLength, start + received);
          digest.update(chunk);
          received += chunk.byteLength;
        }
        await handle.sync();
      } finally {
        await handle.close();
      }

      if (received !== expectedSize) {
        throw new RangeError("Chunk body does not match the declared chunk size.");
      }

      const previous = upload.chunks.get(chunkIndex);
      upload.receivedBytes += received;
      if (previous) {
        upload.duplicateBytes += received;
      }

      const etag = digest.digest("hex");
      upload.chunks.set(chunkIndex, { start, sizeBytes: received, etag });
      response.setHeader("etag", etag);
      writeJson(response, 200, { chunkIndex, sizeBytes: received });
      return;
    }

    const completeMatch = /^\/uploads\/([^/]+)\/complete$/.exec(url.pathname);
    if (request.method === "POST" && completeMatch) {
      const upload = requireUpload(completeMatch[1]);
      upload.completeCalls += 1;
      const coveredBytes = [...upload.chunks.values()].reduce(
        (total, chunk) => total + chunk.sizeBytes,
        0
      );
      if (coveredBytes !== upload.totalBytes) {
        writeJson(response, 409, { error: "upload is incomplete" });
        return;
      }

      const verification = await options.verifyStoredFile(
        upload.stagingPath,
        upload.manifest
      );
      if (!verification.ok) {
        writeJson(response, 422, { error: "stored-file verification failed" });
        return;
      }

      await rename(upload.stagingPath, upload.targetPath);
      upload.completed = true;
      upload.integrityVerified = true;
      writeJson(response, 200, { completed: true });
      return;
    }

    const uploadMatch = /^\/uploads\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && uploadMatch) {
      const upload = requireUpload(uploadMatch[1]);
      writeJson(response, 200, toPublicState(upload));
      return;
    }

    writeJson(response, 404, { error: "not found" });
  }

  function requireUpload(uploadId) {
    const upload = uploads.get(uploadId);
    if (!upload) {
      const error = new Error("upload session was not found");
      error.code = "UPLOAD_NOT_FOUND";
      throw error;
    }
    return upload;
  }

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Reference target did not expose a TCP address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    getUpload(uploadId) {
      const upload = requireUpload(uploadId);
      return {
        ...toPublicState(upload),
        targetPath: upload.targetPath
      };
    },
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    },
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    }
  };
}

function toPublicState(upload) {
  return {
    uploadId: upload.uploadId,
    totalBytes: upload.totalBytes,
    acknowledgedChunks: [...upload.chunks.keys()].sort((left, right) => left - right),
    receivedBytes: upload.receivedBytes,
    duplicateBytes: upload.duplicateBytes,
    completeCalls: upload.completeCalls,
    completed: upload.completed,
    integrityVerified: upload.integrityVerified
  };
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.byteLength;
    if (total > JSON_BODY_LIMIT) {
      throw new RangeError("JSON request body exceeded the reference limit.");
    }
    chunks.push(chunk);
  }

  if (total === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks, total).toString("utf8"));
}

function requireNonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
  return value;
}

function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
  return value;
}

function writeJson(response, statusCode, body) {
  const json = JSON.stringify(body);
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.setHeader("content-length", Buffer.byteLength(json));
  response.end(json);
}

module.exports = {
  createReferenceServer
};
