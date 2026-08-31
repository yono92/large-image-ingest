# Implementation Plan: Auditable Ingest Provenance

**Branch**: `[015-ingest-provenance]` | **Date**: 2026-08-31 | **Spec**: [spec.md](spec.md)

## Summary

Add an opt-in `large-image-ingest/provenance` subpath that records a compact, versioned history separate from manifests and resume records. A recorder maps safe ingest events and explicit recovery, transport, verification, derivative, and external-attestation evidence into a deterministically ordered artifact. RFC 8785 JSON canonicalization plus SHA-256 detects modification; trust in actors, time, or signatures remains external. Bounded validation, a default safe summary, explicit disclosure-aware export, and a non-authoritative persistence helper complete the retention boundary without changing upload behavior.

## Technical Context

**Language/Version**: TypeScript 5.x targeting ES2022; browser and Node.js 20+

**Primary Dependencies**: existing manifest, checksum, derivative, event, verification, and package-version contracts; native JSON and Web APIs; no new runtime dependency

**Storage**: application-owned `ProvenanceSink`; no built-in database, filesystem, cloud, or ledger

**Testing**: Vitest contract, mutation, lifecycle, disclosure, persistence-failure, package-consumption, and compatibility tests

**Target Platform**: framework-agnostic browser/server SDK with ESM and CommonJS exports

**Constraints**: opt-in only; no original mutation; no full manifest/resume record/raw receipt/provider payload in the artifact; deterministic ordering does not depend on timestamps; unsigned integrity never implies identity, trusted time, compliance, or non-repudiation

**Scale/Scope**: one artifact per ingest correlation identity, bounded entries/derivatives/attestations, one v1 schema and SHA-256/JCS integrity method

## Clarification Result

No critical ambiguity remains. The specification already makes capture opt-in, separates operational and durable state, names terminal categories, requires explicit disclosure, and leaves signing and retention application-owned. Planning therefore proceeds without adding user choices.

## Constitution Check

- **Original preservation — PASS**: only structured evidence is read; no source decoding or mutation occurs.
- **Recoverability — PASS**: recovery is summarized by classification, counts, version, reuse, and conflicts without copying resume state.
- **Adapter boundaries — PASS**: core session authority is unchanged; storage and attestation are caller-owned interfaces.
- **TypeScript/versioning — PASS**: v1 artifact, entry, integrity, validation, sink, summary, and export types are additive.
- **Validation/security — PASS**: exact-key bounded validators and safe projections reject unknown versions/fields and never echo rejected values.
- **Documentation/tests — PASS**: mutation matrix, lifecycle terminal matrix, cross-artifact checks, persistence isolation, exports, and package consumption are required.

Post-design re-check: **PASS**. No complexity waiver is required.

## Architecture

### Recorder And Artifact

`createIngestProvenanceRecorder()` receives an existing manifest plus an explicit policy reference and disclosure profile. It maps public `IngestEvent` values into monotonically sequenced entries and accepts explicit methods for recovery metrics, stored verification, derivatives, and external attestations. It never becomes session authority and applications opt in by forwarding events.

The recorder owns sequence and entry IDs. Timestamps are descriptive; strict sequence order is authoritative when clocks repeat or move backward. Terminal state reduces from observed cancellation/failure/completion plus explicit verification evidence.

### Integrity And Trust

The artifact body excluding `integrity` is serialized with RFC 8785 JSON Canonicalization Scheme rules and hashed with SHA-256. Runtime validation recomputes the digest after structural, ordering, and relationship checks. The validation result separately reports content integrity and actor trust. External attestations are safe references/digests evaluated only by an optional application verifier.

### Disclosure And Persistence

An `audit` artifact contains only curated schema fields. `authorized-full` may additionally retain explicit application annotations but still cannot embed manifests, resume records, raw receipts, credentials, provider locations, or arbitrary payloads. Safe summaries are fixed projections. Exports require an explicit target profile and are re-sealed after projection.

`persistIngestProvenance()` calls an application sink and returns a typed success/failure result. It never throws raw sink errors or mutates upload/verification authority.

## Project Structure

```text
src/provenance.ts
tests/provenance.test.ts
tests/provenance-lifecycle.test.ts
tests/provenance-integrity.test.ts
tests/provenance-security.test.ts
examples/provenance.ts
docs/provenance.md
specs/015-ingest-provenance/contracts/provenance-api.md
specs/015-ingest-provenance/contracts/provenance-artifact.schema.json
```

## Implementation Phases

1. Add public types, exact-key validation, canonicalization, integrity, and package export.
2. Add recorder lifecycle/recovery/transport/verification/derivative/attestation behavior and terminal reduction.
3. Add cross-artifact validation, safe summaries, explicit exports, and persistence isolation.
4. Add documentation, examples, release notes, compatibility tests, and full gates.

## Compatibility Strategy

- Add `large-image-ingest/provenance`; do not modify `CreateIngestSessionOptions` or event authority.
- Applications without a recorder observe byte-for-byte existing behavior and existing public types.
- Keep manifest v1 and resume v0.1–v0.3 unchanged.
- Keep the shared 1.6.0 additive release baseline.

## Verification Strategy

1. Generate all six terminal fixture categories and retain stable entry sequence/IDs under repeated or reversed timestamps.
2. Mutate every authoritative top-level section and require integrity failure.
3. Detect manifest/source/derivative/verification relationship mismatches with typed safe issues.
4. Inject forbidden fields and unknown versions/keys and verify zero leakage in summaries/issues.
5. Inject sink failure after authoritative completion/verification and verify only the persistence result changes.
6. Run package ESM/CJS/examples, typecheck, unit/UI, build, conformance, reference, browser, integration skip, pack, and diff gates.

## Complexity Tracking

No constitution violations. A standalone recorder is intentionally smaller and safer than adding asynchronous durable auditing to the upload state machine; applications explicitly compose it through the existing event callback and verification boundary.
