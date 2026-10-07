import { mkdtemp, readFile, rm } from "node:fs/promises";
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
  // @ts-expect-error executable example intentionally has no SDK declaration surface
  const { runMinimalUpload } = await import("../examples/onboarding/minimal-upload.mjs");
  const result = await runMinimalUpload({ root: await root() });
  expect(result.status).toBe("completed");
  expect(result.storedVerified).toBe(true);
});

test("the reference HTTP target rejects corrupted original bytes", async () => {
  // @ts-expect-error example-only module
  const { createLocalReferenceServer } = await import("../examples/reference-local/local-server.mjs");
  // @ts-expect-error example-only module
  const { createFixture } = await import("../examples/onboarding/fixture.mjs");
  // @ts-expect-error example-only module
  const { createReferenceTransport } = await import("../examples/onboarding/transport.mjs");
  const server = await createLocalReferenceServer({ root: await root() });
  try {
    const transport = createReferenceTransport(server.baseUrl);
    const corrupt = { ...transport, async uploadChunk(input: any) {
      const bytes = new Uint8Array(await input.body.arrayBuffer());
      bytes[bytes.length - 1] ^= 1;
      return transport.uploadChunk({ ...input, body: new Blob([bytes]) });
    } };
    const session = createIngestSession(createFixture(), { transport: corrupt });
    await expect(session.start()).rejects.toThrow();
    expect(server.listUploads()[0]).toMatchObject({ status: "open", verification: "failed" });
  } finally { await server.close(); }
});

test("file-backed recovery rejects metadata-equal changed bytes before remote resume", async () => {
  // @ts-expect-error example-only module
  const { createLocalReferenceServer } = await import("../examples/reference-local/local-server.mjs");
  // @ts-expect-error example-only module
  const { createFixture } = await import("../examples/onboarding/fixture.mjs");
  // @ts-expect-error example-only module
  const { createReferenceTransport } = await import("../examples/onboarding/transport.mjs");
  // @ts-expect-error example-only module
  const { createFileStores } = await import("../examples/onboarding/file-stores.mjs");
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
  // @ts-expect-error executable example intentionally has no SDK declaration surface
  const { runVerifiedWorkflow } = await import("../examples/onboarding/verified-workflow.mjs");
  const directory = await root();
  const result = await runVerifiedWorkflow({ root: directory, exerciseRecovery: true });
  expect(result.status).toBe("evidence_persisted");
  expect(result.recovered).toBe(true);
  expect(result.storedVerified).toBe(true);
  expect(result.evidenceReloaded).toBe(true);
});

test("example storage serializes stale CAS and protects immutable evidence revisions", async () => {
  // @ts-expect-error executable example intentionally has no SDK declaration surface
  const { createFileStores } = await import("../examples/onboarding/file-stores.mjs");
  // @ts-expect-error executable example intentionally has no SDK declaration surface
  const { runVerifiedWorkflow } = await import("../examples/onboarding/verified-workflow.mjs");
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
