# Research: Auditable Ingest Provenance

## Decision 1: Use Deterministic Sequence As Ordering Authority

**Decision**: Every entry receives a recorder-owned zero-based sequence and stable `entry-N` identity. Timestamp order is never authoritative.

**Rationale**: Wall clocks can repeat or move backward, and multiple actors can report equal times. Sequence removes ambiguity without claiming trusted time.

**Alternatives rejected**: timestamp-only ordering; distributed vector clocks for a first single-recorder artifact.

## Decision 2: Use RFC 8785 JCS Plus SHA-256

**Decision**: Canonicalize the artifact body without `integrity` according to RFC 8785's I-JSON, ECMAScript primitive serialization, recursive UTF-16 property ordering, and no-whitespace rules, then calculate SHA-256.

**Rationale**: Stable JSON representation is required before hashing. JCS is specifically designed for repeatable cryptographic processing while retaining ordinary JSON.

**Source**: [RFC 8785: JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html)

**Alternatives rejected**: insertion-order `JSON.stringify`, which changes with object construction; a signature scheme, which would require application keys and a trust model outside this feature.

## Decision 3: Follow PROV Concepts Without Claiming PROV Serialization

**Decision**: Model source/manifest/derivatives as entities, ingest and verification as activities, and library/application/transport/verifier/external as evidence-source categories. Do not label the v1 JSON artifact as PROV-O or PROV-JSON compliant.

**Rationale**: W3C PROV's entity/activity/agent separation improves relationship clarity, but full ontology serialization is broader than the SDK requirement and belongs in preservation interoperability.

**Sources**: [W3C PROV Overview](https://www.w3.org/TR/prov-overview/), [W3C PROV Model Primer](https://www.w3.org/TR/prov-primer/)

## Decision 4: Keep Integrity And Actor Trust Separate

**Decision**: Runtime validation reports `integrity: valid|invalid` independently from `actorTrust: unsigned|not_evaluated|externally_attested|attestation_invalid`.

**Rationale**: A self-produced SHA-256 detects modification but cannot prove who produced the artifact or when. Only an application verifier can evaluate an external attestation.

## Decision 5: Keep Persistence Non-Authoritative

**Decision**: The sink helper returns `persisted` or typed `provenance.persistence_failed` and discards raw errors.

**Rationale**: Audit retention failure matters operationally but cannot reverse remote completion or a stored-object verification result that is already authoritative.

## Decision 6: Bound Disclosure At Schema And Projection Layers

**Decision**: Curated fields are exact-key validated. Authorized annotations are a bounded safe-key/string map and only allowed under `authorized-full`; safe summaries never copy annotation values, checksums, or external references.

**Rationale**: Redaction after accepting arbitrary nested objects is too easy to get wrong. An allowlist prevents unknown future fields from leaking.
