// Part of verification.ts, split out to keep modules under 500 lines; public exports stay on verification.ts.
import type { VerificationChecksumPolicy } from "./types.js";

export const SUPPORTED_MANIFEST_SCHEMA_VERSION = "large-image-ingest.manifest.v1";
export const DEFAULT_CHECKSUM_POLICY: VerificationChecksumPolicy = "when-present";
