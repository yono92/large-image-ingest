import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateBlobSha256, calculateChecksum } from "../src/checksum";
import { ChecksumCanceledError } from "../src/errors";
import { createNodeChecksumExecutor } from "../src/node";

const CHUNK = 64 * 1024;

function fixture(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) bytes[index] = (index * 31 + (index >>> 8)) & 0xff;
  return bytes;
}

function expected(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const SIZES = [0, 1, 55, 56, 63, 64, 65, 119, 120, CHUNK - 1, CHUNK, CHUNK + 1, 3 * CHUNK + 17];

describe("built-in SHA-256", () => {
  it.each(SIZES)("matches node:crypto for %i bytes", async (size) => {
    const bytes = fixture(size);
    const result = await calculateChecksum(new Blob([bytes]), { chunkSize: CHUNK });
    expect(result.value).toBe(expected(bytes));
    const chunk = await calculateBlobSha256(new Blob([bytes]), { chunkSize: CHUNK });
    expect(chunk.value).toBe(expected(bytes));
  });
});

describe("chunk SHA-256 (calculateBlobSha256)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses WebCrypto for blobs up to 64 MiB", async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    const bytes = fixture(3 * CHUNK + 17);
    const result = await calculateBlobSha256(new Blob([bytes]), { encoding: "base64" });
    expect(digest).toHaveBeenCalledTimes(1);
    expect(Buffer.from(result.value, "base64").toString("hex")).toBe(expected(bytes));
  });

  it.each(SIZES)("falls back to the built-in hasher without WebCrypto for %i bytes", async (size) => {
    vi.stubGlobal("crypto", undefined);
    const bytes = fixture(size);
    const result = await calculateBlobSha256(new Blob([bytes]), { chunkSize: CHUNK });
    expect(result.value).toBe(expected(bytes));
  });

  it("streams blobs larger than 64 MiB through the built-in hasher", async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    const bytes = new Uint8Array(64 * 1024 * 1024 + 1).fill(7);
    const result = await calculateBlobSha256(new Blob([bytes]));
    expect(digest).not.toHaveBeenCalled();
    expect(result.value).toBe(expected(bytes));
  });

  it("stops with an abort error before reading when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(calculateBlobSha256(new Blob([fixture(CHUNK)]), { signal: controller.signal })).rejects.toThrow();
  });
});

describe("Node checksum executor", () => {
  it.each(SIZES)("matches the built-in digest for %i bytes", async (size) => {
    const bytes = fixture(size);
    const inline = await calculateChecksum(new Blob([bytes]), { chunkSize: CHUNK });
    const progress: number[] = [];
    const native = await calculateChecksum(new Blob([bytes]), {
      chunkSize: CHUNK,
      executor: createNodeChecksumExecutor(),
      onProgress: (value) => progress.push(value.loadedBytes)
    });
    expect(native.value).toBe(inline.value);
    expect(native.chunkSizeBytes).toBe(CHUNK);
    expect(progress.at(-1)).toBe(size);
  });

  it("stops with a typed cancellation when aborted", async () => {
    const controller = new AbortController();
    const pending = calculateChecksum(new Blob([fixture(4 * CHUNK)]), {
      chunkSize: CHUNK,
      executor: createNodeChecksumExecutor(),
      signal: controller.signal,
      onProgress: () => controller.abort()
    });
    await expect(pending).rejects.toBeInstanceOf(ChecksumCanceledError);
  });
});
