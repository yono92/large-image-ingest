import { createIngestSession, type LargeImageIngestSession } from "./session.js";
import type {
  ChecksumProgress,
  CreateIngestSessionOptions,
  IngestEvent,
  IngestFileLike,
  IngestManifest,
  IngestObserverFailure,
  UploadSessionSnapshot,
  UploadSessionStatus
} from "./types.js";

export type ReactIngestStatus = "idle" | "starting" | UploadSessionStatus;

export type IngestPreparationPhase =
  | "validating"
  | "preparing_identity"
  | "creating_upload";

export interface IngestPreparationProgress {
  readonly phase: IngestPreparationPhase;
  readonly processedBytes?: number;
  readonly totalBytes: number;
  readonly progress?: number;
}

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
  readonly preparation?: IngestPreparationProgress;
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
  private currentOperation: Operation | undefined;
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

    this.currentOperation = operation;

    if (operation === "start") {
      this.publish({
        ...this.state,
        status: "validating",
        preparation: {
          phase: "validating",
          totalBytes: this.file.size
        }
      });
    }

    const session = createIngestSession(this.file, this.createSessionOptions());
    this.activeSession = session;
    const operationPromise = operation === "resume"
      ? session.resume(requireRecordId(recordId))
      : session.start();

    if (operation === "start") {
      this.publish({
        ...this.state,
        preparation: {
          phase: "preparing_identity",
          totalBytes: this.file.size
        }
      });
    }

    this.activeOperation = operationPromise.then((manifest) => {
      this.publish({
        ...this.state,
        status: this.state.snapshot?.status ?? "completed",
        manifest,
        error: undefined
      });
      return manifest;
    }).catch((error: unknown) => {
      const { preparation: _finishedPreparation, ...currentState } = this.state;
      this.publish({
        ...currentState,
        status: this.state.snapshot?.status ?? statusFromOperationError(error),
        error
      });
      throw error;
    }).finally(() => {
      this.activeOperation = undefined;
      this.currentOperation = undefined;
    });

    return this.activeOperation;
  }

  private createSessionOptions(): CreateIngestSessionOptions {
    const userOnEvent = this.options.onEvent;
    const userOnObserverError = this.options.onObserverError;
    const userOnSnapshot = this.options.onSnapshot;
    const checksum = this.options.checksum;
    const userOnChecksumProgress = checksum === false ? undefined : checksum?.onProgress;

    return {
      ...this.options,
      checksum: checksum === false
        ? false
        : {
            ...checksum,
            onProgress: (progress) => {
              this.handleChecksumProgress(progress);
              userOnChecksumProgress?.(progress);
            }
          },
      onEvent: (event) => {
        try {
          this.handleEvent(event);
        } catch (error) {
          this.reportInternalObserverFailure({
            observer: "event",
            eventType: event.type,
            error
          }, userOnObserverError);
        }
        userOnEvent?.(event);
      },
      onObserverError: (failure) => {
        this.publish({ ...this.state, observerFailure: cloneObserverFailure(failure) });
        userOnObserverError?.(failure);
      },
      onSnapshot: (snapshot) => {
        try {
          this.handleSnapshot(snapshot);
        } catch (error) {
          this.reportInternalObserverFailure({ observer: "snapshot", error }, userOnObserverError);
        }
        userOnSnapshot?.(snapshot);
      }
    };
  }

  private handleEvent(event: IngestEvent): void {
    if (event.type === "validated" && this.currentOperation === "start") {
      this.publish({
        ...this.state,
        status: "creating",
        preparation: {
          phase: "creating_upload",
          totalBytes: this.file.size
        }
      });
    }

    if (event.type === "resume:available" || event.type === "resume:started") {
      this.publish({ ...this.state, recordId: event.recordId });
    }
  }

  private handleChecksumProgress(progress: ChecksumProgress): void {
    this.publish({
      ...this.state,
      status: "validating",
      preparation: {
        phase: "preparing_identity",
        processedBytes: progress.loadedBytes,
        totalBytes: progress.totalBytes,
        progress: normalizePreparationProgress(progress.loadedBytes, progress.totalBytes)
      }
    });
  }

  private reportInternalObserverFailure(
    failure: IngestObserverFailure,
    userOnObserverError: CreateIngestSessionOptions["onObserverError"]
  ): void {
    this.publish({ ...this.state, observerFailure: cloneObserverFailure(failure) });
    try {
      userOnObserverError?.(failure);
    } catch {
      // Observer error reporting cannot participate in upload control flow.
    }
  }

  private handleSnapshot(snapshot: UploadSessionSnapshot): void {
    const detached = structuredClone(snapshot);
    const { preparation: _completedPreparation, ...currentState } = this.state;
    this.publish({
      ...currentState,
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

function statusFromOperationError(error: unknown): UploadSessionStatus {
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "transport.canceled") return "canceled";
    if (error.code === "transport.paused") return "paused";
  }
  return "failed";
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

function normalizePreparationProgress(processedBytes: number, totalBytes: number): number {
  if (totalBytes === 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, processedBytes / totalBytes));
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
