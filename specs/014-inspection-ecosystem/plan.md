# Implementation Plan: Inspection Ecosystem

## Summary

Ship v1.7.0 as three additive provider-neutral modules: inspection metadata profiles, inspection policy evaluation, and canonical/signable evidence export. Reuse current manifest/completion validators and Web Crypto primitives available through existing runtimes; inject signature/trust callbacks.

## Architecture

- `src/inspection-profile.ts`: strict profile parsing, frozen built-ins, metadata validation.
- `src/inspection-policy.ts`: strict policy parsing, built-in evidence-grade pack, deterministic evaluation.
- `src/evidence-bundle.ts`: linked bundle creation, canonical JSON, SHA-256 digest, signature envelope, verification.
- `src/evidence-diagnostics.ts`: allowlisted report/bundle/signature summaries.
- `schemas/inspection-profile.v1.schema.json`, `inspection-policy.v1.schema.json`, `evidence-bundle.v1.schema.json`, and `signed-evidence.v1.schema.json`.

## Integrity Rules

- Never include rejected metadata values in issues.
- Freeze built-ins and clone caller-owned definitions/reports/bundles.
- Validate completion evidence before bundle creation.
- Canonicalize only JSON data; reject ambiguous runtime values.
- Hash canonical bundle bytes before signing and before verification.
- Treat algorithm/key ID/signature as untrusted until the callback confirms them.

## Compatibility And Dependencies

- Root/core exports are additive.
- No runtime dependency or provider SDK.
- WebCrypto example is optional application code; core accepts callbacks and uses existing SHA-256 support.
- Existing artifact schemas remain unchanged.

## Verification

- Profile definition/metadata tables including malicious patterns and value redaction.
- Policy pass/fail matrices with linked verified/unverified completion.
- Canonicalization fixtures for key order, arrays, Unicode, invalid JSON values, cycles.
- Sign/verify/tamper callback tests with local WebCrypto or deterministic fake callbacks.
- Schema, safe diagnostics, package export, examples, and full release gates.
