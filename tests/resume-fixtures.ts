import type {
  ResumeRecord,
  ResumeStore,
  ResumeTransportState,
  UploadChunkContext,
  UploadChunkResult,
  UploadSessionContext,
  UploadSessionResult,
  UploadTransport,
  ResumeSessionContext
} from "../src/types";

export class MemoryResumeStore implements ResumeStore {
  readonly records = new Map<string, ResumeRecord>();

  async get(recordId: string): Promise<ResumeRecord | undefined> {
    return this.records.get(recordId);
  }

  async put(record: ResumeRecord): Promise<void> {
    this.records.set(record.id, structuredClone(record));
  }

  async list(): Promise<ResumeRecord[]> {
    return Array.from(this.records.values(), (record) => structuredClone(record));
  }

  async delete(recordId: string): Promise<void> {
    this.records.delete(recordId);
  }
}

export interface FakeTransportOptions {
  failChunkIndexes?: readonly number[];
  resumeSupported?: boolean;
  resumeResult?: Partial<ResumeTransportState>;
}

export class FakeTransport implements UploadTransport {
  readonly created: UploadSessionContext[] = [];
  readonly resumed: ResumeSessionContext[] = [];
  readonly uploadedChunks: number[] = [];
  readonly completed: string[] = [];

  constructor(private readonly options: FakeTransportOptions = {}) {}

  async createSession(context: UploadSessionContext): Promise<UploadSessionResult> {
    this.created.push(context);
    return { uploadId: `upload-${context.manifest.id}`, resumeToken: "fresh-token" };
  }

  async resumeSession(context: ResumeSessionContext): Promise<UploadSessionResult> {
    if (this.options.resumeSupported === false) {
      throw new Error("Remote resume unsupported.");
    }

    this.resumed.push(context);

    const result: UploadSessionResult = {
      uploadId: context.record.transport.uploadId,
    };

    const resumeToken = this.options.resumeResult?.resumeToken ?? context.record.transport.resumeToken;
    if (resumeToken !== undefined) {
      result.resumeToken = resumeToken;
    }

    const expiresAt = this.options.resumeResult?.expiresAt ?? context.record.transport.expiresAt;
    if (expiresAt !== undefined) {
      result.expiresAt = expiresAt;
    }

    const data = this.options.resumeResult?.data ?? context.record.transport.data;
    if (data !== undefined) {
      result.data = data;
    }

    return result;
  }

  async uploadChunk(context: UploadChunkContext): Promise<void | UploadChunkResult> {
    if (this.options.failChunkIndexes?.includes(context.chunk.index)) {
      throw new Error(`Chunk ${context.chunk.index} failed.`);
    }

    this.uploadedChunks.push(context.chunk.index);
    return { resumeToken: `token-${context.chunk.index}` };
  }

  async completeSession(context: UploadSessionContext & { uploadId: string }): Promise<void> {
    this.completed.push(context.uploadId);
  }
}

export function createLargeTestFile(name = "wafer-aoi-001.tif", bytes = 800 * 1024): File {
  return new File([new Uint8Array(bytes)], name, {
    type: "image/tiff",
    lastModified: Date.UTC(2026, 0, 1)
  });
}
