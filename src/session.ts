import { planChunks } from "./chunks";
import { createManifest } from "./manifest";
import type {
  CreateIngestSessionOptions,
  IngestEvent,
  IngestFileLike,
  IngestManifest
} from "./types";

export class LargeImageIngestSession {
  private readonly abortController = new AbortController();

  constructor(
    private readonly file: IngestFileLike,
    private readonly options: CreateIngestSessionOptions
  ) {}

  abort(reason?: unknown): void {
    this.abortController.abort(reason);
  }

  async start(): Promise<IngestManifest> {
    let manifest: IngestManifest | undefined;

    try {
      manifest = await createManifest(this.file, this.options);
      this.emit({ type: "validated", manifest });

      if (!manifest.validation.ok) {
        throw new Error("Cannot start upload because validation failed.");
      }

      const session = await this.options.transport.createSession({
        manifest,
        file: this.file,
        signal: this.abortController.signal
      });

      this.emit({ type: "started", manifest, uploadId: session.uploadId });

      const chunkPlan = planChunks(this.file.size, this.options.chunking);
      let uploadedBytes = 0;

      for (const chunk of chunkPlan.chunks) {
        this.throwIfAborted();
        this.emit({ type: "chunk:started", manifestId: manifest.id, chunk });

        await this.uploadChunkWithRetry(manifest, session.uploadId, chunk);

        uploadedBytes += chunk.size;
        this.emit({
          type: "chunk:completed",
          manifestId: manifest.id,
          chunk,
          uploadedBytes,
          totalBytes: this.file.size
        });
      }

      await this.options.transport.completeSession({
        manifest,
        file: this.file,
        signal: this.abortController.signal,
        uploadId: session.uploadId
      });

      this.emit({ type: "completed", manifest, uploadId: session.uploadId });
      return manifest;
    } catch (error) {
      this.emit(
        manifest
          ? { type: "failed", manifestId: manifest.id, error }
          : { type: "failed", error }
      );
      throw error;
    }
  }

  private async uploadChunkWithRetry(
    manifest: IngestManifest,
    uploadId: string,
    chunk: ReturnType<typeof planChunks>["chunks"][number]
  ): Promise<void> {
    const retries = this.options.retries ?? 2;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        this.throwIfAborted();
        await this.options.transport.uploadChunk({
          manifest,
          file: this.file,
          signal: this.abortController.signal,
          uploadId,
          chunk,
          body: this.file.slice(chunk.start, chunk.end)
        });
        return;
      } catch (error) {
        if (attempt >= retries) {
          throw error;
        }

        this.emit({ type: "retry", manifestId: manifest.id, chunk, attempt: attempt + 1, error });
      }
    }
  }

  private throwIfAborted(): void {
    if (this.abortController.signal.aborted) {
      throw this.abortController.signal.reason ?? new Error("Upload aborted.");
    }
  }

  private emit(event: IngestEvent): void {
    this.options.onEvent?.(event);
  }
}

export function createIngestSession(
  file: IngestFileLike,
  options: CreateIngestSessionOptions
): LargeImageIngestSession {
  return new LargeImageIngestSession(file, options);
}
