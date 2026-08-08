import { describe, expect, it } from "vitest";
import { calculateChecksum } from "../src/checksum";
import { createWorkerChecksumExecutor } from "../src/checksum-worker";
import { installChecksumWorkerRuntime } from "../src/checksum-worker-runtime";
import type {
  ChecksumWorkerEventListener,
  ChecksumWorkerLike,
  ChecksumWorkerRuntimeScope
} from "../src/types";

describe("worker checksum execution", () => {
  it("matches the default checksum, forwards ordered progress, and preserves source bytes", async () => {
    const file = new File([new Uint8Array(192 * 1024).fill(0x5a)], "worker.bin");
    const before = new Uint8Array(await file.arrayBuffer());
    const linked = createLinkedWorker();
    const dispose = installChecksumWorkerRuntime(linked.scope);
    const progress: number[] = [];
    const executor = createWorkerChecksumExecutor({ workerFactory: () => linked.worker });

    const workerChecksum = await calculateChecksum(file, {
      chunkSize: 64 * 1024,
      executor,
      onProgress(event) {
        progress.push(event.loadedBytes);
      }
    });
    const defaultChecksum = await calculateChecksum(file, { chunkSize: 64 * 1024 });

    expect(workerChecksum.value).toBe(defaultChecksum.value);
    expect(progress).toEqual([64 * 1024, 128 * 1024, 192 * 1024]);
    expect(linked.terminated).toBe(true);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(before);
    dispose();
  });

  it("matches the default checksum for an empty source", async () => {
    const file = new File([], "empty.bin");
    const linked = createLinkedWorker();
    const dispose = installChecksumWorkerRuntime(linked.scope);
    const executor = createWorkerChecksumExecutor({ workerFactory: () => linked.worker });

    const [workerChecksum, defaultChecksum] = await Promise.all([
      calculateChecksum(file, { executor }),
      calculateChecksum(file)
    ]);

    expect(workerChecksum.value).toBe(defaultChecksum.value);
    expect(workerChecksum.value).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    expect(linked.terminated).toBe(true);
    dispose();
  });

  it("terminates on abort and ignores late progress and results", async () => {
    const worker = new ManualWorker();
    const executor = createWorkerChecksumExecutor({ workerFactory: () => worker });
    const controller = new AbortController();
    const progress: number[] = [];
    const promise = calculateChecksum(new File(["abc"], "abc.bin"), {
      executor,
      signal: controller.signal,
      onProgress(event) {
        progress.push(event.loadedBytes);
      }
    });
    const request = worker.posted[0] as { protocol: string; requestId: string };

    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: "checksum.aborted", retryable: false });
    worker.emitMessage({
      protocol: request.protocol,
      type: "progress",
      requestId: request.requestId,
      progress: { loadedBytes: 3, totalBytes: 3, chunkIndex: 0, totalChunks: 1 }
    });
    worker.emitMessage({
      protocol: request.protocol,
      type: "result",
      requestId: request.requestId,
      checksum: {
        algorithm: "sha256",
        calculatedAt: new Date().toISOString(),
        chunkSizeBytes: 64 * 1024,
        scope: "whole-file",
        value: "a".repeat(64)
      }
    });

    expect(worker.terminated).toBe(true);
    expect(progress).toEqual([]);
  });

  it("rejects malformed matching responses and ignores other request ids", async () => {
    const worker = new ManualWorker();
    const executor = createWorkerChecksumExecutor({ workerFactory: () => worker });
    const promise = calculateChecksum(new File(["abc"], "abc.bin"), { executor });
    const request = worker.posted[0] as { protocol: string; requestId: string };

    worker.emitMessage({
      protocol: request.protocol,
      type: "result",
      requestId: "another-request",
      checksum: { secret: "ignored" }
    });
    worker.emitMessage({
      protocol: request.protocol,
      type: "result",
      requestId: request.requestId,
      checksum: { algorithm: "sha256", value: "bad" }
    });

    await expect(promise).rejects.toMatchObject({ code: "checksum.worker_failed", retryable: false });
    expect(worker.terminated).toBe(true);
  });

  it("normalizes worker factory and runtime failures without leaking messages", async () => {
    const factoryExecutor = createWorkerChecksumExecutor({
      workerFactory() {
        throw new Error("secret worker URL https://private.invalid/worker.js");
      }
    });
    const factoryError = await calculateChecksum(new File(["abc"], "abc.bin"), {
      executor: factoryExecutor
    }).catch((error: unknown) => error);
    expect(factoryError).toMatchObject({ code: "checksum.worker_failed" });
    expect(String(factoryError)).not.toContain("private.invalid");

    const worker = new ManualWorker();
    const executor = createWorkerChecksumExecutor({ workerFactory: () => worker });
    const promise = calculateChecksum(new File(["abc"], "abc.bin"), { executor });
    worker.emitError("provider secret");
    await expect(promise).rejects.toMatchObject({ code: "checksum.worker_failed" });
  });
});

class ManualWorker implements ChecksumWorkerLike {
  readonly posted: unknown[] = [];
  readonly listeners = new Map<string, Set<ChecksumWorkerEventListener>>();
  terminated = false;

  postMessage(value: unknown): void {
    this.posted.push(value);
  }

  addEventListener(type: string, listener: ChecksumWorkerEventListener): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: ChecksumWorkerEventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  terminate(): void {
    this.terminated = true;
  }

  emitMessage(data: unknown): void {
    for (const listener of this.listeners.get("message") ?? []) listener({ data });
  }

  emitError(message: string): void {
    for (const listener of this.listeners.get("error") ?? []) listener({ message });
  }
}

function createLinkedWorker(): {
  worker: ChecksumWorkerLike;
  scope: ChecksumWorkerRuntimeScope;
  readonly terminated: boolean;
} {
  const mainListeners = new Map<string, Set<ChecksumWorkerEventListener>>();
  const runtimeListeners = new Set<ChecksumWorkerEventListener>();
  let terminated = false;
  const worker: ChecksumWorkerLike = {
    postMessage(value) {
      queueMicrotask(() => {
        if (!terminated) for (const listener of runtimeListeners) listener({ data: value });
      });
    },
    addEventListener(type, listener) {
      const listeners = mainListeners.get(type) ?? new Set();
      listeners.add(listener);
      mainListeners.set(type, listeners);
    },
    removeEventListener(type, listener) {
      mainListeners.get(type)?.delete(listener);
    },
    terminate() {
      terminated = true;
    }
  };
  const scope: ChecksumWorkerRuntimeScope = {
    postMessage(value) {
      queueMicrotask(() => {
        if (!terminated) for (const listener of mainListeners.get("message") ?? []) listener({ data: value });
      });
    },
    addEventListener(_type, listener) {
      runtimeListeners.add(listener);
    },
    removeEventListener(_type, listener) {
      runtimeListeners.delete(listener);
    }
  };
  return {
    worker,
    scope,
    get terminated() {
      return terminated;
    }
  };
}
