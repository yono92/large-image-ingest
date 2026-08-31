# Research: Preservation Standard Interoperability

## BagIt 1.0

**Decision**: Produce `bagit.txt`, `data/`, `manifest-sha256.txt`, versioned SDK tag files, and `tagmanifest-sha256.txt`.

**Rationale**: RFC 8493 requires BagIt 1.0 declaration, at least one complete payload manifest, payload paths under `data/`, and defines tag manifests that must list payload manifests and must not list themselves or payload files.

**Source**: [RFC 8493](https://www.rfc-editor.org/rfc/rfc8493.html)

## OCFL 1.1

**Decision**: Produce one new OCFL object with declaration `0=ocfl_object_1.1`, root and `v1` inventories, SHA-256 inventory sidecars, `v1/content`, and one current state. Use SHA-256 for content addressing.

**Rationale**: OCFL 1.1 permits SHA-256 or SHA-512 for content addressing, requires inventory manifest/state agreement, and requires every inventory occurrence to have a digest sidecar written after inventory completion.

**Sources**: [OCFL 1.1 Specification](https://ocfl.io/1.1/spec/), [OCFL 1.1 Validation Codes](https://ocfl.io/1.1/spec/validation-codes.html)

## Digest Identity And Deduplication

**Decision**: BagIt keeps one payload path per role. OCFL writes one physical content path per digest and lets state map that digest to multiple logical roles.

**Rationale**: OCFL explicitly separates content paths from logical state and supports digest-based deduplication; BagIt payload manifests enumerate each payload file path.

**Source**: [OCFL 1.1 Implementation Notes](https://ocfl.io/1.1/implementation-notes/)

## Relationship Sidecar

**Decision**: Use `large-image-ingest.preservation-relationships.v1`, canonical JSON, and embedded SHA-256 integrity. Protect it again with the BagIt tag manifest or OCFL inventory.

**Rationale**: Neither base standard knows the SDK's original/derivative/provenance semantics. A documented extension preserves them without making standard validation depend on the SDK.

## Atomic Boundary

**Decision**: Map/verify first, then stream to a sibling incomplete directory and rename only after self-validation.

**Rationale**: The APIs only create new exports. This avoids partially replacing a valid destination and leaves failed work identifiable for application cleanup.
