# Implementation Plan: Domain Validation Profiles

**Branch**: `[017-domain-validation-profiles]` | **Date**: 2026-08-31 | **Spec**: [spec.md](spec.md)

## Summary

Add an explicitly invoked, browser-safe `large-image-ingest/profiles` subpath with three immutable reference baselines, deterministic effective-policy SHA-256 identity, safe rule outcomes, constrained derived-profile construction, and an upload-session binding. Persist only the safe profile reference in new resume records and reject a changed, missing, or newly introduced profile before any remote resume call or acknowledged-byte reuse.

## Technical Context

**Language/Version**: TypeScript 5.x; modern browsers and Node.js 20+

**Dependencies**: existing manifest, checksum, provenance canonicalization, resume, and session contracts; no new runtime dependency

**Storage**: optional safe profile reference in existing resume v0.3 records; no registry or remote policy service

**Testing**: Vitest baseline matrices, derivation/configuration mutations, instrumented no-file-read evidence, safe output, session preflight, and persistent-resume mismatch tests

**Constraints**: no implicit domain selection; no pixel decode; no duplicate whole-file hashing; no private profile or metadata values in routine output; no regulatory/scientific claims

## Clarification Result

No critical ambiguity remains. Baseline v1 uses SHA-256, non-empty safe-integer source size, explicit format/media/extension coherence, positive dimensions, warning-only bit-depth unavailability, RFC 3339 timestamps with timezone, and bounded identifiers. Baselines do not impose a universal maximum size. Structural format evidence is explicit and source-labelled; no filename or metadata claim becomes an observed structural fact.

## Constitution Check

- **Original preservation — PASS**: evaluation consumes manifest/evidence only and never decodes, reads, or mutates original bytes.
- **Explicit authority — PASS**: no core default or inference activates a profile; session integration requires a caller-supplied passing binding.
- **Recoverability — PASS**: exact profile reference is stored with new records and compared before transport resume.
- **Versioning — PASS**: profile schema, reference, rule, evaluation, and binding are versioned; digest identifies full effective policy.
- **Security — PASS**: values remain input-only; public outcomes contain rule IDs, categories, sources, severities, and codes.
- **Compatibility — PASS**: callers omitting a profile preserve all existing behavior and resume records remain readable.

## Architecture

### Published Baselines

`loadBundledDomainProfile()` returns a deep-frozen, digest-verified effective profile for semiconductor inspection, microscopy, or satellite imagery. Each baseline has a stable name/version and complete flat rule inventory. Bundled definitions are treated as data, not branching logic hidden in the evaluator.

### Evaluation

`evaluateDomainValidationProfile()` first validates the profile and digest, then evaluates its rules against an existing manifest plus optional structural/external evidence. It performs no Blob reads. Each rule produces exactly one safe outcome and evidence-source category; the aggregate is `passed`, `passed_with_warnings`, `failed`, or `invalid_configuration`.

### Derivation

`deriveDomainValidationProfile()` accepts one verified baseline/effective profile, a new name/version, added rules, provably tighter replacements, metadata mappings, and explicit exception replacements. Relaxations require an allowed safe rationale category. Duplicate IDs, conflicts, cycles, invalid mappings, unprovable tightening, and silent replacements fail before evaluation.

### Session And Resume Binding

An evaluation exposes a `large-image-ingest.domain-profile-binding.v1` only when it passed or passed with warnings. When passed to `createIngestSession`, the binding manifest ID is checked before transport creation. Its safe reference is persisted in new resume records. Resume classification compares name, version, and effective-policy digest before source hashing, transport resume, or chunk skipping. A record/profile mismatch maps to `resume.profile_mismatch`.

## Compatibility Strategy

- Add a new optional package subpath and optional session field.
- Keep manifest v1 and resume v0.3 schema identifiers unchanged; the profile reference is additive and optional.
- Read legacy/no-profile records as before when no current profile is selected.
- If either side has a profile and the other does not, acknowledged work is never silently reused under different policy authority.

## Verification Strategy

1. Snapshot every bundled rule and digest and repeat evaluations for determinism.
2. Cover valid/invalid/missing format, size, checksum, dimension, bit-depth, identifier, timestamp, and georeferencing evidence per baseline.
3. Prove metadata values and structural assertions retain distinct evidence categories.
4. Cover additions, tightening, mappings, explicit exceptions, duplicates, conflicts, cycles, digest changes, and silent relaxations.
5. Instrument inputs to prove evaluation performs no source Blob read or duplicate checksum traversal.
6. Prove failed profile bindings block before `createSession`, and resume mismatches block before `resumeSession` or chunk upload.
7. Run package and full repository gates.

## Complexity Tracking

The optional resume field is justified by FR-022: a standalone comparison helper cannot guarantee the check occurs before the SDK invokes a remote transport. No registry, rule-expression language, multiple inheritance, or automatic migration is introduced.
