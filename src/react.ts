import {
  createContext,
  createElement,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode
} from "react";
import type { IngestManifest } from "./types.js";
import {
  createIngestController,
  type IngestController,
  type IngestControllerState
} from "./react-controller.js";
import type {
  VerifiedIngestController
} from "./react-workflow-controller.js";
import type {
  VerifiedIngestRunResult,
  VerifiedIngestTerminalState,
  VerifiedIngestWorkflowState
} from "./workflow-types.js";

export { createIngestController } from "./react-controller.js";
export type {
  IngestController,
  IngestControllerState,
  IngestPreparationPhase,
  IngestPreparationProgress,
  ReactIngestStatus
} from "./react-controller.js";
export { createVerifiedIngestController } from "./react-workflow-controller.js";
export type { VerifiedIngestController } from "./react-workflow-controller.js";

export interface IngestProviderProps {
  controller: IngestController;
  children?: ReactNode | undefined;
}

export interface UploadProgressState {
  uploadedBytes: number;
  totalBytes: number;
  progress: number;
}

export interface UploadControls {
  start(): Promise<IngestManifest>;
  resume(recordId: string): Promise<IngestManifest>;
  pause(reason?: unknown): void;
  cancel(reason?: unknown): Promise<void>;
  canStart: boolean;
  canPause: boolean;
  canCancel: boolean;
}

const IngestControllerContext = createContext<IngestController | undefined>(undefined);
const VerifiedIngestControllerContext = createContext<VerifiedIngestController | undefined>(undefined);

export interface VerifiedIngestProviderProps {
  controller: VerifiedIngestController;
  children?: ReactNode | undefined;
}

export interface VerifiedIngestActions {
  start(): Promise<VerifiedIngestRunResult>;
  resume(workflowId: string): Promise<VerifiedIngestRunResult>;
  retry(): Promise<VerifiedIngestRunResult>;
  pause(reason?: unknown): void;
  cancel(reason?: unknown): Promise<VerifiedIngestTerminalState>;
}

export function IngestProvider({ controller, children }: IngestProviderProps): ReactElement {
  return createElement(IngestControllerContext.Provider, { value: controller }, children);
}

export function VerifiedIngestProvider({
  controller,
  children
}: VerifiedIngestProviderProps): ReactElement {
  return createElement(VerifiedIngestControllerContext.Provider, { value: controller }, children);
}

export function useVerifiedIngestState(): VerifiedIngestWorkflowState {
  const controller = useRequiredVerifiedController();
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
}

export function useVerifiedIngestActions(): VerifiedIngestActions {
  const controller = useRequiredVerifiedController();
  return useMemo(() => ({
    start: controller.start,
    resume: controller.resume,
    retry: controller.retry,
    pause: controller.pause,
    cancel: controller.cancel
  }), [controller]);
}

export function useIngestSession(): IngestControllerState {
  const controller = useRequiredController();
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
}

export function useUploadProgress(): UploadProgressState {
  const { uploadedBytes, totalBytes, progress } = useIngestSession();
  return useMemo(() => ({ uploadedBytes, totalBytes, progress }), [uploadedBytes, totalBytes, progress]);
}

export function useUploadControls(): UploadControls {
  const controller = useRequiredController();
  const { status } = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const canStart = status === "idle" || status === "failed" || status === "completed" || status === "canceled";
  const canPause = status === "uploading" || status === "resuming";
  const canCancel = status === "starting" || canPause || status === "completing" || status === "paused";

  return useMemo(() => ({
    start: controller.start,
    resume: controller.resume,
    pause: controller.pause,
    cancel: controller.cancel,
    canStart,
    canPause,
    canCancel
  }), [controller, canStart, canPause, canCancel]);
}

function useRequiredController(): IngestController {
  const controller = useContext(IngestControllerContext);
  if (!controller) {
    throw new Error("large-image-ingest React hooks must be used inside IngestProvider.");
  }
  return controller;
}

function useRequiredVerifiedController(): VerifiedIngestController {
  const controller = useContext(VerifiedIngestControllerContext);
  if (!controller) {
    throw new Error("large-image-ingest verified workflow hooks must be used inside VerifiedIngestProvider.");
  }
  return controller;
}
