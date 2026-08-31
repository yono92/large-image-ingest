import { describe, expect, it } from "vitest";
import { createBrowserWorkerChecksumExecutor } from "../src/browser";
import { calculateChecksum } from "../src/checksum";

class FakeWorker {
  onerror: ((event: ErrorEvent) => unknown) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => unknown) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => unknown) | null = null;
  terminated = 0;
  readonly requests: unknown[] = [];
  onPost?: () => void;

  postMessage(message: unknown): void {
    this.requests.push(message);
    this.onPost?.();
  }

  terminate(): void {
    this.terminated += 1;
  }

  send(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }
}

describe("browser checksum executor", () => {
  it("uses the packaged module worker URL and completes through the shared contract", async () => {
    const worker = new FakeWorker();
    let workerUrl = "";
    const executor = createBrowserWorkerChecksumExecutor({
      workerFactory(url, options) {
        workerUrl = url.href;
        expect(options).toMatchObject({ type: "module" });
        worker.onPost = () => {
          worker.send({
            type: "progress",
            progress: { loadedBytes: 3, totalBytes: 3, chunkIndex: 0, totalChunks: 1 }
          });
          worker.send({
            type: "complete",
            checksum: {
              algorithm: "sha256",
              calculatedAt: new Date().toISOString(),
              chunkSizeBytes: 64 * 1024,
              scope: "whole-file",
              value: "a".repeat(64)
            }
          });
        };
        return worker as unknown as Worker;
      }
    });
    const progress: number[] = [];
    await expect(calculateChecksum(new File(["abc"], "worker.bin"), {
      chunkSize: 64 * 1024,
      executor,
      onProgress(value) {
        progress.push(value.loadedBytes);
      }
    })).resolves.toMatchObject({ value: "a".repeat(64) });
    expect(workerUrl).toMatch(/checksum-worker-runtime\.js$/);
    expect(progress).toEqual([3]);
    expect(worker.terminated).toBe(1);
  });

  it("reports startup, runtime, and malformed output failures", async () => {
    const file = new File(["abc"], "worker.bin");
    const startup = createBrowserWorkerChecksumExecutor({
      workerFactory() {
        throw new Error("blocked");
      }
    });
    await expect(calculateChecksum(file, { executor: startup })).rejects.toMatchObject({
      code: "checksum.execution_failed"
    });

    for (const mode of ["runtime", "malformed"] as const) {
      const worker = new FakeWorker();
      worker.onPost = () => {
        if (mode === "runtime") worker.onerror?.({} as ErrorEvent);
        else worker.send({ unexpected: true });
      };
      const executor = createBrowserWorkerChecksumExecutor({
        workerFactory: () => worker as unknown as Worker
      });
      await expect(calculateChecksum(file, { executor })).rejects.toMatchObject({
        code: "checksum.execution_failed"
      });
      expect(worker.terminated).toBe(1);
    }
  });

  it("terminates on cancellation and ignores a late completion", async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const executor = createBrowserWorkerChecksumExecutor({
      workerFactory: () => worker as unknown as Worker
    });
    const calculation = calculateChecksum(new File(["abc"], "worker.bin"), {
      executor,
      signal: controller.signal
    });
    controller.abort();
    worker.send({
      type: "complete",
      checksum: {
        algorithm: "sha256",
        calculatedAt: new Date().toISOString(),
        chunkSizeBytes: 4 * 1024 * 1024,
        scope: "whole-file",
        value: "a".repeat(64)
      }
    });
    await expect(calculation).rejects.toMatchObject({ code: "checksum.canceled" });
    expect(worker.terminated).toBe(1);
  });
});
