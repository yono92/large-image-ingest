import type { ReactElement } from "react";
import { useInspectionUploadUi } from "./context.js";
import { formatBytes } from "./InspectionSourceCard.js";

export function InspectionUploadProgress(): ReactElement {
  const { labels, state } = useInspectionUploadUi();
  return (
    <section className="lii-status-card" aria-labelledby="lii-progress-heading">
      <h2 id="lii-progress-heading" className="lii-section-title">{labels.progressHeading}</h2>
      <progress aria-labelledby="lii-progress-heading" value={state.uploadedBytes} max={Math.max(1, state.totalBytes)}>
        {Math.round(state.progress * 100)}%
      </progress>
      <p className="lii-numeric">{formatBytes(state.uploadedBytes)} acknowledged of {formatBytes(state.totalBytes)}</p>
    </section>
  );
}
