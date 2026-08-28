import type { ReactElement } from "react";
import { useInspectionUploadUi } from "./context.js";

export function InspectionUploadControls(): ReactElement {
  const { actions, labels, state } = useInspectionUploadUi();
  return (
    <section className="lii-controls" aria-labelledby="lii-controls-heading">
      <h2 id="lii-controls-heading" className="lii-section-title">{labels.controlsHeading}</h2>
      <div className="lii-action-row">
        {state.controls.canStart ? <button className="lii-button lii-button-primary" type="button" onClick={() => void actions.start().catch(() => undefined)}>{labels.start}</button> : null}
        {state.controls.canPause ? <button className="lii-button" type="button" onClick={() => actions.pause()}>{labels.pause}</button> : null}
        {state.controls.canCancel ? <button className="lii-button lii-button-danger" type="button" onClick={() => void actions.cancel().catch(() => undefined)}>{labels.cancel}</button> : null}
      </div>
    </section>
  );
}
