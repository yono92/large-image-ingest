import { describe, expect, it } from "vitest";
import {
  WebStorageResumeStore,
  createResumeChunkingIdentity,
  createResumeFileIdentity,
  createResumeRecord
} from "../src/index";
import { createManifest } from "../src/manifest";
import type { ResumeStorageLike } from "../src/web-storage-resume-store";
import { createLargeTestFile } from "./resume-fixtures";

class MemoryStorage implements ResumeStorageLike {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("WebStorageResumeStore", () => {
  it("round-trips resume records and ignores unrelated keys", async () => {
    const storage = new MemoryStorage();
    storage.setItem("other-key", "{}");

    const store = new WebStorageResumeStore(storage);
    const file = createLargeTestFile();
    const manifest = await createManifest(file, { chunking: { chunkSize: 256 * 1024 } });
    const record = createResumeRecord({
      id: "resume-1",
      manifest,
      file: await createResumeFileIdentity(file),
      chunking: createResumeChunkingIdentity(file.size, { chunkSize: 256 * 1024 }),
      transport: { uploadId: "upload-1", resumeToken: "secret-token" }
    });

    await store.put(record);

    await expect(store.get("resume-1")).resolves.toMatchObject({
      id: "resume-1",
      transport: { uploadId: "upload-1", resumeToken: "secret-token" }
    });

    await expect(store.list()).resolves.toHaveLength(1);

    await store.delete("resume-1");
    await expect(store.get("resume-1")).resolves.toBeUndefined();
    await expect(store.list()).resolves.toEqual([]);
  });
});
