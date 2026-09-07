import type { ReactElement } from "react";
import { useVerifiedIngestActions, useVerifiedIngestState } from "../../react.js";

export function VerifiedIngestActions(): ReactElement {
  const state = useVerifiedIngestState();
  const actions = useVerifiedIngestActions();
  const allowed = new Set<string>(state.allowedActions);
  const canStart = state.status === "preparing";
  const canRetry = allowed.has("retry") || allowed.has("resume");
  const canPause = allowed.has("pause");
  const canCancel = allowed.has("cancel") || allowed.has("stop");
  return (
    <section className="lii-verified-actions" aria-labelledby="lii-verified-actions-heading">
      <h2 id="lii-verified-actions-heading" className="lii-section-title">Workflow actions</h2>
      <div className="lii-action-row">
        {canStart ? <button className="lii-button lii-button-primary" type="button" onClick={() => void actions.start().catch(() => undefined)}>Start verified ingest</button> : null}
        {canRetry ? <button className="lii-button lii-button-primary" type="button" onClick={() => void actions.retry().catch(() => undefined)}>Retry from authority</button> : null}
        {canPause ? <button className="lii-button" type="button" onClick={() => actions.pause()}>Pause</button> : null}
        {canCancel ? <button className="lii-button lii-button-danger" type="button" onClick={() => void actions.cancel().catch(() => undefined)}>{allowed.has("stop") ? "Stop downstream work" : "Cancel"}</button> : null}
      </div>
    </section>
  );
}
