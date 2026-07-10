# Public Contracts: React Headless Adapter

```ts
export type ReactIngestStatus = "idle" | "starting" | UploadSessionStatus;

export interface IngestControllerState {
  status: ReactIngestStatus;
  uploadedBytes: number;
  totalBytes: number;
  progress: number;
  snapshot?: UploadSessionSnapshot;
  manifest?: IngestManifest;
  error?: unknown;
  recordId?: string;
  observerFailure?: IngestObserverFailure;
}

export interface IngestController {
  subscribe(listener: () => void): () => void;
  getState(): IngestControllerState;
  start(): Promise<IngestManifest>;
  resume(recordId: string): Promise<IngestManifest>;
  pause(reason?: unknown): void;
  cancel(reason?: unknown): Promise<void>;
}

export function createIngestController(
  file: IngestFileLike,
  options: CreateIngestSessionOptions
): IngestController;

export function IngestProvider(props: {
  controller: IngestController;
  children?: ReactNode;
}): ReactElement;

export function useIngestSession(): IngestControllerState;

export function useUploadProgress(): {
  uploadedBytes: number;
  totalBytes: number;
  progress: number;
};

export function useUploadControls(): {
  start(): Promise<IngestManifest>;
  resume(recordId: string): Promise<IngestManifest>;
  pause(reason?: unknown): void;
  cancel(reason?: unknown): Promise<void>;
  canStart: boolean;
  canPause: boolean;
  canCancel: boolean;
};
```

The subpath renders no visible UI and imports React only when explicitly requested.
