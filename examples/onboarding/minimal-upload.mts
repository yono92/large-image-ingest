#!/usr/bin/env node
import { createIngestSession } from "large-image-ingest/core";
import { verifyNodeFileManifest } from "large-image-ingest/node";
import { createLocalReferenceServer } from "../reference-local/local-server.mjs";
import { createFixture, exampleRoot } from "./fixture.mjs";
import { ExampleFailure, runCli, type ExampleOptions } from "./cli.mjs";
import { openLocalSource } from "./source.mjs";
import { createReferenceTransport } from "./transport.mjs";

export async function runMinimalUpload(options: ExampleOptions = {}) {
  const source = options.file === undefined ? undefined : await openLocalSource(options.file);
  const file = source?.file ?? createFixture();
  const root = await exampleRoot(options.root);
  const server = await createLocalReferenceServer({ root });
  try {
    const session = createIngestSession(file, {
      transport: createReferenceTransport(server.baseUrl)
    });
    const manifest = await session.start();
    const storedPath = server.resolveStoredPath(manifest.id);
    const verification = await verifyNodeFileManifest(storedPath, manifest, { checksum: "required" });
    await source?.assertUnchanged();
    if (!verification.ok) throw new ExampleFailure("verification.failed");
    return { root, status: session.getSnapshot()?.status ?? "completed", storedVerified: true, storedPath };
  } catch (error) {
    await source?.assertUnchanged();
    throw error;
  } finally {
    await server.close();
  }
}

runCli(import.meta.url, runMinimalUpload, true);
