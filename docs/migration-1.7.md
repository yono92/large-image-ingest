# Migrating To 1.7

Version 1.7 is additive. Existing upload, resume, queue, React, transport, TIFF, and Node integrations require no changes.

## Metadata Profiles

Use `SEMICONDUCTOR_WAFER_PROFILE_V1` or `INDUSTRIAL_INSPECTION_PROFILE_V1` for conservative common identities, or compile a serializable custom profile. Profile validation returns field paths and typed codes without copying rejected values.

Patterns must be anchored and bounded in length. Profiles support scalar strings, finite numbers, safe integers, booleans, bounds, enums, and patterns; nested domain schemas and defect taxonomies remain application-owned.

## Policy Packs

`EVIDENCE_GRADE_INSPECTION_POLICY_V1` requires original preservation, whole-file SHA-256, verified completion, stored checksum proof, and semiconductor profile metadata. Policy reports are evaluations, not automatic upload rejection. Decide release, quarantine, re-verification, and retention workflow in the application.

## Evidence Bundles

`createEvidenceBundle()` clones and links manifest v1, completion v1, and an optional policy report. `canonicalizeEvidenceBundle()` sorts object keys recursively, preserves array order, rejects non-JSON values, and emits deterministic UTF-8 bytes. The payload identity is SHA-256.

## Signing And Trust

The signer callback receives canonical bytes and returns signature bytes. Core records an algorithm label and key ID but never receives private key material or imports KMS/HSM/provider SDKs.

Verification validates bundle structure/linkage, strict base64url, and SHA-256 digest before invoking the application verifier. `trusted: true` means only that these checks and the supplied callback passed. Certificate policy, revocation, key rotation, timestamp authorities, legal validity, and regulatory interpretation remain external responsibilities.

Log only the safe inspection/evidence summary helpers. Raw bundles contain filenames, customer metadata, checksum values, storage references, and completion evidence; raw envelopes additionally contain signatures and key identifiers.
