import type {
  IngestQueueRecord,
  IngestQueueStore,
  UploadChunkContext,
  UploadCompletionContext,
  UploadSessionContext,
  UploadSessionResult,
  UploadTransport
} from "../src/types";

export class MemoryQueueStore implements IngestQueueStore {
  readonly records = new Map<string, IngestQueueRecord>();
  failPutStatus?: IngestQueueRecord["status"];
  failList = false;

  async get(id: string): Promise<IngestQueueRecord | undefined> {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }

  async put(record: IngestQueueRecord): Promise<void> {
    if (record.status === this.failPutStatus) throw new Error("secret store failure");
    this.records.set(record.id, structuredClone(record));
  }

  async list(): Promise<IngestQueueRecord[]> {
    if (this.failList) throw new Error("secret list failure");
    return [...this.records.values()].map((record) => structuredClone(record));
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }
}

export class GateTransport implements UploadTransport {
  readonly waiting: Array<{ resolve(): void; reject(error: unknown): void }> = [];
  createCalls = 0;
  completeCalls = 0;

  constructor(
    readonly itemId: string,
    private readonly starts: string[] = [],
    private readonly fail = false
  ) {}

  async createSession(_context: UploadSessionContext): Promise<UploadSessionResult> {
    this.createCalls += 1;
    this.starts.push(this.itemId);
    return { uploadId: `upload-${this.itemId}` };
  }

  async uploadChunk(context: UploadChunkContext): Promise<void> {
    if (this.fail) throw Object.assign(new Error("secret provider failure"), {
      code: "transport.failed",
      retryable: true
    });
    await new Promise<void>((resolve, reject) => {
      const waiter = { resolve, reject };
      this.waiting.push(waiter);
      context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true });
    });
  }

  async completeSession(_context: UploadCompletionContext): Promise<void> {
    this.completeCalls += 1;
  }

  releaseAll(): void {
    for (const waiter of this.waiting.splice(0)) waiter.resolve();
  }
}

export function createQueueFile(
  name: string,
  size: number,
  lastModified = Date.UTC(2026, 0, 1)
): File {
  return new File([new Uint8Array(size)], name, {
    type: "image/tiff",
    lastModified
  });
}

export async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Timed out waiting for queue condition.");
}
