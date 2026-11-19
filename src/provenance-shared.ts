// Part of provenance.ts, split out to keep modules under 500 lines; public exports stay on provenance.ts.
import type { ResumeCompatibilityStatus } from "./types.js";
import type { ProvenanceEntryType, ProvenanceEvidenceSource, ProvenancePolicyResult, ProvenanceTerminalStatus, ProvenanceVerificationStatus } from "./provenance.js";

export const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export const SAFE_CODE = /^[a-z0-9][a-z0-9._-]{0,127}$/;
export const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
export const SHA256 = /^[a-f0-9]{64}$/;
export const MAX_ENTRIES = 4096;
export const MAX_DERIVATIVES = 1024;
export const MAX_ATTESTATIONS = 64;
export const MAX_CODES = 128;
export const MAX_ANNOTATIONS = 32;
export const ENTRY_TYPES = new Set<ProvenanceEntryType>([
  "preparation", "validation", "session_created", "progress_snapshot", "chunk_started",
  "acknowledgement", "retry", "recovery_available", "resume", "recovery_checkpoint",
  "recovery_conflict", "recovery_cleanup_failed", "recovery_expired", "pause",
  "cancellation", "completion", "failure", "verification", "derivative", "attestation",
  "application_assertion"
]);
export const EVIDENCE_SOURCES = new Set<ProvenanceEvidenceSource>([
  "library", "application", "transport", "verification", "external"
]);
export const TERMINAL_STATUSES = new Set<ProvenanceTerminalStatus>([
  "active", "completed", "completed_unverified", "verification_failed", "upload_failed", "canceled"
]);
export const VERIFICATION_STATUSES = new Set<ProvenanceVerificationStatus>([
  "verified", "failed", "unavailable"
]);
export const POLICY_RESULTS = new Set<ProvenancePolicyResult>([
  "passed", "passed_with_warnings", "failed"
]);
export const RESUME_CLASSIFICATIONS = new Set<ResumeCompatibilityStatus>([
  "resumable", "upgradeable", "restart_only", "expired", "incompatible"
]);
export const METRIC_KEYS = [
  "chunkIndex", "uploadedBytes", "totalBytes", "attempt", "completedRangeCount",
  "acknowledgedRangesReused", "retransmittedAcknowledgedBytes"
] as const;
