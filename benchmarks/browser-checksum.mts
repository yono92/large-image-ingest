export interface BrowserOperationResult {
  mode: string; status: string; durationMs: number; sourceSizeBytes: number;
  resultChunkSizeBytes?: number | undefined; checksum?: string; errorCode?: string;
  progressEvents: number; maxLoadedBytes: number; monotonic: boolean; cancelRequested: boolean;
  lateProgressEvents: number; heartbeatCount: number; heartbeatMaxDelayMs: number;
  longTaskCount: number; longTaskMaxMs: number; probeEvents: number;
  heapStartBytes: number | null; heapPeakBytes: number | null; heapEndBytes: number | null;
}
declare global {
  var browserChecksumBenchmark: { run: (mode: string, options: { chunkSizeBytes: number; cancelAfterBytes: number }) => Promise<BrowserOperationResult> };
}
import { createBrowserWorkerChecksumExecutor } from "large-image-ingest/browser";

const sourceInput = document.querySelector<HTMLInputElement>("#source")!;
const probe = document.querySelector<HTMLButtonElement>("#probe")!;
const executor = createBrowserWorkerChecksumExecutor();
let probeEvents = 0;
probe.addEventListener("click", () => { probeEvents += 1; });

function createMonitor() {
  let heartbeatCount = 0;
  let heartbeatMaxDelayMs = 0;
  let longTaskMaxMs = 0;
  let longTaskCount = 0;
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  const heapStartBytes = memory?.usedJSHeapSize ?? null;
  let heapPeakBytes = heapStartBytes;
  let previous = performance.now();
  const observer = typeof PerformanceObserver === "function"
    ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTaskCount += 1;
          longTaskMaxMs = Math.max(longTaskMaxMs, entry.duration);
        }
      })
    : null;
  try {
    observer?.observe({ type: "longtask", buffered: false });
  } catch {
    // Timer drift remains the fallback responsiveness measurement.
  }
  const timer = setInterval(() => {
    const now = performance.now();
    heartbeatMaxDelayMs = Math.max(heartbeatMaxDelayMs, Math.max(0, now - previous - 16));
    previous = now;
    heartbeatCount += 1;
    probe.click();
    if (memory) heapPeakBytes = Math.max(heapPeakBytes ?? 0, memory.usedJSHeapSize);
  }, 16);

  return async function stop() {
    clearInterval(timer);
    await new Promise((resolve) => setTimeout(resolve, 50));
    observer?.disconnect();
    return {
      heartbeatCount,
      heartbeatMaxDelayMs,
      longTaskCount,
      longTaskMaxMs,
      probeEvents,
      heapStartBytes,
      heapPeakBytes,
      heapEndBytes: memory?.usedJSHeapSize ?? null
    };
  };
}

async function run(mode: string, options: { chunkSizeBytes: number; cancelAfterBytes: number }): Promise<BrowserOperationResult> {
  const file = sourceInput.files?.[0];
  if (!file) throw new Error("A real File must be selected before qualification.");
  const controller = new AbortController();
  const progress: number[] = [];
  let monotonic = true;
  let lastLoadedBytes = -1;
  let cancelRequested = false;
  let settled = false;
  let lateProgressEvents = 0;
  const stopMonitor = createMonitor();
  const started = performance.now();

  try {
    const checksum = await executor.calculate(file, {
      algorithm: "sha256",
      chunkSize: options.chunkSizeBytes,
      signal: controller.signal,
      onProgress(value) {
        if (settled) lateProgressEvents += 1;
        if (value.loadedBytes < lastLoadedBytes) monotonic = false;
        lastLoadedBytes = Math.max(lastLoadedBytes, value.loadedBytes);
        progress.push(value.loadedBytes);
        if (
          mode === "cancel" &&
          !cancelRequested &&
          value.loadedBytes >= options.cancelAfterBytes
        ) {
          cancelRequested = true;
          controller.abort();
        }
      }
    });
    settled = true;
    const monitor = await stopMonitor();
    return {
      mode,
      status: "completed",
      durationMs: performance.now() - started,
      sourceSizeBytes: file.size,
      resultChunkSizeBytes: checksum.chunkSizeBytes,
      checksum: checksum.value,
      progressEvents: progress.length,
      maxLoadedBytes: lastLoadedBytes,
      monotonic,
      cancelRequested,
      lateProgressEvents,
      ...monitor
    };
  } catch (error) {
    settled = true;
    const monitor = await stopMonitor();
    return {
      mode,
      status: "failed",
      errorCode: error && typeof error === "object" && "code" in error ? String(error.code) : "unknown",
      durationMs: performance.now() - started,
      sourceSizeBytes: file.size,
      progressEvents: progress.length,
      maxLoadedBytes: lastLoadedBytes,
      monotonic,
      cancelRequested,
      lateProgressEvents,
      ...monitor
    };
  }
}

globalThis.browserChecksumBenchmark = { run };
