import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  evaluatePreservationMapping,
  exportBagIt,
  PreservationError,
  validateBagIt
} from "../src/preservation.js";
import type { IngestFileLike } from "../src/types.js";
import { preservationFixture, temporaryRoot } from "./preservation-fixtures.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

async function exportFixture(): Promise<{ root: string; destination: string }> {
  const temporary = await temporaryRoot();
  cleanups.push(temporary.cleanup);
  const fixture = await preservationFixture();
  const mapping = await evaluatePreservationMapping({
    profile: "bagit-1.0-sha256",
    manifest: fixture.manifest,
    original: { bytes: fixture.original },
    derivatives: fixture.derivatives,
    provenance: fixture.provenance
  });
  const destination = join(temporary.root, "bag");
  await exportBagIt(mapping, { destination });
  return { root: temporary.root, destination };
}

describe("BagIt preservation export", () => {
  it("exports unchanged payloads and independently validates complete payload and tag fixity", async () => {
    const { destination } = await exportFixture();
    const validation = await validateBagIt(destination);
    expect(validation).toMatchObject({
      ok: true,
      profile: "bagit-1.0-sha256",
      contentFileCount: 3,
      verifiedContentFileCount: 3,
      issues: []
    });
    expect(await readFile(join(destination, "data/original/source.bin"), "utf8"))
      .toBe("verified-original-bytes");
    const payloadManifest = await readFile(join(destination, "manifest-sha256.txt"), "utf8");
    expect(payloadManifest.split("\n").filter(Boolean)).toHaveLength(3);
    expect(await readFile(join(destination, "bagit.txt"), "utf8"))
      .toBe("BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n");
  });

  it("detects changed, missing, and unmanifested payload content", async () => {
    const changed = await exportFixture();
    await writeFile(join(changed.destination, "data/original/source.bin"), "changed");
    expect((await validateBagIt(changed.destination)).issues.map((issue) => issue.code))
      .toContain("preservation.content_changed");

    const unmanifested = await exportFixture();
    await writeFile(join(unmanifested.destination, "data/unmanifested.bin"), "extra");
    expect((await validateBagIt(unmanifested.destination)).issues.map((issue) => issue.code))
      .toContain("preservation.content_unmanifested");

    const missing = await exportFixture();
    await unlink(join(missing.destination, "data/original/source.bin"));
    expect((await validateBagIt(missing.destination)).issues.map((issue) => issue.code))
      .toContain("preservation.content_missing");
  });

  it("detects changed tag material and corrupt relationship metadata", async () => {
    const { destination } = await exportFixture();
    await writeFile(join(destination, "large-image-ingest/relationships.json"), "{}");
    const codes = (await validateBagIt(destination)).issues.map((issue) => issue.code);
    expect(codes).toContain("preservation.tag_manifest_invalid");
    expect(codes).toContain("preservation.relationship_invalid");
  });

  it("rejects an existing destination without changing it", async () => {
    const { destination } = await exportFixture();
    const fixture = await preservationFixture();
    const mapping = await evaluatePreservationMapping({
      profile: "bagit-1.0-sha256",
      manifest: fixture.manifest,
      original: { bytes: fixture.original }
    });
    await expect(exportBagIt(mapping, { destination })).rejects.toMatchObject({
      code: "preservation.destination_exists"
    });
    expect((await validateBagIt(destination)).ok).toBe(true);
  });

  it("leaves interrupted output distinguishable and never promotes it", async () => {
    class FailingBlob extends Blob {
      override stream(): ReadableStream<Uint8Array> {
        return new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("verified"));
            controller.error(new Error("secret source failure"));
          }
        });
      }
    }
    const temporary = await temporaryRoot();
    cleanups.push(temporary.cleanup);
    const fixture = await preservationFixture();
    const failing = new FailingBlob(["verified-original-bytes"], { type: "image/tiff" });
    Object.defineProperties(failing, { name: { value: "secret-name.tif" }, lastModified: { value: 0 } });
    const mapping = await evaluatePreservationMapping({
      profile: "bagit-1.0-sha256",
      manifest: fixture.manifest,
      original: { bytes: failing as IngestFileLike }
    });
    const destination = join(temporary.root, "interrupted-bag");
    await expect(exportBagIt(mapping, { destination })).rejects.toBeInstanceOf(PreservationError);
    const names = await readdir(temporary.root);
    expect(names).not.toContain("interrupted-bag");
    expect(names.some((name) => name.startsWith(".interrupted-bag.incomplete-"))).toBe(true);
  });
});
