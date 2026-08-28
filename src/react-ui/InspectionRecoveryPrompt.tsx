import type { ReactElement, ReactNode } from "react";
import { useInspectionUploadUi } from "./context.js";
import { formatBytes } from "./InspectionSourceCard.js";

export interface InspectionRecoveryPromptProps {
  readonly guidance?: ReactNode | undefined;
}

export function InspectionRecoveryPrompt({ guidance }: InspectionRecoveryPromptProps): ReactElement {
  const { actions, labels, state } = useInspectionUploadUi();
  return (
    <section className="lii-recovery" aria-labelledby="lii-recovery-heading">
      <h2 id="lii-recovery-heading" className="lii-section-title">{labels.recoveryHeading}</h2>
      {!state.source && state.recoveryChoices.length > 0 ? <p>{labels.reselectSource}</p> : null}
      {guidance ? <div className="lii-guidance">{guidance}</div> : null}
      {state.recoveryChoices.length === 0 && !state.recoveryLoading ? <p className="lii-muted">{labels.noRecovery}</p> : null}
      {state.recoveryLoading ? <p>Loading recovery choices…</p> : null}
      <ul className="lii-recovery-list">
        {state.recoveryChoices.map((choice) => (
          <li key={choice.key} className="lii-recovery-choice" data-lii-compatibility={choice.compatibility}>
            <span className="lii-recovery-name">{choice.fileName}</span>
            <span className="lii-numeric">{formatBytes(choice.uploadedBytes)} / {formatBytes(choice.totalBytes)}</span>
            <span>{compatibilityLabel(choice.compatibility)}</span>
            {choice.compatibility === "compatible" ? (
              <button className="lii-button lii-button-primary" type="button" onClick={() => void actions.resume(choice.key).catch(() => undefined)}>{labels.resume}</button>
            ) : null}
            {state.controls.canDiscardRecovery ? (
              <button className="lii-button" type="button" onClick={() => void actions.discardRecovery(choice.key).catch(() => undefined)}>{labels.discardRecovery}</button>
            ) : null}
          </li>
        ))}
      </ul>
      <button className="lii-button" type="button" onClick={() => void actions.refreshRecovery()} disabled={state.recoveryLoading}>{labels.refreshRecovery}</button>
    </section>
  );
}

function compatibilityLabel(compatibility: string): string {
  switch (compatibility) {
    case "compatible": return "Compatible source";
    case "file_mismatch": return "This source does not match";
    case "chunking_mismatch": return "Chunking configuration does not match";
    case "expired": return "Recovery record expired";
    default: return "Reselect the original to check compatibility";
  }
}
