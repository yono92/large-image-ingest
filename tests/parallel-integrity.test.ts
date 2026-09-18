import { describe, expect, it } from "vitest";
import { calculateBlobSha256, checksumValuesEqual } from "../src/checksum";
import { createIngestSession } from "../src/session";
import { createManifest } from "../src/manifest";
import { verifyUploadReceipts } from "../src/verification";
import type { TransportCapabilities, UploadChunkReceipt, UploadTransport } from "../src/types";

const chunkSize = 256 * 1024;

function capabilities(overrides: Partial<TransportCapabilities> = {}): TransportCapabilities {
  return {
    name: "integrity-fake",
    resumable: true,
    abortable: true,
    expires: false,
    supportsParallelChunks: true,
    supportsChunkChecksum: true,
    maxParallelChunks: 4,
    supportsSparseResume: true,
    supportsSafeChunkRepeat: true,
    chunkChecksumAlgorithms: ["sha256"],
    chunkChecksumEncodings: ["base64"],
    attestsChunkChecksum: true,
    ...overrides
  };
}

describe("parallel chunk integrity", () => {
  it("normalizes equivalent bounded SHA-256 hex and Base64 values", async () => {
    const blob = new Blob([new Uint8Array(chunkSize + 17).fill(7)]);
    const hex = await calculateBlobSha256(blob, { chunkSize: 64 * 1024, encoding: "hex" });
    const base64 = await calculateBlobSha256(blob, { chunkSize: 64 * 1024, encoding: "base64" });
    expect(hex.value).toHaveLength(64);
    expect(base64.value).toHaveLength(44);
    expect(checksumValuesEqual(hex, base64)).toBe(true);
  });

  it.each([
    [{ concurrency: 1 }, capabilities(), "session.invalid_state"],
    [{ concurrency: 17 }, capabilities(), "session.invalid_state"],
    [{ concurrency: 2 }, capabilities({ chunkChecksumAlgorithms: ["crc32c"] }), "checksum.chunk_unsupported"],
    [{ concurrency: 2 }, capabilities({ chunkChecksumEncodings: ["hex"] }), "checksum.chunk_unsupported"],
    [{ concurrency: 2 }, capabilities({ supportsSparseResume: false, supportsSafeChunkRepeat: false }), "resume.transport_unsupported"]
  ])("rejects an incompatible policy before session creation", async (parallel, advertised, code) => {
    let creates = 0;
    const transport: UploadTransport = {
      capabilities: advertised,
      async createSession() { creates += 1; return { uploadId: "unused" }; },
      async uploadChunk() {},
      async completeSession() {}
    };
    await expect(createIngestSession(new File([new Uint8Array(chunkSize)], "x.tif"), {
      checksum: false,
      chunking: { chunkSize },
      parallel,
      transport
    }).start()).rejects.toMatchObject({ code });
    expect(creates).toBe(0);
  });

  it.each([
    ["missing", undefined, "checksum.chunk_missing"],
    ["wrong algorithm", { algorithm: "crc32c", value: "AAAA", encoding: "base64", role: "remote-attestation" }, "checksum.chunk_unsupported"],
    ["malformed", { algorithm: "sha256", value: "not base64", encoding: "base64", role: "remote-attestation" }, "checksum.chunk_mismatch"]
  ])("rejects %s remote evidence without acknowledging progress", async (_name, remote, code) => {
    let completionCalls = 0;
    let attempts = 0;
    const transport: UploadTransport = {
      capabilities: capabilities(),
      async createSession() { return { uploadId: "integrity-1" }; },
      async uploadChunk({ chunk, integrity }) {
        attempts += 1;
        return {
          chunkIndex: chunk.index,
          sizeBytes: chunk.size,
          completedAt: new Date().toISOString(),
          integrity: integrity && remote ? { ...integrity, remote } : integrity,
          transport: { name: "integrity-fake" }
        };
      },
      async completeSession() { completionCalls += 1; }
    };
    const session = createIngestSession(new File([new Uint8Array(chunkSize)], "x.tif"), {
      checksum: false,
      chunking: { chunkSize },
      parallel: { concurrency: 2 },
      retries: 2,
      transport
    });
    await expect(session.start()).rejects.toMatchObject({ code });
    expect(session.getSnapshot()?.uploadedBytes).toBe(0);
    expect(completionCalls).toBe(0);
    expect(attempts).toBe(1);
  });

  it("verifies chunk evidence without treating it as whole-file verification", async () => {
    const file = new File([new Uint8Array(chunkSize).fill(3)], "verify.tif", { type: "image/tiff" });
    const manifest = await createManifest(file, { checksum: false, chunking: { chunkSize } });
    const checksum = await calculateBlobSha256(file, { encoding: "base64" });
    const receipt: UploadChunkReceipt = {
      chunkIndex: 0,
      sizeBytes: file.size,
      completedAt: "2026-09-18T00:00:00.000Z",
      integrity: {
        policyId: "chunk-sha256-base64-v1",
        binding: {
          manifestId: manifest.id,
          uploadId: "verify-upload",
          sourceIdentity: "strong-source-identity",
          chunkIndex: 0,
          startByte: 0,
          endByteExclusive: file.size,
          sizeBytes: file.size
        },
        local: { ...checksum, role: "local-calculation" },
        remote: { ...checksum, role: "remote-attestation" }
      },
      transport: { name: "integrity-fake" }
    };
    expect(verifyUploadReceipts(manifest, [receipt])).toMatchObject({ ok: true });
    receipt.integrity!.binding.endByteExclusive -= 1;
    expect(verifyUploadReceipts(manifest, [receipt])).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "verification.receipt_invalid" })]
    });
    expect(manifest.original.checksum).toBeUndefined();
  });
});
