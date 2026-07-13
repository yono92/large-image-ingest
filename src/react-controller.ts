import { createIngestSession, type LargeImageIngestSession } from "./session.js";
import type {
  CreateIngestSessionOptions,
  IngestEvent,
  IngestFileLike,
  IngestManifest,
  IngestObserverFailure,
  UploadSessionSnapshot,
  UploadSessionStatus
} from "./types.js";

export type ReactIngestStatus = "idle" | "starting" | UploadSessionStatus;

export interface IngestControllerState {
  readonly status: ReactIngestStatus;
  readonly uploadedBytes: number;
  readonly totalBytes: number;
  readonly progress: number;
  readonly snapshot?: UploadSessionSnapshot;
  readonly manifest?: IngestManifest;
  readonly error?: unknown;
  readonly recordId?: string;
  readonly observerFailure?: IngestObserverFailure;
}

export interface IngestController {
  subscribe(listener: () => void): () => void;
  getState(): IngestControllerState;
  start(): Promise<IngestManifest>;
  resume(recordId: string): Promise<IngestManifest>;
  pause(reason?: unknown): void;
  cancel(reason?: unknown): Promise<void>;
}

type Operation = "start" | "resume";

class DefaultIngestController implements IngestController {
  private activeOperation: Promise<IngestManifest> | undefined;
  private activeSession: LargeImageIngestSession | undefined;
  private readonly listeners = new Set<() => void>();
  private state: IngestControllerState;

  constructor(
    private readonly file: IngestFileLike,
    private readonly options: CreateIngestSessionOptions
  ) {
    this.state = {
      status: "idle",
      uploadedBytes: 0,
      totalBytes: file.size,
      progress: 0
    };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getState = (): IngestControllerState => this.state;

  readonly start = (): Promise<IngestManifest> => this.run("start");

  readonly resume = (recordId: string): Promise<IngestManifest> => this.run("resume", recordId);

  readonly pause = (reason?: unknown): void => {
    this.activeSession?.pause(reason);
  };

  readonly cancel = async (reason?: unknown): Promise<void> => {
    await this.activeSession?.cancel(reason);
  };

  private run(operation: Operation, recordId?: string): Promise<IngestManifest> {
    if (this.activeOperation) {
      return this.activeOperation;
    }

    this.publish(operation === "resume"
      ? {
          status: "resuming",
          uploadedBytes: 0,
          totalBytes: this.file.size,
          progress: 0,
          recordId: requireRecordId(recordId)
        }
      : {
          status: "starting",
          uploadedBytes: 0,
          totalBytes: this.file.size,
          progress: 0
        });

    const session = createIngestSession(this.file, this.createSessionOptions());
    this.activeSession = session;
    const operationPromise = operation === "resume"
      ? session.resume(requireRecordId(recordId))
      : session.start();

    this.activeOperation = operationPromise.then((manifest) => {
      this.publish({
        ...this.state,
        status: this.state.snapshot?.status ?? "completed",
        manifest,
        error: undefined
      });
      return manifest;
    }).catch((error: unknown) => {
      this.publish({
        ...this.state,
        status: this.state.snapshot?.status ?? "failed",
        error
      });
      throw error;
    }).finally(() => {
      this.activeOperation = undefined;
    });

    return this.activeOperation;
  }

  private createSessionOptions(): CreateIngestSessionOptions {
    const userOnEvent = this.options.onEvent;
    const userOnObserverError = this.options.onObserverError;
    const userOnSnapshot = this.options.onSnapshot;

    return {
      ...this.options,
      onEvent: (event) => {
        this.handleEvent(event);
        userOnEvent?.(event);
      },
      onObserverError: (failure) => {
        this.publish({ ...this.state, observerFailure: cloneObserverFailure(failure) });
        userOnObserverError?.(failure);
      },
      onSnapshot: (snapshot) => {
        this.handleSnapshot(snapshot);
        userOnSnapshot?.(snapshot);
      }
    };
  }

  private handleEvent(event: IngestEvent): void {
    if (event.type === "resume:available" || event.type === "resume:started") {
      this.publish({ ...this.state, recordId: event.recordId });
    }
  }

  private handleSnapshot(snapshot: UploadSessionSnapshot): void {
    const detached = structuredClone(snapshot);
    this.publish({
      ...this.state,
      status: detached.status,
      uploadedBytes: detached.uploadedBytes,
      totalBytes: detached.totalBytes,
      progress: normalizeProgress(detached.uploadedBytes, detached.totalBytes, detached.status),
      snapshot: detached
    });
  }

  private publish(next: IngestControllerState): void {
    this.state = next;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // React subscribers cannot participate in upload control flow.
      }
    }
  }
}

export function createIngestController(
  file: IngestFileLike,
  options: CreateIngestSessionOptions
): IngestController {
  return new DefaultIngestController(file, options);
}

function normalizeProgress(
  uploadedBytes: number,
  totalBytes: number,
  status: UploadSessionStatus
): number {
  if (totalBytes === 0) {
    return status === "completed" ? 1 : 0;
  }
  return Math.max(0, Math.min(1, uploadedBytes / totalBytes));
}

function requireRecordId(recordId: string | undefined): string {
  if (!recordId) {
    throw new TypeError("A resume record id is required.");
  }
  return recordId;
}

function cloneObserverFailure(failure: IngestObserverFailure): IngestObserverFailure {
  const clone: IngestObserverFailure = {
    observer: failure.observer,
    error: failure.error
  };
  if (failure.eventType !== undefined) {
    clone.eventType = failure.eventType;
  }
  return clone;
}
