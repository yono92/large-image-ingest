// Part of resume.ts, split out to keep modules under 500 lines; public exports stay on resume.ts.
import type { ResumeRecordStatus } from "./types.js";

export const LEGACY_RESUME_RECORD_SCHEMA_VERSION = "large-image-ingest.resume.v0.1" as const;
export const RESUME_RECORD_SCHEMA_VERSION_V0_2 = "large-image-ingest.resume.v0.2" as const;
export const RESUME_RECORD_SCHEMA_VERSION = "large-image-ingest.resume.v0.3" as const;
export const RESUME_RECORD_SCHEMA_VERSION_V0_4 = "large-image-ingest.resume.v0.4" as const;
export const RESUME_RECORD_STATUSES = new Set<ResumeRecordStatus>([
  "active",
  "paused",
  "failed",
  "completed",
  "canceled",
  "expired"
]);
