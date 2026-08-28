import { Component, type ErrorInfo, type ReactElement, type ReactNode } from "react";
import { useInspectionUploadUi } from "./context.js";
import { InspectionErrorNotice } from "./InspectionErrorNotice.js";
import { InspectionFileDropzone } from "./InspectionFileDropzone.js";
import { InspectionPreparationProgress } from "./InspectionPreparationProgress.js";
import { InspectionRecoveryPrompt } from "./InspectionRecoveryPrompt.js";
import { InspectionSourceCard } from "./InspectionSourceCard.js";
import { InspectionUploadControls } from "./InspectionUploadControls.js";
import { InspectionUploadProgress } from "./InspectionUploadProgress.js";
import { InspectionUploadProvider } from "./InspectionUploadProvider.js";
import { InspectionValidationSummary } from "./InspectionValidationSummary.js";
import { InspectionVerificationStatus } from "./InspectionVerificationStatus.js";
import type { InspectionUploadPanelProps } from "./types.js";

export function InspectionUploadPanel(props: InspectionUploadPanelProps): ReactElement {
  const {
    accept,
    className,
    preview,
    slots,
    style,
    ...configuration
  } = props;
  return (
    <InspectionUploadProvider {...configuration}>
      <PanelLayout
        accept={accept}
        className={className}
        preview={preview}
        slots={slots}
        style={style}
        onSlotError={configuration.onCallbackError}
      />
    </InspectionUploadProvider>
  );
}

interface PanelLayoutProps {
  readonly accept?: InspectionUploadPanelProps["accept"] | undefined;
  readonly className?: InspectionUploadPanelProps["className"] | undefined;
  readonly preview?: InspectionUploadPanelProps["preview"] | undefined;
  readonly slots?: InspectionUploadPanelProps["slots"] | undefined;
  readonly style?: InspectionUploadPanelProps["style"] | undefined;
  readonly onSlotError?: ((error: unknown) => void) | undefined;
}

function PanelLayout({ accept, className, preview, slots, style, onSlotError }: PanelLayoutProps): ReactElement {
  const { labels, state } = useInspectionUploadUi();
  const rootClassName = className ? `lii-panel ${className}` : "lii-panel";
  return (
    <article className={rootClassName} style={style} data-lii-phase={state.phase}>
      <header className="lii-panel-header">
        <SlotBoundary onError={onSlotError}>{slots?.header}</SlotBoundary>
        {!slots?.header ? <><h1>{labels.panelTitle}</h1><p>{labels.panelDescription}</p></> : null}
      </header>
      <p className="lii-live-region" aria-live="polite" aria-atomic="true">{labels.phase[state.phase]}</p>
      <InspectionErrorNotice />
      <InspectionFileDropzone accept={accept} guidance={<SlotBoundary onError={onSlotError}>{slots?.selectionGuidance}</SlotBoundary>} />
      <div className="lii-grid">
        <InspectionSourceCard preview={preview} previewSlot={<SlotBoundary onError={onSlotError}>{slots?.preview}</SlotBoundary>} />
        <InspectionValidationSummary />
        <InspectionPreparationProgress />
        <InspectionUploadProgress />
        <InspectionUploadControls />
        <InspectionRecoveryPrompt guidance={<SlotBoundary onError={onSlotError}>{slots?.recoveryGuidance}</SlotBoundary>} />
        <InspectionVerificationStatus />
      </div>
      <footer className="lii-panel-footer">
        <SlotBoundary onError={onSlotError}>{slots?.terminalActions}</SlotBoundary>
      </footer>
    </article>
  );
}

interface SlotBoundaryProps {
  readonly children?: ReactNode | undefined;
  readonly onError?: ((error: unknown) => void) | undefined;
}

interface SlotBoundaryState {
  readonly failed: boolean;
}

class SlotBoundary extends Component<SlotBoundaryProps, SlotBoundaryState> {
  override state: SlotBoundaryState = { failed: false };

  static getDerivedStateFromError(): SlotBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    try {
      this.props.onError?.(error);
    } catch {
      // Slot reporting remains isolated from the controller.
    }
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
