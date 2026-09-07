import type { ReactElement } from "react";
import { VerifiedIngestProvider, useVerifiedIngestState } from "../../react.js";
import { VerifiedIngestActions } from "./VerifiedIngestActions.js";
import { VerifiedIngestStatus } from "./VerifiedIngestStatus.js";
import type { VerifiedIngestPanelProps } from "./types.js";

export function VerifiedIngestPanel(props: VerifiedIngestPanelProps): ReactElement {
  const { controller, ...layout } = props;
  return (
    <VerifiedIngestProvider controller={controller}>
      <VerifiedIngestPanelLayout {...layout} />
    </VerifiedIngestProvider>
  );
}

function VerifiedIngestPanelLayout({
  className,
  style,
  title = "Verified ingest",
  description = "Upload, stored-original verification, evidence persistence, and optional preservation."
}: Omit<VerifiedIngestPanelProps, "controller">): ReactElement {
  const state = useVerifiedIngestState();
  const rootClassName = className
    ? `lii-panel lii-verified-panel ${className}`
    : "lii-panel lii-verified-panel";
  return (
    <article className={rootClassName} style={style} data-lii-workflow-state={state.status}>
      <header className="lii-panel-header"><h1>{title}</h1><p>{description}</p></header>
      <p className="lii-live-region" aria-live="polite" aria-atomic="true">
        Workflow state: {state.status.replaceAll("_", " ")}
      </p>
      <div className="lii-grid">
        <VerifiedIngestStatus />
        <VerifiedIngestActions />
      </div>
    </article>
  );
}
