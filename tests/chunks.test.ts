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
});
