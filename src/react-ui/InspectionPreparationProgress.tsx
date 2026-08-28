import type { ReactElement } from "react";
import { useInspectionUploadUi } from "./context.js";
import { formatBytes } from "./InspectionSourceCard.js";

export function InspectionPreparationProgress(): ReactElement {
  const { labels, state } = useInspectionUploadUi();
  const preparation = state.preparation;
  return (
    <section className="lii-status-card" aria-labelledby="lii-preparation-heading">
      <h2 id="lii-preparation-heading" className="lii-section-title">{labels.preparationHeading}</h2>
      {preparation?.progress !== undefined ? (
        <>
          <progress aria-labelledby="lii-preparation-heading" value={preparation.processedBytes ?? 0} max={preparation.totalBytes}>
            {Math.round(preparation.progress * 100)}%
          </progress>
          <p className="lii-numeric">{formatBytes(preparation.processedBytes ?? 0)} / {formatBytes(preparation.totalBytes)}</p>
        </>
      ) : <p>{preparation ? labels.phase[preparation.phase] : "Preparation has not started."}</p>}
    </section>
  );
}
