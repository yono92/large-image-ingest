# Feature Specification: Inspection Ecosystem

**Feature Branch**: `014-inspection-ecosystem`

**Created**: 2026-08-07

**Status**: Implemented

**Input**: User description: "Complete the commercial roadmap with inspection-domain metadata profiles, policy packs, evidence export and signing boundaries, and reference integrations without moving image decoding or provider SDKs into core."

## User Scenarios & Testing

### User Story 1 - Validate Reusable Inspection Metadata (Priority: P1)

As an inspection platform developer, I can validate untrusted manifest metadata against a versioned reusable profile and receive field-level typed issues.

**Acceptance Scenarios**:

1. Given semiconductor wafer metadata, when validated against the built-in wafer profile, then required identity fields and scalar types are checked without mutating input.
2. Given a custom profile, when fields are missing, mistyped, outside bounds, or fail an anchored pattern/enum, then deterministic field-path issues are returned.
3. Given an invalid profile definition, when compiled, then it fails before evaluating customer metadata.

### User Story 2 - Evaluate Evidence Policy Packs (Priority: P1)

As a quality or compliance owner, I can evaluate a manifest and optional completion evidence against a versioned policy pack and obtain a portable pass/fail report.

**Acceptance Scenarios**:

1. Given evidence-grade policy, when original preservation, whole-file checksum, metadata profile, completion link, and verified stored-object facts satisfy it, then the report passes.
2. Given unverified completion or missing facts, when evaluated, then stable policy issue codes explain each unmet rule.
3. Given a custom policy, when source size/media type/status constraints are configured, then evaluation is deterministic and provider-neutral.

### User Story 3 - Export Canonical Evidence Bundles (Priority: P1)

As an audit-system integrator, I can package a manifest, completion evidence, and optional policy report into a versioned immutable bundle with deterministic canonical bytes and SHA-256 identity.

**Acceptance Scenarios**:

1. Given semantically identical objects with different key order, when bundled/canonicalized, then bytes and digest are identical.
2. Given mismatched manifest/completion IDs or invalid evidence, when bundling, then export fails before signing.
3. Given caller mutation after bundle creation, when the bundle is read again, then exported content remains unchanged.

### User Story 4 - Integrate Application-Owned Signing (Priority: P2)

As a security architect, I can sign canonical bundle bytes and verify an envelope through injected callbacks while keeping private keys, trust stores, certificate policy, HSM/KMS SDKs, and algorithms outside core.

**Acceptance Scenarios**:

1. Given a signer callback, when signing succeeds, then the envelope records payload digest, key ID, algorithm label, signature bytes, and timestamp without exposing key material.
2. Given a verifier callback, when digest or payload is tampered, then verification fails before trusting the signature result.
3. Given callback failures or malformed base64url, when signing/verifying, then safe typed errors contain no key material or provider payload.

## Requirements

- **FR-001**: The SDK MUST define versioned metadata profile contracts for required/optional scalar fields, type, length/value bounds, enum, and anchored regular-expression constraints.
- **FR-002**: Profile compilation MUST reject duplicate fields, unsafe/unanchored patterns, invalid bounds, unsupported types, and invalid enum values.
- **FR-003**: Metadata validation MUST treat filenames and metadata as untrusted, preserve input, sort issues deterministically, and expose field paths without copying rejected values.
- **FR-004**: The SDK MUST ship conservative semiconductor-wafer and industrial-inspection v1 profiles as frozen reusable constants.
- **FR-005**: Versioned policy packs MUST compose metadata profile validation with original-preservation, checksum, completion status, stored checksum, source size, and media-type rules.
- **FR-006**: Policy evaluation MUST validate manifest/evidence links and return an immutable deterministic report with stable typed codes.
- **FR-007**: The SDK MUST ship an evidence-grade inspection policy requiring preserved original, whole-file SHA-256, verified completion, matching stored checksum facts, and the semiconductor profile.
- **FR-008**: Custom profiles and policies MUST remain provider-neutral and serializable; callbacks and provider state MUST NOT appear in them.
- **FR-009**: Evidence bundles MUST be versioned, producer-attributed, manifest-linked, completion-linked, clone-isolated, and optionally include a policy report.
- **FR-010**: Canonical serialization MUST sort object keys recursively, preserve array order, reject cycles/undefined/non-finite numbers/non-JSON types, and encode UTF-8 deterministically.
- **FR-011**: Bundle identity MUST use SHA-256 over canonical payload bytes.
- **FR-012**: Signing MUST accept an application-owned callback that receives canonical bytes only and returns signature bytes; the SDK MUST NOT own private keys or import provider SDKs.
- **FR-013**: Verification MUST recompute the digest, validate bundle links/schema, decode strict base64url, and invoke an application-owned trust callback.
- **FR-014**: Signature envelopes MUST label algorithm and key ID as untrusted identifiers and MUST NOT claim cryptographic trust unless the verifier callback returns true.
- **FR-015**: Errors and safe diagnostics MUST not include metadata values, canonical payload bytes, signatures, key material, certificates, provider errors, or full evidence.
- **FR-016**: JSON Schemas MUST be published for metadata profile v1, policy pack v1, evidence bundle v1, and signed evidence envelope v1.
- **FR-017**: Reference examples MUST cover custom profile/policy use and WebCrypto signing without making WebCrypto or a provider a core dependency.
- **FR-018**: Existing manifest, completion, queue, transport, React, TIFF, and Node APIs MUST remain additive-compatible and runtime dependencies MUST remain empty.
- **FR-019**: Pixel analysis, defect taxonomies, image decoding, certificate-chain validation, timestamp authorities, key rotation, HSM/KMS SDKs, and audit-store transport are out of scope.

## Success Criteria

- **SC-001**: Valid and invalid profile fixtures yield deterministic identical reports across repeated runs.
- **SC-002**: Built-in evidence-grade policy passes only fixtures with verified linked completion and required inspection metadata.
- **SC-003**: Different object key insertion orders produce byte-identical canonical payloads and SHA-256 digests.
- **SC-004**: 100% of tampered payload/digest/signature fixtures fail or return untrusted without leaking sensitive content.
- **SC-005**: Bundle, report, and callback payload mutation cannot alter SDK-owned artifacts.
- **SC-006**: Published schemas validate current artifacts and reject malformed/unsupported versions.
- **SC-007**: Existing full suite and package compatibility remain green.
- **SC-008**: Typecheck, examples, all tests, build, reference run, package dry-run, and dependency audit gates pass.

## Clarifications

### Session 2026-08-07

- Q: Does the SDK choose a signing algorithm or manage keys? → A: No. It canonicalizes and envelopes; the application owns cryptography and trust policy.
- Q: Is a successful callback enough to call evidence legally/compliance valid? → A: No. The result reports cryptographic callback trust only; regulatory meaning remains application policy.
- Q: Should policy packs decode images or classify defects? → A: No. They evaluate manifest metadata and evidence facts only.
- Q: Can profile patterns be arbitrary regex? → A: Only explicitly anchored, bounded-length pattern strings are accepted to reduce ambiguous validation behavior.
