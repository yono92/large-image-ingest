import { describe, expect, it } from "vitest";
import { InspectionUploadCoordinator } from "../src/react-ui/coordinator";
import { toSafeUiError } from "../src/react-ui/safe-error";
import { FakeController } from "./react-ui-fixtures";

describe("first-party React UI coordinator", () => {
  it("maps typed failures without exposing raw messages or provider evidence", () => {
    const raw = Object.assign(new Error("https://secret.invalid/upload?token=credential"), {
      code: "transport.failed",
      retryable: true,
      details: { objectKey: "customer/private.tif" }
    });
    const safe = toSafeUiError(raw);

    expect(safe).toEqual({
      category: "transport",
      code: "transport.failed",
      title: "Upload transport failed",
      guidance: "Retry when available, or cancel and safely replace the source.",
      retryable: true
    });
    expect(JSON.stringify(safe)).not.toContain("secret.invalid");
    expect(JSON.stringify(safe)).not.toContain("objectKey");
  });

  it("creates one controller per exact File and derives acknowledged state only", async () => {
    const firstFile = createFile("first.tif");
    const secondFile = createFile("second.tif");
    const created: File[] = [];
    const controllers: FakeController[] = [];
    const coordinator = new InspectionUploadCoordinator({
      createController(file) {
        created.push(file);
        const controller = new FakeController(file);
        controllers.push(controller);
        return controller;
      }
    });

    await coordinator.actions.selectFile(firstFile);
    expect(created).toEqual([firstFile]);
    expect(coordinator.getValue().state.source?.file).toBe(firstFile);
    expect(coordinator.getValue().state.controls.canStart).toBe(true);

    controllers[0]?.setState({ status: "uploading", uploadedBytes: 10, totalBytes: 100, progress: 0.1 });
    expect(coordinator.getValue().state).toMatchObject({
      phase: "uploading",
      uploadedBytes: 10,
      totalBytes: 100,
      progress: 0.1,
      controls: { canPause: true, canCancel: true, canSelect: false }
    });
    await expect(coordinator.actions.selectFile(secondFile)).rejects.toThrow("Cancel the active ingest");
    expect(created).toEqual([firstFile]);

    controllers[0]?.setState({ status: "completed", uploadedBytes: 100, totalBytes: 100, progress: 1 });
    await coordinator.actions.selectFile(secondFile);
    expect(created).toEqual([firstFile, secondFile]);
    expect(coordinator.getValue().state.source?.file).toBe(secondFile);
  });

  it("ignores stale verification and preserves original failures for callbacks", async () => {
    const deferred = createDeferred<{ status: "verified" }>();
    const callbackErrors: unknown[] = [];
    const controllers: FakeController[] = [];
    const coordinator = new InspectionUploadCoordinator({
      createController(file) {
        const controller = new FakeController(file);
        controllers.push(controller);
        return controller;
      },
      onError(error) {
        callbackErrors.push(error);
      },
      verifier: { verify: () => deferred.promise }
    });
    const first = createFile("first.tif");
    await coordinator.actions.selectFile(first);
    await coordinator.actions.start();
    expect(coordinator.getValue().state.verification.status).toBe("pending");

    await coordinator.actions.selectFile(createFile("replacement.tif"));
    deferred.resolve({ status: "verified" });
    await Promise.resolve();
    expect(coordinator.getValue().state.phase).toBe("selected");
    expect(coordinator.getValue().state.verification.status).toBe("not_configured");

    const failure = Object.assign(new Error("private provider URL"), {
      code: "transport.failed",
      retryable: false
    });
    controllers[1]?.fail(failure);
    expect(callbackErrors).toContain(failure);
    expect(coordinator.getValue().state.error?.guidance).not.toContain("private provider URL");
  });
});

function createFile(name: string): File {
  return new File([new Uint8Array(128)], name, {
    type: "image/tiff",
    lastModified: Date.UTC(2026, 0, 1)
  });
}

function createDeferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}
