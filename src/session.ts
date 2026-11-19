import { SessionRuntime } from "./session-runtime.js";
import type {
  CreateIngestSessionOptions,
  IngestFileLike,
  IngestManifest,
  UploadSessionSnapshot
} from "./types.js";

export class LargeImageIngestSession {
  private readonly runtime: SessionRuntime;

  constructor(file: IngestFileLike, options: CreateIngestSessionOptions) {
    this.runtime = new SessionRuntime(file, options);
  }

  abort(reason?: unknown): void {
    this.runtime.abort(reason);
  }

  pause(reason?: unknown): void {
    this.runtime.pause(reason);
  }

  cancel(reason?: unknown): Promise<void> {
    return this.runtime.cancel(reason);
  }

  getSnapshot(): UploadSessionSnapshot | undefined {
    return this.runtime.getSnapshot();
  }

  start(): Promise<IngestManifest> {
    return this.runtime.start();
  }

  resume(recordId: string): Promise<IngestManifest> {
    return this.runtime.resume(recordId);
  }
}

export function createIngestSession(
  file: IngestFileLike,
  options: CreateIngestSessionOptions
): LargeImageIngestSession {
  return new LargeImageIngestSession(file, options);
}
