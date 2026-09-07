import type { ReactElement } from "react";
import { useVerifiedIngestState } from "../../react.js";

export function VerifiedIngestStatus(): ReactElement {
  const state = useVerifiedIngestState();
  const bundle = "bundle" in state ? state.bundle : undefined;
  const authority = "lastAuthoritativeState" in state
    ? state.lastAuthoritativeState
    : authorityFor(state.status);
  return (
    <section className="lii-verified-status" aria-labelledby="lii-verified-status-heading">
      <h2 id="lii-verified-status-heading" className="lii-section-title">Verified ingest status</h2>
      <dl className="lii-verified-details">
        <div><dt>Current state</dt><dd>{label(state.status)}</dd></div>
        <div><dt>Authoritative through</dt><dd>{authority ? label(authority) : "No durable authority yet"}</dd></div>
        <div><dt>Stored verification</dt><dd>{bundle?.verification.status ?? verificationFor(state.status)}</dd></div>
        <div><dt>Evidence</dt><dd>{bundle ? `Persisted revision ${bundle.revision}` : "Not persisted"}</dd></div>
        <div><dt>Preservation</dt><dd>{bundle?.preservation.status ?? "not requested or pending"}</dd></div>
      </dl>
      {"issueCodes" in state ? (
        <p className="lii-inline-error" role="alert">{state.issueCodes.join(", ")}</p>
      ) : null}
    </section>
  );
}

function label(value: string): string {
  return value.replaceAll("_", " ");
}

function verificationFor(status: string): string {
  if (["verified", "persisting_evidence", "evidence_persisted", "preserving", "finalizing_evidence", "preserved", "preservation_failed", "evidence_finalization_failed"].includes(status)) {
    return "verified";
  }
  if (status === "verification_failed") return "failed";
  return "not verified";
}

function authorityFor(status: string): string | undefined {
  if (["prepared", "uploading", "paused", "upload_failed"].includes(status)) return "prepared";
  if (["uploaded_unverified", "verifying", "verification_failed"].includes(status)) return "uploaded_unverified";
  if (["verified", "persisting_evidence", "evidence_persistence_failed"].includes(status)) return "verified";
  if (["evidence_persisted", "preserving", "finalizing_evidence", "preservation_failed", "evidence_finalization_failed"].includes(status)) return "evidence_persisted";
  if (status === "preserved") return "preserved";
  return undefined;
}
