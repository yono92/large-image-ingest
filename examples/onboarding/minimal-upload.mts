import { createIngestSession } from "large-image-ingest/core";
import { verifyNodeFileManifest } from "large-image-ingest/node";
import { createLocalReferenceServer } from "../reference-local/local-server.mjs";
import { createFixture, exampleRoot, runCli } from "./fixture.mjs";
import { createReferenceTransport } from "./transport.mjs";

export async function runMinimalUpload(options: { root?: string } = {}) {
  const root = await exampleRoot(options.root);
  const server = await createLocalReferenceServer({ root });
  try {
    const file = createFixture();
    const session = createIngestSession(file, {
      transport: createReferenceTransport(server.baseUrl)
    });
    const manifest = await session.start();
    const storedPath = server.resolveStoredPath(manifest.id);
    const verification = await verifyNodeFileManifest(storedPath, manifest, { checksum: "required" });
    if (!verification.ok) throw new Error("Stored original verification failed.");
    return { root, status: session.getSnapshot()?.status ?? "completed", storedVerified: true, storedPath };
  } finally {
    await server.close();
  }
}

runCli(import.meta.url, runMinimalUpload);
