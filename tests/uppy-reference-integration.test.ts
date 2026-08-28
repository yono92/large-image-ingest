import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  UploadPausedError,
  createIngestSession,
  createManifest
} from "../src/core";
import { verifyNodeFileManifest } from "../src/node";
import { MemoryResumeStore } from "./resume-fixtures";
import { createLocalReferenceTransport } from "../examples/reference-local/local-reference-transport";

const require = createRequire(import.meta.url);
const { generateFixture } = require("../scripts/create-uppy-example-fixture.cjs") as {
  generateFixture(outputPath: string, sizeBytes: number): Promise<{
    outputPath: string;
    sizeBytes: number;
    checksum: string;
  }>;
};

const temporaryRoots: string[] = [];
const CHUNK_SIZE = 256 * 1024;

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Uppy reference fixture", () => {
  it("generates repeatable inspection-like bytes at the requested ignored location", async () => {
    const root = await temporaryRoot();
    const firstPath = path.join(root, "first.tiff");
    const secondPath = path.join(root, "second.tiff");

    const first = await generateFixture(firstPath, 1024 * 1024 + 8);
    const second = await generateFixture(secondPath, 1024 * 1024 + 8);

    expect(first.sizeBytes).toBe(1024 * 1024 + 8);
    expect(second.checksum).toBe(first.checksum);
    expect((await stat(firstPath)).size).toBe(first.sizeBytes);
    expect(await readFile(firstPath)).toEqual(await readFile(secondPath));
    expect(first.outputPath).toBe(firstPath);
  });
});

describe("local reference HTTP contract", () => {
  it("streams chunks, completes once, and exposes only safe verified status", async () => {
    const { server, root } = await startServer();
    try {
      const file = createFile("wafer.tiff", CHUNK_SIZE * 3);
      const manifest = await createManifest(file, { chunking: { chunkSize: CHUNK_SIZE } });
      const uploadId = await createRemoteUpload(server.baseUrl, manifest);

      for (let index = 0; index < 3; index += 1) {
        const response = await fetch(`${server.baseUrl}/uploads/${uploadId}/chunks/${index}`, {
          method: "PUT",
          headers: {
            "x-chunk-start": String(index * CHUNK_SIZE),
            "x-chunk-size": String(CHUNK_SIZE)
          },
          body: file.slice(index * CHUNK_SIZE, index * CHUNK_SIZE + CHUNK_SIZE)
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("etag")).toMatch(/^[a-f0-9]{64}$/);
      }

      const complete = await fetch(`${server.baseUrl}/uploads/${uploadId}/complete`, { method: "POST" });
      expect(complete.status).toBe(200);
      await expect(complete.json()).resolves.toEqual({ completed: true, verification: "verified" });

      const statusResponse = await fetch(`${server.baseUrl}/uploads/${uploadId}`);
      const safeStatus = await statusResponse.json() as Record<string, unknown>;
      expect(safeStatus).toEqual({
        uploadId,
        status: "completed",
        totalBytes: CHUNK_SIZE * 3,
        acknowledgedChunks: [0, 1, 2],
        acknowledgedBytes: CHUNK_SIZE * 3,
        receivedBytes: CHUNK_SIZE * 3,
        duplicateBytes: 0,
        verification: "verified"
      });
      expect(safeStatus).not.toHaveProperty("manifest");
      expect(safeStatus).not.toHaveProperty("targetPath");

      const lateMutation = await fetch(`${server.baseUrl}/uploads/${uploadId}/chunks/0`, {
        method: "PUT",
        headers: { "x-chunk-start": "0", "x-chunk-size": String(CHUNK_SIZE) },
        body: file.slice(0, CHUNK_SIZE)
      });
      expect(lateMutation.status).toBe(409);
    } finally {
      await server.close();
      expect(root).toBeTruthy();
    }
  });

  it("rejects invalid ranges and makes cancellation terminal", async () => {
    const { server } = await startServer();
    try {
      const file = createFile("wafer.tiff", CHUNK_SIZE * 2);
      const manifest = await createManifest(file, { chunking: { chunkSize: CHUNK_SIZE } });
      const uploadId = await createRemoteUpload(server.baseUrl, manifest);

      const invalid = await fetch(`${server.baseUrl}/uploads/${uploadId}/chunks/0`, {
        method: "PUT",
        headers: {
          "x-chunk-start": String(CHUNK_SIZE * 2 - 1),
          "x-chunk-size": String(CHUNK_SIZE)
        },
        body: file.slice(0, CHUNK_SIZE)
      });
      expect(invalid.status).toBe(400);

      expect((await fetch(`${server.baseUrl}/uploads/${uploadId}`, { method: "DELETE" })).status).toBe(204);
      expect((await fetch(`${server.baseUrl}/uploads/${uploadId}`, { method: "DELETE" })).status).toBe(204);
      expect((await fetch(`${server.baseUrl}/uploads/${uploadId}/complete`, { method: "POST" })).status).toBe(409);
    } finally {
      await server.close();
    }
  });

  it("returns an existing receipt without accepting a repeated acknowledged range as new bytes", async () => {
    const { server } = await startServer();
    try {
      const file = createFile("wafer.tiff", CHUNK_SIZE * 2);
      const manifest = await createManifest(file, { chunking: { chunkSize: CHUNK_SIZE } });
      const uploadId = await createRemoteUpload(server.baseUrl, manifest);
      const send = () => fetch(`${server.baseUrl}/uploads/${uploadId}/chunks/0`, {
        method: "PUT",
        headers: {
          "x-chunk-start": "0",
          "x-chunk-size": String(CHUNK_SIZE)
        },
        body: file.slice(0, CHUNK_SIZE)
      });

      const first = await send();
      const repeated = await send();
      expect(first.status).toBe(200);
      expect(repeated.status).toBe(200);
      expect(repeated.headers.get("etag")).toBe(first.headers.get("etag"));

      await expect(fetch(`${server.baseUrl}/uploads/${uploadId}`).then((response) => response.json()))
        .resolves.toMatchObject({
          acknowledgedBytes: CHUNK_SIZE,
          receivedBytes: CHUNK_SIZE,
          duplicateBytes: 0
        });
    } finally {
      await server.close();
    }
  });
});

describe("local reference transport", () => {
  it("creates, uploads, verifies, reads safe status, and cancels", async () => {
    const { server } = await startServer();
    try {
      const transport = createLocalReferenceTransport({ baseUrl: server.baseUrl });
      const file = createFile("wafer.tiff", CHUNK_SIZE * 3);
      const manifest = await createIngestSession(file, {
        chunking: { chunkSize: CHUNK_SIZE },
        resume: { store: new MemoryResumeStore(), cleanup: "mark-complete" },
        transport
      }).start();

      expect(manifest.original.sizeBytes).toBe(CHUNK_SIZE * 3);
      const uploads = server.listUploads();
      expect(uploads).toHaveLength(1);
      await expect(transport.readStatus(uploads[0]!.uploadId)).resolves.toMatchObject({
        status: "completed",
        verification: "verified",
        duplicateBytes: 0
      });
    } finally {
      await server.close();
    }
  });

  it("rejects mismatched sources and resumes 10 interrupted sessions without duplicate bytes", async () => {
    const { server } = await startServer();
    try {
      for (let trial = 0; trial < 10; trial += 1) {
        const file = createFile(`wafer-${trial}.tiff`, CHUNK_SIZE * 3, trial);
        const store = new MemoryResumeStore();
        const transport = createLocalReferenceTransport({ baseUrl: server.baseUrl });
        let recordId: string | undefined;
        let paused = false;
        let firstSession: ReturnType<typeof createIngestSession>;

        firstSession = createIngestSession(file, {
          chunking: { chunkSize: CHUNK_SIZE },
          resume: { store, cleanup: "mark-complete" },
          transport,
          onEvent(event) {
            if (event.type === "resume:available") {
              recordId = event.recordId;
            }
            if (event.type === "chunk:completed" && !paused) {
              paused = true;
              firstSession.pause("reference interruption");
            }
          }
        });

        await expect(firstSession.start()).rejects.toBeInstanceOf(UploadPausedError);
        expect(recordId).toBeTruthy();

        const beforeMismatch = server.listUploads().at(-1)!;
        const uploadCount = server.listUploads().length;
        const incompatibleFile = createFile(file.name, file.size + 1, trial);
        await expect(createIngestSession(incompatibleFile, {
          chunking: { chunkSize: CHUNK_SIZE },
          resume: { store, cleanup: "mark-complete" },
          transport: createLocalReferenceTransport({ baseUrl: server.baseUrl })
        }).resume(recordId!)).rejects.toMatchObject({ code: "resume.file_mismatch" });
        expect(server.listUploads()).toHaveLength(uploadCount);
        expect(server.listUploads().at(-1)!.receivedBytes).toBe(beforeMismatch.receivedBytes);

        await createIngestSession(file, {
          chunking: { chunkSize: CHUNK_SIZE },
          resume: { store, cleanup: "mark-complete" },
          transport: createLocalReferenceTransport({ baseUrl: server.baseUrl })
        }).resume(recordId!);

        const upload = server.listUploads().at(-1)!;
        expect(upload.status).toBe("completed");
        expect(upload.verification).toBe("verified");
        expect(upload.duplicateBytes).toBe(0);
      }
    } finally {
      await server.close();
    }
  });
});

async function startServer(): Promise<{
  root: string;
  server: {
    baseUrl: string;
    close(): Promise<void>;
    listUploads(): Array<{
      uploadId: string;
      status: string;
      verification: string;
      duplicateBytes: number;
      receivedBytes: number;
    }>;
  };
}> {
  const root = await temporaryRoot();
  const { createLocalReferenceServer } = await import("../examples/reference-local/local-server.mjs");
  const server = await createLocalReferenceServer({
    root,
    verifyStoredFile: (filePath: string, manifest: Parameters<typeof verifyNodeFileManifest>[1]) =>
      verifyNodeFileManifest(filePath, manifest, { checksum: "required" })
  });
  return { root, server };
}

async function createRemoteUpload(baseUrl: string, manifest: Awaited<ReturnType<typeof createManifest>>): Promise<string> {
  const response = await fetch(`${baseUrl}/uploads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ manifest, totalBytes: manifest.original.sizeBytes })
  });
  expect(response.status).toBe(201);
  const body = await response.json() as { uploadId: string };
  return body.uploadId;
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "large-image-ingest-uppy-"));
  temporaryRoots.push(root);
  return root;
}

function createFile(name: string, size: number, seed = 0): File {
  const bytes = Uint8Array.from({ length: size }, (_, index) => (index * 17 + seed) % 251);
  return new File([bytes], name, {
    type: "image/tiff",
    lastModified: Date.UTC(2026, 7, 28) + seed
  });
}
