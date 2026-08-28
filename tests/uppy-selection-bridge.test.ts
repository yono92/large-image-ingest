import { describe, expect, it } from "vitest";
import {
  createManifest,
  createResumeChunkingIdentity,
  createResumeFileIdentity,
  createResumeRecord
} from "../src/core";
import {
  findCompatibleResumeRecord,
  getRemovalPolicy,
  toSelectedSource
} from "../examples/uppy-react/src/selection-bridge";

describe("Uppy UI-only selection bridge", () => {
  it("accepts the exact local File without copying or transforming it", () => {
    const file = createFile("wafer-a.tiff", 12);
    const result = toSelectedSource({ id: "uppy-1", name: file.name, data: file });

    expect(result).toEqual({
      ok: true,
      source: {
        uppyFileId: "uppy-1",
        file
      }
    });
    if (result.ok) {
      expect(result.source.file).toBe(file);
    }
  });

  it("rejects Blob-only and unavailable sources", () => {
    expect(toSelectedSource({
      id: "remote",
      name: "remote.tiff",
      data: new Blob([new Uint8Array(4)], { type: "image/tiff" })
    })).toEqual({ ok: false, code: "selection.remote_unsupported" });

    expect(toSelectedSource({ id: "missing", name: "missing.tiff" })).toEqual({
      ok: false,
      code: "selection.file_unavailable"
    });
  });

  it("requires cancellation before active removal and preserves paused recovery", () => {
    expect(getRemovalPolicy("idle", false)).toBe("remove");
    expect(getRemovalPolicy("uploading", true)).toBe("cancel-first");
    expect(getRemovalPolicy("completing", true)).toBe("cancel-first");
    expect(getRemovalPolicy("paused", true)).toBe("detach-recoverable");
    expect(getRemovalPolicy("completed", false)).toBe("remove");
  });

  it("finds only a compatible recoverable record for the reselected file", async () => {
    const chunkSize = 256 * 1024;
    const file = createFile("wafer-a.tiff", chunkSize * 3);
    const other = createFile("wafer-a.tiff", chunkSize * 3 + 1);
    const manifest = await createManifest(file, {
      chunking: { chunkSize }
    });
    const record = createResumeRecord({
      id: "resume-compatible",
      manifest,
      file: await createResumeFileIdentity(file),
      chunking: createResumeChunkingIdentity(file.size, { chunkSize }),
      transport: { name: "local-http-reference", uploadId: "upload-1" }
    });

    await expect(findCompatibleResumeRecord([record], file, { chunkSize })).resolves.toBe(record);
    await expect(findCompatibleResumeRecord([record], other, { chunkSize })).resolves.toBeUndefined();
  });
});

function createFile(name: string, size: number): File {
  return new File([new Uint8Array(size)], name, {
    type: "image/tiff",
    lastModified: Date.UTC(2026, 7, 28)
  });
}
