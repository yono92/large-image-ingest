import { describe, expect, it } from "vitest";
import { calculateChecksum } from "../src/checksum";
import { ChecksumExecutionError } from "../src/errors";
import type { ChecksumExecutor } from "../src/types";
import { CountingFile } from "./checksum-fixtures";

describe("calculateChecksum", () => {
  it("calculates a stable SHA-256 checksum", async () => {
    const file = new File(["abc"], "abc.txt", { type: "text/plain" });

    const checksum = await calculateChecksum(file);

    expect(checksum).toMatchObject({
      algorithm: "sha256",
      scope: "whole-file"
    });
    expect(checksum.value).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("reports chunked checksum progress", async () => {
    const file = new File(["a".repeat(150 * 1024)], "chunked.txt", { type: "text/plain" });
    const progress: number[] = [];

    await calculateChecksum(file, {
      chunkSize: 64 * 1024,
      onProgress(event) {
        progress.push(event.loadedBytes);
      }
    });

    expect(progress).toEqual([64 * 1024, 128 * 1024, 150 * 1024]);
  });

  it("calculates the standard checksum for an empty file", async () => {
    const file = new File([], "empty.bin");
    const checksum = await calculateChecksum(file);

    expect(checksum.value).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("rejects unsupported algorithms and invalid checksum chunk sizes", async () => {
    const file = new File(["abc"], "abc.bin");

    await expect(calculateChecksum(file, { algorithm: "md5" as never })).rejects.toThrow(
      "Unsupported checksum algorithm"
    );
    await expect(calculateChecksum(file, { chunkSize: 1024 })).rejects.toThrow(RangeError);
  });

  it("uses bounded slices for exact and non-multiple source sizes", async () => {
    for (const size of [64 * 1024, 64 * 1024 + 7, 128 * 1024]) {
      const file = new CountingFile([new Uint8Array(size)]);
      await calculateChecksum(file, { chunkSize: 64 * 1024 });
      expect(file.maxReadBytes).toBeLessThanOrEqual(64 * 1024);
      expect(file.arrayBufferReads).toBe(Math.ceil(size / (64 * 1024)));
    }
  });

  it("cancels before work, between slices, and before executor result acceptance", async () => {
    const before = new AbortController();
    before.abort();
    await expect(calculateChecksum(new File(["abc"], "a.bin"), {
      signal: before.signal
    })).rejects.toMatchObject({ code: "checksum.canceled" });

    const between = new AbortController();
    await expect(calculateChecksum(
      new File([new Uint8Array(128 * 1024)], "b.bin"),
      {
        chunkSize: 64 * 1024,
        signal: between.signal,
        onProgress() {
          between.abort();
        }
      }
    )).rejects.toMatchObject({ code: "checksum.canceled" });

    const beforeAcceptance = new AbortController();
    const executor: ChecksumExecutor = {
      async calculate() {
        beforeAcceptance.abort();
        return {
          algorithm: "sha256",
          calculatedAt: new Date().toISOString(),
          chunkSizeBytes: 4 * 1024 * 1024,
          scope: "whole-file",
          value: "0".repeat(64)
        };
      }
    };
    await expect(calculateChecksum(new File(["abc"], "c.bin"), {
      executor,
      signal: beforeAcceptance.signal
    })).rejects.toMatchObject({ code: "checksum.canceled" });
  });

  it("sanitizes executor progress and isolates observer failures", async () => {
    const loaded: number[] = [];
    const observerErrors: unknown[] = [];
    const executor: ChecksumExecutor = {
      async calculate(_file, options) {
        options.onProgress?.({ loadedBytes: 10, totalBytes: 1, chunkIndex: 99, totalChunks: 99 });
        options.onProgress?.({ loadedBytes: 5, totalBytes: 1, chunkIndex: -1, totalChunks: 99 });
        options.onProgress?.({ loadedBytes: 999, totalBytes: 1, chunkIndex: 99, totalChunks: 99 });
        return {
          algorithm: "sha256",
          calculatedAt: new Date().toISOString(),
          chunkSizeBytes: options.chunkSize,
          scope: "whole-file",
          value: "a".repeat(64)
        };
      }
    };
    const checksum = await calculateChecksum(new File([new Uint8Array(20)], "progress.bin"), {
      executor,
      onProgress(progress) {
        loaded.push(progress.loadedBytes);
        if (loaded.length === 1) throw new Error("observer failed");
      },
      onObserverError(failure) {
        observerErrors.push(failure.error);
      }
    });
    expect(checksum.value).toBe("a".repeat(64));
    expect(loaded).toEqual([10, 20]);
    expect(observerErrors).toHaveLength(1);
  });

  it("requires explicit inline fallback after executor failure", async () => {
    const failing: ChecksumExecutor = {
      async calculate() {
        throw new Error("worker crashed");
      }
    };
    const file = new File(["abc"], "fallback.bin");
    await expect(calculateChecksum(file, { executor: failing })).rejects.toBeInstanceOf(
      ChecksumExecutionError
    );
    await expect(calculateChecksum(file, {
      executor: failing,
      fallback: "inline"
    })).resolves.toMatchObject({
      value: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    });
  });
});
