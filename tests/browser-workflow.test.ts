import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createVerifiedIngestWorkflow } from "../src/workflow.js";
import { workflowOptions } from "./workflow-fixtures.js";

describe("browser workflow boundary", () => {
  it("has no transitive Node, React, or preservation runtime import", async () => {
    const visited = new Set<string>();
    const pending = [resolve("src/workflow.ts")];
    while (pending.length > 0) {
      const path = pending.pop()!;
      if (visited.has(path)) continue;
      visited.add(path);
      const source = await readFile(path, "utf8");
      expect(source).not.toMatch(/from ["']node:/);
      expect(source).not.toMatch(/from ["']react["']/);
      expect(source).not.toMatch(/from ["'].\/preservation\.js["']/);
      for (const match of source.matchAll(/from ["'](\.\.?\/[^"']+)\.js["']/g)) {
        const dependency = resolve(dirname(path), `${match[1]}.ts`);
        if (dependency.startsWith(resolve("src"))) pending.push(dependency);
      }
    }
    expect(visited.size).toBeGreaterThan(5);
  });

  it("hashes a large source once with bounded reads and no transformation", async () => {
    const tracker = { bytesRead: 0, maximumRead: 0, slices: 0 };
    const source = trackedFile(64 * 1024 * 1024, tracker);
    const calls = { create: 0, upload: 0, complete: 0, verify: 0 };
    const result = await createVerifiedIngestWorkflow(source, await workflowOptions(calls)).start();
    expect(result.status).toBe("evidence_persisted");
    expect(tracker.bytesRead).toBe(source.size);
    expect(tracker.maximumRead).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(tracker.slices).toBeGreaterThan(1);
  });
});

function trackedFile(size: number, tracker: { bytesRead: number; maximumRead: number; slices: number }) {
  class TrackedBlob extends Blob {
    override slice(start?: number, end?: number, contentType?: string): Blob {
      tracker.slices += 1;
      const chunk = super.slice(start, end, contentType);
      const arrayBuffer = chunk.arrayBuffer.bind(chunk);
      Object.defineProperty(chunk, "arrayBuffer", {
        value: async () => {
          tracker.bytesRead += chunk.size;
          tracker.maximumRead = Math.max(tracker.maximumRead, chunk.size);
          return arrayBuffer();
        }
      });
      return chunk;
    }
  }
  const blob = new TrackedBlob([new Uint8Array(size)], { type: "image/tiff" });
  Object.defineProperties(blob, { name: { value: "large.tif" }, lastModified: { value: 0 } });
  return blob as TrackedBlob & { name: string; lastModified: number };
}
