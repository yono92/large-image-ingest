import { describe, expect, it } from "vitest";
import {
  classifyPersistentResume,
  createContentSourceIdentity,
  createPersistentResumeRecord,
  createResumeChunkingIdentity,
  createResumeFileIdentity
} from "../src/resume.js";
import { createIngestSession } from "../src/session.js";
import {
  createDomainProfileReference,
  evaluateDomainValidationProfile,
  loadBundledDomainProfile
} from "../src/profiles.js";
import type {
  DomainProfileSessionBinding,
  IngestFileLike,
  ResumeRecord,
  ResumeStore,
  TransportSession,
  UploadChunkReceipt,
  UploadTransport
} from "../src/types.js";
import { profileManifest, structuralEvidence } from "./domain-profile-fixtures.js";

class MemoryStore implements ResumeStore {
  readonly records = new Map<string, ResumeRecord>();
  async get(id: string): Promise<ResumeRecord | undefined> {
    const value = this.records.get(id);
    return value ? structuredClone(value) : undefined;
  }
  async put(record: ResumeRecord): Promise<void> {
    this.records.set(record.id, structuredClone(record));
  }
  async list(): Promise<ResumeRecord[]> {
    return [...this.records.values()].map((record) => structuredClone(record));
  }
  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }
}

function transport(calls: { create: number; resume: number; upload: number }): UploadTransport {
  return {
    capabilities: {
      name: "profile-test",
      resumable: true,
      abortable: true,
      expires: false,
      supportsParallelChunks: false,
      supportsChunkChecksum: false,
      supportsSnapshotResume: true,
      supportsPersistentResume: true
    },
    async createSession(): Promise<TransportSession> {
      calls.create += 1;
      return {
        uploadId: "upload-profile-test",
        transportName: "profile-test",
        createdAt: "2026-08-31T00:00:00.000Z"
      };
    },
    async resumeSession(): Promise<TransportSession> {
      calls.resume += 1;
      return {
        uploadId: "upload-profile-test",
        transportName: "profile-test",
        createdAt: "2026-08-31T00:00:00.000Z"
      };
    },
    async uploadChunk({ chunk, body }): Promise<UploadChunkReceipt> {
      calls.upload += 1;
      return {
        chunkIndex: chunk.index,
        sizeBytes: body.size,
        completedAt: "2026-08-31T00:00:00.000Z",
        transport: { name: "profile-test" }
      };
    },
    async completeSession(): Promise<void> {}
  };
}

describe("domain profile session and resume authority", () => {
  it("blocks a mismatched binding before transport session creation", async () => {
    const fixture = await profileManifest("semiconductor");
    const profile = await loadBundledDomainProfile("semiconductor-inspection");
    const evaluation = await evaluateDomainValidationProfile({
      profile,
      manifest: fixture.manifest,
      structuralEvidence: structuralEvidence("semiconductor")
    });
    const binding = structuredClone(evaluation.sessionBinding!);
    binding.manifestId = "different-manifest";
    const calls = { create: 0, resume: 0, upload: 0 };
    await expect(createIngestSession(fixture.file, {
      manifest: fixture.manifest,
      domainProfile: binding,
      transport: transport(calls)
    }).start()).rejects.toMatchObject({ code: "profile.binding_invalid" });
    expect(calls).toEqual({ create: 0, resume: 0, upload: 0 });
  });

  it("persists only the safe profile reference in a new resume record", async () => {
    const fixture = await profileManifest("semiconductor");
    const profile = await loadBundledDomainProfile("semiconductor-inspection");
    const evaluation = await evaluateDomainValidationProfile({
      profile,
      manifest: fixture.manifest,
      structuralEvidence: structuralEvidence("semiconductor")
    });
    const store = new MemoryStore();
    const calls = { create: 0, resume: 0, upload: 0 };
    await createIngestSession(fixture.file, {
      manifest: fixture.manifest,
      domainProfile: evaluation.sessionBinding!,
      resume: { store, cleanup: "mark-complete" },
      transport: transport(calls)
    }).start();
    const [record] = await store.list();
    expect(record?.domainProfile).toEqual(evaluation.profile);
    expect(JSON.stringify(record?.domainProfile)).not.toContain("rules");
    expect(calls.create).toBe(1);
  });

  it("classifies a profile mismatch before reading the selected source", async () => {
    const fixture = await profileManifest("semiconductor");
    const semiconductor = await loadBundledDomainProfile("semiconductor-inspection");
    const microscopy = await loadBundledDomainProfile("microscopy-acquisition");
    const record = createPersistentResumeRecord({
      manifest: fixture.manifest,
      file: await createResumeFileIdentity(fixture.file),
      contentIdentity: await createContentSourceIdentity(fixture.file),
      chunking: createResumeChunkingIdentity(fixture.file.size, {
        chunkSize: fixture.manifest.chunking.chunkSizeBytes
      }),
      transport: { name: "profile-test", uploadId: "upload-profile-test" },
      domainProfile: createDomainProfileReference(semiconductor)
    });
    class NoReadBlob extends Blob {
      override slice(): Blob {
        throw new Error("source should not be read for a profile mismatch");
      }
    }
    const selected = new NoReadBlob(["domain-profile-source"], { type: "image/tiff" });
    Object.defineProperties(selected, {
      name: { value: fixture.file.name },
      lastModified: { value: fixture.file.lastModified }
    });
    await expect(classifyPersistentResume(record, selected as IngestFileLike, {
      chunkSize: fixture.manifest.chunking.chunkSizeBytes,
      domainProfile: createDomainProfileReference(microscopy)
    })).resolves.toMatchObject({
      status: "restart_only",
      reason: "profile_mismatch"
    });
  });

  it("blocks persistent resume mismatch before resumeSession, upload, or source hashing", async () => {
    const fixture = await profileManifest("semiconductor");
    const semiconductor = await loadBundledDomainProfile("semiconductor-inspection");
    const microscopy = await loadBundledDomainProfile("microscopy-acquisition");
    const record = createPersistentResumeRecord({
      id: "profile-mismatch-record",
      manifest: fixture.manifest,
      file: await createResumeFileIdentity(fixture.file),
      contentIdentity: await createContentSourceIdentity(fixture.file),
      chunking: createResumeChunkingIdentity(fixture.file.size, {
        chunkSize: fixture.manifest.chunking.chunkSizeBytes
      }),
      transport: { name: "profile-test", uploadId: "upload-profile-test" },
      domainProfile: createDomainProfileReference(semiconductor)
    });
    const store = new MemoryStore();
    await store.put(record);
    const calls = { create: 0, resume: 0, upload: 0 };
    const binding: DomainProfileSessionBinding = {
      schemaVersion: "large-image-ingest.domain-profile-binding.v1",
      manifestId: fixture.manifest.id,
      result: "passed",
      profile: createDomainProfileReference(microscopy)
    };
    class NoReadBlob extends Blob {
      override slice(): Blob {
        throw new Error("source should not be read for a profile mismatch");
      }
    }
    const selected = new NoReadBlob(["domain-profile-source"], { type: "image/tiff" });
    Object.defineProperties(selected, {
      name: { value: fixture.file.name },
      lastModified: { value: fixture.file.lastModified }
    });
    await expect(createIngestSession(selected as IngestFileLike, {
      manifest: fixture.manifest,
      chunking: { chunkSize: fixture.manifest.chunking.chunkSizeBytes },
      domainProfile: binding,
      resume: { store },
      transport: transport(calls)
    }).resume(record.id)).rejects.toMatchObject({ code: "resume.profile_mismatch" });
    expect(calls).toEqual({ create: 0, resume: 0, upload: 0 });
  });

  it("preserves legacy no-profile behavior when no profile is selected", async () => {
    const fixture = await profileManifest("semiconductor");
    const calls = { create: 0, resume: 0, upload: 0 };
    await createIngestSession(fixture.file, {
      manifest: fixture.manifest,
      transport: transport(calls)
    }).start();
    expect(calls.create).toBe(1);
    expect(calls.upload).toBeGreaterThan(0);
  });
});
