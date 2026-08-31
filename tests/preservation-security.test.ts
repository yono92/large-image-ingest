import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  evaluatePreservationMapping,
  exportBagIt,
  exportOcflObject,
  PreservationError,
  validateBagIt
} from "../src/preservation.js";
import type { IngestFileLike, IngestManifest } from "../src/types.js";
import { preservationFixture, temporaryRoot } from "./preservation-fixtures.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

class VirtualZeroBlob implements IngestFileLike {
  readonly type = "application/octet-stream";
  readonly name = "../../customer-secret-source.tif";
  readonly lastModified = 0;
  maxSliceBytes = 0;

  constructor(readonly size: number) {}

  slice(start = 0, end = this.size): Blob {
    const length = Math.max(0, Math.min(this.size, end) - Math.max(0, start));
    this.maxSliceBytes = Math.max(this.maxSliceBytes, length);
    return new Blob([new Uint8Array(length)]);
  }

  stream(): ReadableStream<Uint8Array> {
    let offset = 0;
    const size = this.size;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= size) {
          controller.close();
          return;
        }
        const length = Math.min(64 * 1024, size - offset);
        offset += length;
        controller.enqueue(new Uint8Array(length));
      }
    });
  }

  arrayBuffer(): Promise<ArrayBuffer> {
    throw new Error("whole-file buffering is forbidden");
  }

  text(): Promise<string> {
    throw new Error("whole-file buffering is forbidden");
  }
}

describe("preservation streaming and safe failures", () => {
  it("hashes with bounded slices and streams a source larger than the checksum buffer", async () => {
    const temporary = await temporaryRoot();
    cleanups.push(temporary.cleanup);
    const fixture = await preservationFixture();
    const source = new VirtualZeroBlob(16 * 1024 * 1024);
    const manifest: IngestManifest = structuredClone(fixture.manifest);
    manifest.original.sizeBytes = source.size;
    delete manifest.original.checksum;
    manifest.derivatives = [];
    const mapping = await evaluatePreservationMapping({
      profile: "bagit-1.0-sha256",
      manifest,
      original: { bytes: source },
      digestPolicy: "calculate-and-verify",
      checksumChunkSize: 1024 * 1024
    });
    const destination = join(temporary.root, "large-bag");
    await exportBagIt(mapping, { destination });
    expect(source.maxSliceBytes).toBeLessThanOrEqual(1024 * 1024);
    expect((await validateBagIt(destination)).ok).toBe(true);
  });

  it("rejects a reconstructed mapping that lacks verified source handles", async () => {
    const fixture = await preservationFixture();
    const mapping = await evaluatePreservationMapping({
      profile: "ocfl-1.1-sha256",
      manifest: fixture.manifest,
      original: { bytes: fixture.original }
    });
    const reconstructed = JSON.parse(JSON.stringify(mapping));
    await expect(exportOcflObject(reconstructed, { destination: "/not-used/customer-secret" }))
      .rejects.toMatchObject({ code: "preservation.mapping_untrusted" });
  });

  it("does not expose source names, customer metadata, or destination roots in mappings and errors", async () => {
    const temporary = await temporaryRoot();
    cleanups.push(temporary.cleanup);
    const fixture = await preservationFixture();
    fixture.manifest.metadata = { customerSecret: "lot-secret-42" };
    const mapping = await evaluatePreservationMapping({
      profile: "bagit-1.0-sha256",
      manifest: fixture.manifest,
      original: { bytes: fixture.original }
    });
    const serialized = JSON.stringify(mapping);
    expect(serialized).not.toContain("lot-secret-42");
    expect(serialized).not.toContain("inspection.tif");

    const destination = join(temporary.root, "customer-secret-destination");
    await mkdir(destination);
    let caught: unknown;
    try {
      await exportBagIt(mapping, { destination });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PreservationError);
    expect(String(caught)).not.toContain(destination);
    expect(JSON.stringify(caught)).not.toContain("customer-secret-destination");
  });

  it("returns typed safe validation issues for an unavailable root", async () => {
    const result = await validateBagIt("/definitely-not-present/customer-secret-root");
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([{ code: "preservation.validation_failed" }]);
    expect(JSON.stringify(result)).not.toContain("customer-secret-root");
  });

  it("does not mutate manifest or provenance while evaluating compatibility", async () => {
    const fixture = await preservationFixture();
    const manifestBefore = JSON.stringify(fixture.manifest);
    const provenanceBefore = JSON.stringify(fixture.provenance);
    await evaluatePreservationMapping({
      profile: "ocfl-1.1-sha256",
      manifest: fixture.manifest,
      original: { bytes: fixture.original },
      derivatives: fixture.derivatives,
      provenance: fixture.provenance
    });
    expect(JSON.stringify(fixture.manifest)).toBe(manifestBefore);
    expect(JSON.stringify(fixture.provenance)).toBe(provenanceBefore);
  });
});
