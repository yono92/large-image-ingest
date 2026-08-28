import type { ReactElement } from "react";
import { useInspectionUploadUi } from "./context.js";

export function InspectionVerificationStatus(): ReactElement {
  const { actions, labels, state } = useInspectionUploadUi();
  const verification = state.verification;
  return (
    <section className="lii-status-card" data-lii-state={verification.status} aria-labelledby="lii-verification-heading">
      <h2 id="lii-verification-heading" className="lii-section-title">{labels.verificationHeading}</h2>
      <p>{verificationLabel(verification.status, labels)}</p>
      {verification.status === "failed" && verification.issues.length > 0 ? (
        <ul>{verification.issues.map((issue) => <li key={`${issue.code}-${issue.severity}`}>{issue.code}</li>)}</ul>
      ) : null}
      {state.controls.canRetryVerification ? <button className="lii-button" type="button" onClick={() => void actions.retryVerification()}>{labels.retryVerification}</button> : null}
    </section>
  );
}

function verificationLabel(
  status: string,
  labels: ReturnType<typeof useInspectionUploadUi>["labels"]
): string {
  switch (status) {
    case "pending": return labels.verificationPending;
    case "verified": return labels.verificationVerified;
    case "failed": return labels.verificationFailed;
    case "unavailable": return labels.verificationUnavailable;
    default: return labels.verificationNotConfigured;
  }
}
