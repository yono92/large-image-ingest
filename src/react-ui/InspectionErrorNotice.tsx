import { useEffect, useRef, type ReactElement } from "react";
import { useInspectionUploadUi } from "./context.js";

export function InspectionErrorNotice(): ReactElement | null {
  const { labels, state } = useInspectionUploadUi();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (state.error) headingRef.current?.focus();
  }, [state.error]);
  if (!state.error) return null;
  return (
    <section className="lii-error" role="alert" aria-labelledby="lii-error-heading">
      <h2 id="lii-error-heading" className="lii-section-title" ref={headingRef} tabIndex={-1}>{labels.errorHeading}</h2>
      <strong>{state.error.title}</strong>
      <p>{state.error.guidance}</p>
      {state.error.code ? <code>{state.error.code}</code> : null}
    </section>
  );
}
