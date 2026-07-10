import { describe, expect, it } from "vitest";
import { calculateChecksum } from "../src/checksum";

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
});
