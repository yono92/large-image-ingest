// Part of profiles.ts, split out to keep modules under 500 lines; public exports stay on profiles.ts.
import type { DomainValidationProfile } from "./profiles.js";

export const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
export const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
export const SHA256 = /^[a-f0-9]{64}$/;
export const RFC3339 = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:(?:[0-5]\d|60)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
export const MAX_RULES = 128;
export const MAX_MAPPINGS = 32;
export const trustedProfiles = new WeakSet<DomainValidationProfile>();
