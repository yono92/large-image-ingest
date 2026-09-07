import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createManifest } from "../src/manifest.js";
import { createNodeStoredFileVerifier } from "../src/node-workflow.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("Node workflow stored-file verifier", () => {
  it("resolves an application-trusted path and maps exact stored verification", async () => {
    const root = await temporaryRoot();
    const storedPath = join(root, "stored.bin");
    const file = new File(["exact-source"], "source.tif", { type: "image/tiff" });
    const manifest = await createManifest(file, { chunking: { chunkSize: 256 * 1024 } });
    await writeFile(storedPath, "exact-source");
    let resolved = 0;
    const verifier = createNodeStoredFileVerifier({
      async resolvePath(received) {
        resolved += 1;
        expect(received.id).toBe(manifest.id);
        return storedPath;
      },
      now: () => new Date("2026-09-07T00:00:00.000Z")
    });

    await expect(verifier.verify({
      manifest,
      operationId: "verify-1",
      signal: new AbortController().signal
    })).resolves.toEqual({
      status: "verified",
      checkedAt: "2026-09-07T00:00:00.000Z",
      expectedEvidenceCategories: ["whole-file-sha256", "size"],
      observedEvidenceCategories: ["whole-file-sha256", "size"]
    });
    expect(resolved).toBe(1);
  });

  it("returns typed safe issues for mismatch and unavailable paths", async () => {
    const root = await temporaryRoot();
    const file = new File(["exact-source"], "source.tif", { type: "image/tiff" });
    const manifest = await createManifest(file, { chunking: { chunkSize: 256 * 1024 } });
    const changedPath = join(root, "changed.bin");
    await writeFile(changedPath, "wrong-source");

    const mismatch = createNodeStoredFileVerifier({ async resolvePath() { return changedPath; } });
    const unavailable = createNodeStoredFileVerifier({
      async resolvePath() { return join(root, "customer-secret-missing.bin"); }
    });
    const input = { manifest, operationId: "verify-1", signal: new AbortController().signal };
    await expect(mismatch.verify(input)).resolves.toMatchObject({ status: "failed", retryable: false });
    const missing = await unavailable.verify(input);
    expect(missing).toMatchObject({ status: "failed", retryable: true });
    expect(JSON.stringify(missing)).not.toContain("customer-secret-missing.bin");
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "large-image-ingest-node-workflow-"));
  roots.push(root);
  return root;
}
