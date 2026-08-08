# Research: Inspection Ecosystem

## Profiles Instead Of Hard-Coded Metadata

Inspection customers use different identifiers and MES/QMS conventions. Versioned field profiles provide reusable defaults without baking customer schemas into manifest v1.

## Policy Reports Instead Of Upload Rejection

Policy evaluation is separate from session validation so evidence can be assessed after transport completion or during audit import. Applications decide whether a failed report blocks release, triggers quarantine, or requests server verification.

## Canonical JSON Boundary

Signing ordinary `JSON.stringify` output is unstable across key insertion order. A small JSON-only recursive canonicalizer produces deterministic UTF-8 bytes while rejecting ambiguous runtime values. Array order remains meaningful.

## Callback-Owned Cryptography

Key custody, supported algorithms, HSM/KMS access, certificate validation, and rotation are organization policy. Core supplies exact bytes, digest linkage, strict envelope structure, and a verifier callback boundary. This avoids false trust claims and provider dependencies.

## Separate Bundle From Existing Evidence

Manifest v1 remains pre-upload intent and completion v1 remains outcome evidence. The bundle references and contains immutable clones of both rather than mutating either schema.
