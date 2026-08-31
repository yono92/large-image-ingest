# Data Model: Domain Validation Profiles

## Effective Profile

| Field | Purpose |
| --- | --- |
| `schemaVersion` | `large-image-ingest.domain-profile.v1` |
| `name` / `version` / `domain` | stable explicit policy identity |
| `descriptionCode` | safe documented description, not private prose |
| `compatibility` | supported manifest schema and library major |
| `rules` | complete ordered effective rule inventory |
| `derivation` | optional base reference, mappings, additions, tightening, and explicit exceptions |
| `effectivePolicyDigest` | SHA-256 over RFC 8785 canonical JSON excluding the digest field |

## Rule

Every rule has `id`, `category`, `severity`, `evidenceRequirement`, `unavailableBehavior`, `descriptionCode`, and one typed configuration. Initial kinds are source size, checksum, allowed media types, allowed extensions/name suffixes, structural formats, positive dimensions, positive bit depth, metadata identifier, metadata timestamp, and external evidence.

## Evidence

Structural and external evidence items carry a source category: `sdk_observed`, `caller_supplied`, or `external_attested`. Manifest fields use `manifest`. Outcomes never contain evidence values.

## Evaluation

`large-image-ingest.domain-profile-evaluation.v1` records profile reference, manifest ID, evaluation time, aggregate result, and one outcome per rule. Outcomes are `pass`, `warning`, `blocking_failure`, `not_applicable`, `unavailable_evidence`, or `invalid_configuration` and retain rule ID/category/severity/evidence source/safe code.

## Session Binding And Resume Reference

A passing evaluation produces `large-image-ingest.domain-profile-binding.v1` with manifest ID, aggregate result, and the safe profile reference. Resume records persist only that reference. A mismatch in name, version, or digest is non-resumable.

## Derivation

A derived profile has exactly one ancestry chain. Added and tightened rule IDs are listed. Every relaxation records a replacement/disable action and one safe rationale category; free-text rationale is not part of the public contract. Metadata mappings map canonical baseline keys to bounded organization keys without copying values.
