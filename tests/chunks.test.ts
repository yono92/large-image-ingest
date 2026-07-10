import { describe, expect, it } from "vitest";
import { planChunks } from "../src/chunks";

describe("planChunks", () => {
  it("creates stable byte ranges", () => {
    const plan = planChunks(10, { chunkSize: 256 * 1024 });

    expect(plan.totalChunks).toBe(1);
    expect(plan.chunks[0]).toEqual({
      index: 0,
      start: 0,
      end: 10,
      size: 10
    });
  });

  it("splits files into ordered chunks", () => {
    const plan = planChunks(600 * 1024, { chunkSize: 256 * 1024 });

    expect(plan.totalChunks).toBe(3);
    expect(plan.chunks.map((chunk) => chunk.size)).toEqual([
      256 * 1024,
      256 * 1024,
      88 * 1024
    ]);
  });

  it("returns an empty deterministic plan for an empty file", () => {
    expect(planChunks(0, { chunkSize: 256 * 1024 })).toEqual({
      chunkSize: 256 * 1024,
      totalBytes: 0,
      totalChunks: 0,
      chunks: []
    });
  });

  it("rejects unsafe totals and undersized chunk configuration", () => {
    for (const totalBytes of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => planChunks(totalBytes)).toThrow(RangeError);
    }

    for (const chunkSize of [0, 128 * 1024, 256 * 1024 + 0.5]) {
      expect(() => planChunks(1, { chunkSize })).toThrow(RangeError);
    }
  });
});
