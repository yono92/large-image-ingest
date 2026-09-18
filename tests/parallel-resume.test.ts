import { describe, expect, it } from "vitest";
import { calculateBlobSha256 } from "../src/checksum";
import { createManifest } from "../src/manifest";
import {
  createContentSourceIdentity,
  createPersistentResumeRecord,
  createResumeChunkingIdentity,
  createResumeFileIdentity,
  validateResumeRecord
} from "../src/resume";
import { createIngestSession } from "../src/session";
import type { ChunkDescriptor, ResumeRecordV0_4, UploadChunkReceipt, UploadTransport } from "../src/types";
import { MemoryResumeStore, toLegacyResumeRecord, toV0_2ResumeRecord } from "./resume-fixtures";

const chunkSize = 256 * 1024;
const parallel = {
  requestedConcurrency: 3,
  effectiveConcurrency: 3,
  policyId: "parallel-worker-pool-v1",
  integrityPolicyId: "chunk-sha256-base64-v1",
  ambiguousChunkIndexes: [] as number[]
} as const;

describe("parallel persistent resume", () => {
  it("keeps sequential v0.1 through v0.3 records valid without fabricated parallel evidence", async () => {
    const file = createFile();
    const manifest = await createManifest(file, { checksum: false, chunking: { chunkSize } });
    const current = createPersistentResumeRecord({
      manifest,
      file: await createResumeFileIdentity(file),
      contentIdentity: await createContentSourceIdentity(file),
      chunking: createResumeChunkingIdentity(file.size, { chunkSize }),
      transport: { name: "sequential-fake", uploadId: "sequential-upload" }
    });
    expect(current.schemaVersion).toBe("large-image-ingest.resume.v0.3");
    const v0_2 = toV0_2ResumeRecord(current);
    const v0_1 = toLegacyResumeRecord(v0_2);
    for (const record of [v0_1, v0_2, current]) {
      expect(validateResumeRecord(record)).toMatchObject({ ok: true });
      expect(record).not.toHaveProperty("parallel");
    }
  });

  it("recovers every sparse subset of a bounded four-chunk plan", async () => {
    const file = createFile();
    const manifest = await createManifest(file, { checksum: false, chunking: { chunkSize } });
    for (let mask = 0; mask < 16; mask += 1) {
      const acknowledged = [0, 1, 2, 3].filter((index) => (mask & (1 << index)) !== 0);
      const record = await createRecord(file, manifest, acknowledged);
      record.id = `subset-${mask}`;
      const store = new MemoryResumeStore();
      await store.put(record);
      const uploaded: number[] = [];
      await createIngestSession(file, {
        checksum: false,
        chunking: { chunkSize },
        parallel: { concurrency: 3 },
        resume: { store, cleanup: "mark-complete" },
        transport: createTransport(uploaded, () => undefined)
      }).resume(record.id);
      expect(uploaded.sort((a, b) => a - b)).toEqual(
        [0, 1, 2, 3].filter((index) => !acknowledged.includes(index))
      );
    }
  });

  it("parses sparse v0.4 evidence and rejects binding mutation", async () => {
    const file = createFile();
    const manifest = await createManifest(file, { checksum: false, chunking: { chunkSize } });
    const record = await createRecord(file, manifest, [1, 3]);
    expect(validateResumeRecord(record)).toMatchObject({ ok: true });
    const mutated = structuredClone(record);
    mutated.receipts[0]!.integrity!.binding.startByte += 1;
    expect(validateResumeRecord(mutated)).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ path: "receipts[0].integrity" })]
    });
  });

  it("resumes only missing chunks and rejects a changed policy before remote validation", async () => {
    const file = createFile();
    const manifest = await createManifest(file, { checksum: false, chunking: { chunkSize } });
    const record = await createRecord(file, manifest, [1, 3]);
    const store = new MemoryResumeStore();
    await store.put(record);
    const uploaded: number[] = [];
    let resumes = 0;
    const transport = createTransport(uploaded, () => { resumes += 1; });
    await createIngestSession(file, {
      checksum: false,
      chunking: { chunkSize },
      parallel: { concurrency: 3 },
      resume: { store, cleanup: "mark-complete" },
      transport
    }).resume(record.id);
    expect(uploaded.sort((a, b) => a - b)).toEqual([0, 2]);
    expect(resumes).toBe(1);

    const changed = structuredClone(record);
    changed.id = "changed-policy";
    changed.parallel.requestedConcurrency = 4;
    await store.put(changed);
    await expect(createIngestSession(file, {
      checksum: false,
      chunking: { chunkSize },
      parallel: { concurrency: 3 },
      resume: { store },
      transport
    }).resume(changed.id)).rejects.toMatchObject({ code: "resume.chunking_mismatch" });
    expect(resumes).toBe(1);
  });

  it("adopts remotely proven sparse chunks before scheduling missing work", async () => {
    const file = createFile();
    const manifest = await createManifest(file, { checksum: false, chunking: { chunkSize } });
    const remote = await createRecord(file, manifest, [1, 2, 3]);
    const local = structuredClone(remote);
    local.id = "remote-adoption";
    local.receipts = local.receipts.filter(({ chunkIndex }) => chunkIndex !== 2);
    local.progress.completedChunkRanges = [
      { startIndex: 1, endIndexInclusive: 1 },
      { startIndex: 3, endIndexInclusive: 3 }
    ];
    local.progress.uploadedBytes = local.receipts.reduce((total, receipt) => total + receipt.sizeBytes, 0);
    const store = new MemoryResumeStore();
    await store.put(local);
    const uploaded: number[] = [];
    const transport: UploadTransport = {
      ...createTransport(uploaded, () => undefined),
      capabilities: {
        ...createTransport(uploaded, () => undefined).capabilities!,
        supportsSafeChunkRepeat: false,
        supportsRemoteChunkReconciliation: true
      },
      async reconcileChunks() { return remote.receipts; }
    };
    await createIngestSession(file, {
      checksum: false,
      chunking: { chunkSize },
      parallel: { concurrency: 3 },
      resume: { store, cleanup: "mark-complete" },
      transport
    }).resume(local.id);
    expect(uploaded).toEqual([0]);
  });
});

function createFile(): File {
  return new File([new Uint8Array(chunkSize * 4).fill(11)], "sparse.tif", {
    type: "image/tiff",
    lastModified: Date.UTC(2026, 8, 18)
  });
}

async function createRecord(
  file: File,
  manifest: Awaited<ReturnType<typeof createManifest>>,
  indexes: number[]
): Promise<ResumeRecordV0_4> {
  const record = createPersistentResumeRecord({
    manifest,
    file: await createResumeFileIdentity(file),
    contentIdentity: await createContentSourceIdentity(file),
    chunking: createResumeChunkingIdentity(file.size, { chunkSize }),
    transport: { name: "parallel-resume-fake", uploadId: "resume-upload" },
    parallel
  });
  if (record.schemaVersion !== "large-image-ingest.resume.v0.4") throw new Error("Expected v0.4.");
  record.receipts = await Promise.all(indexes.map(async (chunkIndex) => {
    const chunk = descriptor(chunkIndex, file.size);
    const checksum = await calculateBlobSha256(file.slice(chunk.start, chunk.end), { encoding: "base64" });
    return {
      chunkIndex,
      sizeBytes: chunk.size,
      completedAt: "2026-09-18T00:00:00.000Z",
      integrity: {
        policyId: parallel.integrityPolicyId,
        binding: {
          manifestId: manifest.id,
          uploadId: record.transport.uploadId,
          sourceIdentity: record.file.contentIdentity.value,
          chunkIndex,
          startByte: chunk.start,
          endByteExclusive: chunk.end,
          sizeBytes: chunk.size
        },
        local: { ...checksum, role: "local-calculation" }
      },
      transport: { name: "parallel-resume-fake", partNumber: chunkIndex + 1 }
    } satisfies UploadChunkReceipt;
  }));
  record.progress.completedChunkRanges = toRanges(indexes);
  record.progress.uploadedBytes = record.receipts.reduce((total, receipt) => total + receipt.sizeBytes, 0);
  record.progress.nextChunkIndex = [0, 1, 2, 3].find((index) => !indexes.includes(index)) ?? 4;
  return record;
}

function toRanges(indexes: number[]): { startIndex: number; endIndexInclusive: number }[] {
  return [...indexes].sort((a, b) => a - b).reduce<{ startIndex: number; endIndexInclusive: number }[]>((ranges, index) => {
    const previous = ranges.at(-1);
    if (previous && previous.endIndexInclusive + 1 === index) {
      previous.endIndexInclusive = index;
    } else {
      ranges.push({ startIndex: index, endIndexInclusive: index });
    }
    return ranges;
  }, []);
}

function descriptor(index: number, totalBytes: number): ChunkDescriptor {
  const start = index * chunkSize;
  const end = Math.min(start + chunkSize, totalBytes);
  return { index, start, end, size: end - start };
}

function createTransport(uploaded: number[], onResume: () => void): UploadTransport {
  return {
    capabilities: {
      name: "parallel-resume-fake",
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
      attestsChunkChecksum: false,
      supportsPersistentResume: true
    },
    async createSession() { throw new Error("createSession should not run"); },
    async resumeSession({ record }) { onResume(); return { uploadId: record.transport.uploadId }; },
    async uploadChunk({ chunk }) { uploaded.push(chunk.index); },
    async completeSession() {}
  };
}
