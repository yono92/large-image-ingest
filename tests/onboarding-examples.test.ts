import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { File } from "node:buffer";
import { createIngestSession } from "../src/core.js";
import { afterEach, expect, test } from "vitest";

const roots: string[] = [];
async function root() {
  const value = await mkdtemp(path.join(os.tmpdir(), "lii-onboarding-test-"));
  roots.push(value);
  return value;
}
afterEach(async () => { await Promise.all(roots.splice(0).map(value => rm(value, { recursive: true, force: true }))); });

test("minimal upload verifies the stored original through real HTTP", async () => {
  const { runMinimalUpload } = await import("../examples/onboarding/minimal-upload.mts");
  const result = await runMinimalUpload({ root: await root() });
  expect(result.status).toBe("completed");
  expect(result.storedVerified).toBe(true);
});

test("minimal upload preserves a supplied file with a spaced path", async () => {
  const { runMinimalUpload } = await import("../examples/onboarding/minimal-upload.mts");
  const directory = await root();
  const file = path.join(directory, "private inspection image.tiff");
  const original = Buffer.alloc(600 * 1024, 123);
  await writeFile(file, original);
  const result = await runMinimalUpload({ file, root: path.join(directory, "output") });
  expect(result.storedVerified).toBe(true);
  expect(await readFile(result.storedPath)).toEqual(original);
  expect(await readFile(file)).toEqual(original);
});

test("file-backed source uses slices and rejects a changed original", async () => {
  const { openLocalSource } = await import("../examples/onboarding/source.mts");
  const directory = await root();
  const file = path.join(directory, "source.tiff");
  await writeFile(file, Buffer.alloc(2 * 1024 * 1024, 42));
  const source = await openLocalSource(file);
  // A file-backed slice reads only this range; opening does not construct a full buffer.
  expect(source.file.size).toBe(2 * 1024 * 1024);
  expect(source.file.type).toBe("image/tiff");
  expect(new Uint8Array(await source.file.slice(123, 127).arrayBuffer())).toEqual(new Uint8Array([42, 42, 42, 42]));
  await source.assertUnchanged();
  await writeFile(file, Buffer.alloc(2 * 1024 * 1024, 43));
  await expect(source.assertUnchanged()).rejects.toMatchObject({ code: "input.changed" });
  await expect(source.file.slice(0, 4).arrayBuffer()).rejects.toThrow();
});

test("minimal source validation rejects missing, empty and directory inputs before storage", async () => {
  const { runMinimalUpload } = await import("../examples/onboarding/minimal-upload.mts");
  const directory = await root();
  const empty = path.join(directory, "empty.tiff");
  await writeFile(empty, "");
  for (const [file, code] of [[path.join(directory, "missing.tiff"), "input.not_found"],
    [empty, "input.empty"], [directory, "input.not_regular"]]) {
    const output = path.join(directory, "not-created");
    await expect(runMinimalUpload({ file, root: output })).rejects.toMatchObject({ code });
    await expect(readFile(path.join(output, "anything"))).rejects.toMatchObject({ code: "ENOENT" });
  }
});

test("the reference HTTP target rejects corrupted original bytes", async () => {
  const { createLocalReferenceServer } = await import("../examples/reference-local/local-server.mts");
  const { createFixture } = await import("../examples/onboarding/fixture.mts");
  const { createReferenceTransport } = await import("../examples/onboarding/transport.mts");
  const server = await createLocalReferenceServer({ root: await root() });
  try {
    const transport = createReferenceTransport(server.baseUrl);
    const corrupt = { ...transport, async uploadChunk(input: any) {
      const bytes = new Uint8Array(await input.body.arrayBuffer());
      bytes[bytes.length - 1] ^= 1;
      return transport.uploadChunk({ ...input, body: new Blob([bytes]) });
    } };
    const session = createIngestSession(createFixture(), { transport: corrupt });
    await expect(session.start()).rejects.toMatchObject({ code: "verification.failed" });
    expect(server.listUploads()[0]).toMatchObject({ status: "open", verification: "failed" });
  } finally { await server.close(); }
});

test("file-backed recovery rejects metadata-equal changed bytes before remote resume", async () => {
  const { createLocalReferenceServer } = await import("../examples/reference-local/local-server.mts");
  const { createFixture } = await import("../examples/onboarding/fixture.mts");
  const { createReferenceTransport } = await import("../examples/onboarding/transport.mts");
  const { createFileStores } = await import("../examples/onboarding/file-stores.mts");
  const directory = await root();
  const server = await createLocalReferenceServer({ root: directory });
  try {
    const file = createFixture();
    const stores = await createFileStores(path.join(directory, "records"));
    const options = { transport: createReferenceTransport(server.baseUrl),
      chunking: { chunkSize: 256 * 1024 }, resume: { store: stores.resume } };
    const first = createIngestSession(file, { ...options,
      onEvent(event) { if (event.type === "chunk:completed") first.pause(); } });
    await expect(first.start()).rejects.toThrow("Upload paused.");
    const [record] = await stores.resume.list();
    expect(record.progress.uploadedBytes).toBe(256 * 1024);
    const bytes = new Uint8Array(await file.arrayBuffer());
    bytes[bytes.length - 1] ^= 1;
    const changed = new File([bytes], file.name, { type: file.type, lastModified: file.lastModified });
    const reloaded = await createFileStores(path.join(directory, "records"));
    const second = createIngestSession(changed, { ...options, resume: { store: reloaded.resume } });
    await expect(second.resume(record.id)).rejects.toMatchObject({ code: "resume.file_mismatch" });
    expect(server.listUploads()).toHaveLength(1);
    expect(server.listUploads()[0].receivedBytes).toBe(256 * 1024);
  } finally { await server.close(); }
});

test("verified workflow persists readable evidence through reconstructed adapters", async () => {
  const { runVerifiedWorkflow } = await import("../examples/onboarding/verified-workflow.mts");
  const directory = await root();
  const result = await runVerifiedWorkflow({ root: directory, exerciseRecovery: true });
  expect(result.status).toBe("evidence_persisted");
  expect(result.recovered).toBe(true);
  expect(result.storedVerified).toBe(true);
  expect(result.evidenceReloaded).toBe(true);
});

test("example storage serializes stale CAS and protects immutable evidence revisions", async () => {
  const { createFileStores } = await import("../examples/onboarding/file-stores.mts");
  const { runVerifiedWorkflow } = await import("../examples/onboarding/verified-workflow.mts");
  const directory = await root();
  const result = await runVerifiedWorkflow({ root: directory });
  const stores = await createFileStores(path.join(directory, "records"));
  const checkpoint = await stores.checkpoint.get(result.workflowId);
  expect(checkpoint.status).toBe("evidence_persisted");
  const next = { ...checkpoint, revision: checkpoint.revision + 1 };
  expect(await Promise.all([
    stores.checkpoint.put(next, { expectedRevision: checkpoint.revision }),
    stores.checkpoint.put(next, { expectedRevision: checkpoint.revision })
  ])).toEqual(["stored", "conflict"]);
  const record = await stores.evidence.get({ evidenceId: result.evidenceId, revision: 1 });
  const input = { operationId: checkpoint.operationIds.evidence_persistence,
    evidenceId: result.evidenceId, revision: 1, expectedRevision: "absent",
    provenance: record.provenance, bundle: record.bundle };
  expect((await stores.evidence.persist(input)).reference).toBe(record.reference);
  await expect(stores.evidence.persist({ ...input, operationId: "conflicting-operation" })).rejects.toThrow();
  await expect(stores.evidence.persist({ ...input, bundle: { ...record.bundle, changed: true } })).rejects.toThrow();
  expect((await stores.evidence.reconcile({ ...input })).status).toBe("persisted");
  expect((await readFile(result.storedPath)).length).toBeGreaterThan(0);
});
