import type { CSSProperties, ReactNode } from "react";
import type { IngestController, IngestControllerState } from "../react-controller.js";
import type {
  ChunkPlanOptions,
  IngestErrorCode,
  IngestManifest,
  ResumeStore
} from "../types.js";

export type InspectionUiPhase =
  | "empty"
  | "selected"
  | "validating"
  | "preparing_identity"
  | "creating_upload"
  | "uploading"
  | "pause_requested"
  | "paused"
  | "resuming"
  | "cancel_requested"
  | "canceled"
  | "completing"
  | "transfer_completed"
  | "verified"
  | "verification_failed"
  | "failed";

export type InspectionControlIntent = "start" | "pause" | "resume" | "cancel" | undefined;

export interface SelectedInspectionSource {
  readonly file: File;
  readonly selectionId: string;
  readonly name: string;
  readonly sizeBytes: number;
  readonly mediaType: string;
  readonly lastModified?: number;
}

export type RecoveryCompatibility =
  | "awaiting_source"
  | "compatible"
  | "file_mismatch"
  | "chunking_mismatch"
  | "expired";

export interface RecoveryChoiceSummary {
  readonly key: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly updatedAt: string;
  readonly uploadedBytes: number;
  readonly totalBytes: number;
  readonly transportLabel?: string;
  readonly compatibility: RecoveryCompatibility;
}

export type SafeUiErrorCategory =
  | "validation"
  | "compatibility"
  | "transport"
  | "cancellation"
  | "cleanup"
  | "observer"
  | "verification"
  | "unknown";

export interface SafeUiError {
  readonly category: SafeUiErrorCategory;
  readonly code?: IngestErrorCode | string;
  readonly title: string;
  readonly guidance: string;
  readonly retryable: boolean;
}

export interface VerificationIssue {
  readonly code: string;
  readonly severity: "warning" | "error";
}

export type CompletionVerificationResult =
  | { readonly status: "verified"; readonly checkedAt?: string }
  | {
      readonly status: "failed";
      readonly issues: readonly VerificationIssue[];
      readonly retryable?: boolean;
      readonly checkedAt?: string;
    }
  | {
      readonly status: "unavailable";
      readonly retryable?: boolean;
      readonly checkedAt?: string;
    };

export type VerificationPresentation =
  | { readonly status: "not_configured" }
  | { readonly status: "pending" }
  | { readonly status: "verified"; readonly checkedAt?: string }
  | {
      readonly status: "failed";
      readonly issues: readonly VerificationIssue[];
      readonly retryable: boolean;
      readonly checkedAt?: string;
    }
  | { readonly status: "unavailable"; readonly retryable: boolean; readonly checkedAt?: string };

export interface CompletionVerificationContext {
  readonly source: Omit<SelectedInspectionSource, "file">;
  readonly signal: AbortSignal;
}

export interface CompletionVerificationAdapter {
  verify(
    manifest: IngestManifest,
    context: CompletionVerificationContext
  ): Promise<CompletionVerificationResult>;
}

export interface InspectionRecoveryOptions {
  readonly store: ResumeStore;
  readonly chunking?: ChunkPlanOptions;
  readonly clock?: () => Date;
  readonly confirmDiscard?: (choice: RecoveryChoiceSummary) => boolean | Promise<boolean>;
}

export interface PreviewDerivativeDescriptor {
  readonly kind: "derivative";
  readonly src: string;
  readonly alt?: string;
  readonly decorative?: boolean;
  readonly statusLabel?: string;
}

export interface InspectionUiControls {
  readonly canSelect: boolean;
  readonly canRemove: boolean;
  readonly canStart: boolean;
  readonly canPause: boolean;
  readonly canResume: boolean;
  readonly canCancel: boolean;
  readonly canRetryVerification: boolean;
  readonly canDiscardRecovery: boolean;
}

export interface InspectionUiState {
  readonly phase: InspectionUiPhase;
  readonly source?: SelectedInspectionSource;
  readonly requestedAction?: InspectionControlIntent;
  readonly preparation?: IngestControllerState["preparation"];
  readonly uploadedBytes: number;
  readonly totalBytes: number;
  readonly progress: number;
  readonly recoveryChoices: readonly RecoveryChoiceSummary[];
  readonly selectedRecoveryKey?: string;
  readonly recoveryLoading: boolean;
  readonly error?: SafeUiError;
  readonly verification: VerificationPresentation;
  readonly controls: InspectionUiControls;
}

export interface InspectionUploadActions {
  selectFile(file: File): Promise<void>;
  removeSource(): void;
  start(): Promise<IngestManifest>;
  pause(): void;
  resume(recoveryKey?: string): Promise<IngestManifest>;
  cancel(): Promise<void>;
  refreshRecovery(): Promise<void>;
  discardRecovery(recoveryKey: string): Promise<void>;
  retryVerification(): Promise<void>;
}

export interface InspectionUploadUiValue {
  readonly state: InspectionUiState;
  readonly actions: InspectionUploadActions;
  readonly labels: InspectionUploadLabels;
}

export interface InspectionUploadCallbacks {
  readonly onError?: (error: unknown, safeError: SafeUiError) => void;
  readonly onStateChange?: (state: InspectionUiState) => void;
  readonly onVerificationResult?: (result: CompletionVerificationResult) => void;
  readonly onCallbackError?: (error: unknown) => void;
}

export interface InspectionUploadLabels {
  readonly panelTitle: string;
  readonly panelDescription: string;
  readonly chooseFile: string;
  readonly dropFile: string;
  readonly multipleFilesRejected: string;
  readonly sourceHeading: string;
  readonly sourceDerivative: string;
  readonly validationHeading: string;
  readonly preparationHeading: string;
  readonly progressHeading: string;
  readonly controlsHeading: string;
  readonly recoveryHeading: string;
  readonly verificationHeading: string;
  readonly errorHeading: string;
  readonly start: string;
  readonly pause: string;
  readonly resume: string;
  readonly cancel: string;
  readonly remove: string;
  readonly refreshRecovery: string;
  readonly discardRecovery: string;
  readonly retryVerification: string;
  readonly noSource: string;
  readonly reselectSource: string;
  readonly noRecovery: string;
  readonly transferComplete: string;
  readonly verificationNotConfigured: string;
  readonly verificationPending: string;
  readonly verificationVerified: string;
  readonly verificationFailed: string;
  readonly verificationUnavailable: string;
  readonly phase: Readonly<Record<InspectionUiPhase, string>>;
}

export interface InspectionUploadSlots {
  readonly header?: ReactNode;
  readonly preview?: ReactNode;
  readonly selectionGuidance?: ReactNode;
  readonly recoveryGuidance?: ReactNode;
  readonly terminalActions?: ReactNode;
}

export interface InspectionUploadConfiguration extends InspectionUploadCallbacks {
  readonly createController: (file: File) => IngestController;
  readonly recovery?: InspectionRecoveryOptions;
  readonly verifier?: CompletionVerificationAdapter;
  readonly labels?: Partial<InspectionUploadLabels> & {
    readonly phase?: Partial<Record<InspectionUiPhase, string>>;
  };
}

export interface InspectionUploadProviderProps extends InspectionUploadConfiguration {
  readonly children?: ReactNode;
}

export interface InspectionUploadPanelProps extends InspectionUploadConfiguration {
  readonly accept?: string;
  readonly preview?: PreviewDerivativeDescriptor;
  readonly slots?: InspectionUploadSlots;
  readonly className?: string;
  readonly style?: CSSProperties;
}
