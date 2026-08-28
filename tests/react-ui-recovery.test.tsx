import { describe, expect, it } from "vitest";
import { createManifest } from "../src/manifest";
import {
  createResumeChunkingIdentity,
  createResumeFileIdentity,
  createResumeRecord
} from "../src/resume";
import { InspectionUploadCoordinator } from "../src/react-ui/coordinator";
import type { ResumeRecord, ResumeStore } from "../src/types";
import { FakeController } from "./react-ui-fixtures";

describe("first-party React UI recovery", () => {
  it("projects safe summaries and resumes only a compatible reselected source", async () => {
    const file = createFile("recoverable.tif");
    const record = await createRecord(file);
    const store = new TestResumeStore([record]);
    const controllers: FakeController[] = [];
    const coordinator = new InspectionUploadCoordinator({
      createController(selected) {
        const controller = new FakeController(selected);
        controllers.push(controller);
        return controller;
      },
      recovery: { store, chunking: { chunkSize: 256 * 1024 } }
    });

    await coordinator.actions.refreshRecovery();
    const awaiting = coordinator.getValue().state.recoveryChoices[0];
    expect(awaiting).toMatchObject({
      fileName: "recoverable.tif",
      compatibility: "awaiting_source",
      uploadedBytes: 0
    });
    expect(awaiting).not.toHaveProperty("manifest");
    expect(awaiting).not.toHaveProperty("uploadId");
    expect(JSON.stringify(awaiting)).not.toContain("secret-upload-id");

    await coordinator.actions.selectFile(file);
    expect(coordinator.getValue().state.recoveryChoices[0]?.compatibility).toBe("compatible");
    expect(coordinator.getValue().state.controls.canResume).toBe(true);
    await coordinator.actions.resume();
    expect(controllers[0]?.getState().status).toBe("completed");

    await coordinator.actions.selectFile(createFile("mismatch.tif"));
    expect(coordinator.getValue().state.recoveryChoices[0]?.compatibility).toBe("file_mismatch");
    expect(coordinator.getValue().state.controls.canResume).toBe(false);
  });

  it("ignores a stale recovery list after a newer refresh", async () => {
    const first = createDeferred<ResumeRecord[]>();
    const second = createDeferred<ResumeRecord[]>();
    let calls = 0;
    const store: ResumeStore = {
      get: async () => undefined,
      put: async () => undefined,
      delete: async () => undefined,
      list: () => (++calls === 1 ? first.promise : second.promise)
    };
    const coordinator = new InspectionUploadCoordinator({
      createController: (file) => new FakeController(file),
      recovery: { store }
    });
    const oldRecord = await createRecord(createFile("old.tif"));
    const newRecord = await createRecord(createFile("new.tif"));

    const oldRefresh = coordinator.actions.refreshRecovery();
    const newRefresh = coordinator.actions.refreshRecovery();
    second.resolve([newRecord]);
    await newRefresh;
    first.resolve([oldRecord]);
    await oldRefresh;

    expect(coordinator.getValue().state.recoveryChoices.map((choice) => choice.fileName)).toEqual(["new.tif"]);
  });

  it("keeps multiple matches explicit and classifies chunking mismatch and expiry safely", async () => {
    const file = createFile("same.tif");
    const first = await createRecord(file, "first");
    const second = await createRecord(file, "second");
    const expired = await createRecord(createFile("expired.tif"), "expired", "2020-01-01T00:00:00.000Z");
    const store = new TestResumeStore([first, second, expired]);
    const coordinator = new InspectionUploadCoordinator({
      createController: (selected) => new FakeController(selected),
      recovery: {
        store,
        chunking: { chunkSize: 256 * 1024 },
        clock: () => new Date("2026-01-01T00:00:00.000Z"),
        confirmDiscard: () => true
      }
    });

    await coordinator.actions.refreshRecovery();
    await coordinator.actions.selectFile(file);
    expect(coordinator.getValue().state.recoveryChoices.filter((choice) => choice.compatibility === "compatible")).toHaveLength(2);
    expect(coordinator.getValue().state.selectedRecoveryKey).toBeUndefined();
    expect(coordinator.getValue().state.recoveryChoices.find((choice) => choice.fileName === "expired.tif")?.compatibility).toBe("expired");

    const key = coordinator.getValue().state.recoveryChoices[0]?.key;
    if (!key) throw new Error("Expected a recovery choice.");
    await coordinator.actions.discardRecovery(key);
    expect((await store.list()).some((record) => record.id === first.id)).toBe(false);

    const mismatchCoordinator = new InspectionUploadCoordinator({
      createController: (selected) => new FakeController(selected),
      recovery: { store: new TestResumeStore([second]), chunking: { chunkSize: 512 * 1024 } }
    });
    await mismatchCoordinator.actions.refreshRecovery();
    await mismatchCoordinator.actions.selectFile(file);
    expect(mismatchCoordinator.getValue().state.recoveryChoices[0]?.compatibility).toBe("chunking_mismatch");
    expect(mismatchCoordinator.getValue().state.controls.canResume).toBe(false);
  });

  it("rejects recovery store failures with the original error and a safe rendered category", async () => {
    const failure = Object.assign(new Error("secret browser record failed"), {
      code: "resume.store_failed",
      retryable: false
    });
    const coordinator = new InspectionUploadCoordinator({
      createController: (file) => new FakeController(file),
      recovery: {
        store: {
          get: async () => undefined,
          put: async () => undefined,
          delete: async () => undefined,
          list: async () => { throw failure; }
        }
      }
    });

    await expect(coordinator.actions.refreshRecovery()).rejects.toBe(failure);
    expect(coordinator.getValue().state.error).toMatchObject({ category: "cleanup", code: "resume.store_failed" });
    expect(JSON.stringify(coordinator.getValue().state.error)).not.toContain("secret browser record failed");
  });
});

class TestResumeStore implements ResumeStore {
  constructor(private records: ResumeRecord[]) {}
  async get(recordId: string): Promise<ResumeRecord | undefined> { return this.records.find((record) => record.id === recordId); }
  async put(record: ResumeRecord): Promise<void> { this.records = [...this.records.filter((item) => item.id !== record.id), record]; }
  async list(): Promise<ResumeRecord[]> { return [...this.records]; }
  async delete(recordId: string): Promise<void> { this.records = this.records.filter((record) => record.id !== recordId); }
}

async function createRecord(
  file: File,
  suffix = file.name,
  expiresAt?: string
): Promise<ResumeRecord> {
  const manifest = await createManifest(file, { checksum: false, chunking: { chunkSize: 256 * 1024 } });
  return createResumeRecord({
    id: `resume-${suffix}`,
    manifest,
    file: await createResumeFileIdentity(file),
    chunking: createResumeChunkingIdentity(file.size, { chunkSize: 256 * 1024 }),
    transport: {
      name: "local-reference",
      uploadId: "secret-upload-id",
      resumeToken: "secret",
      ...(expiresAt ? { expiresAt } : {})
    }
  });
}

function createFile(name: string): File {
  return new File([new Uint8Array(128)], name, { type: "image/tiff", lastModified: Date.UTC(2026, 0, 1) });
}

function createDeferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}
