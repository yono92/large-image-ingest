import type { ReactElement } from "react";
import { useInspectionUploadUi } from "./context.js";

export function InspectionValidationSummary(): ReactElement {
  const { labels, state } = useInspectionUploadUi();
  const failed = state.error?.category === "validation";
  const active = state.phase === "validating";
  const complete = Boolean(state.source) && !failed && !active && state.phase !== "selected";
  return (
    <section className="lii-status-card" data-lii-state={failed ? "failed" : complete ? "complete" : "pending"}>
      <h2 className="lii-section-title">{labels.validationHeading}</h2>
      <p>{failed ? state.error?.guidance : active ? labels.phase.validating : complete ? "Validation passed." : "Validation starts with ingest."}</p>
    </section>
  );
}
