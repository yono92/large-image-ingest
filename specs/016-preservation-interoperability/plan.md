# Implementation Plan: Preservation Standard Interoperability

**Branch**: `[016-preservation-interoperability]` | **Date**: 2026-08-31 | **Spec**: [spec.md](spec.md)

## Summary

Add a Node-only `large-image-ingest/preservation` subpath for preflight mapping, new BagIt 1.0 package export/validation, and new single-version OCFL 1.1 object export/validation. Mapping verifies every selected Blob against trusted SHA-256 evidence before filesystem mutation, assigns deterministic source-independent paths, and emits a versioned integrity-protected relationship sidecar. Materialization streams content into a sibling `.incomplete-*` directory, validates it, and promotes it only when the final destination does not exist.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+

**Dependencies**: native Node filesystem, streams, and crypto; existing manifest, derivative, provenance, and checksum contracts; no new runtime dependency

**Storage**: caller-selected new filesystem directory only; no repository root management or append/update support

**Testing**: Vitest with temporary directories, independent standard-layout validators, mutation/path/interruption fixtures, and streaming memory instrumentation

**Standards**: BagIt 1.0 / RFC 8493; OCFL 1.1 object conformance with SHA-256 content addressing and inventory sidecars

**Constraints**: preflight before mutation; byte-for-byte originals; created derivatives only; safe deterministic paths; no existing destination replacement; fixed-size Blob slicing/streaming; safe typed errors

## Clarification Result

No critical ambiguity remains. The first release is deliberately limited to one new bag or one new OCFL v1 object, uses SHA-256 for both profiles, includes manifest/provenance/relationship metadata as protected tag or object content, and treats imports, appends, storage roots, repository transactions, and multi-version synchronization as unsupported.

## Constitution Check

- **Original preservation — PASS**: input Blobs are hashed and streamed unchanged; no decode/transform path exists.
- **Recoverability — PASS**: failed output remains explicitly incomplete and never replaces a valid destination.
- **Adapter boundaries — PASS**: preservation is a separate Node subpath; upload transports/core state remain unchanged.
- **TypeScript/versioning — PASS**: profile, mapping, sidecar, result, and issue contracts are exported and versioned.
- **Validation/security — PASS**: paths are generated from roles/indices/digests rather than filenames; reports contain safe codes/categories.
- **Documentation/tests — PASS**: independent BagIt/OCFL validation, mutations, collisions, deterministic mapping, and memory bounds are release gates.

## Architecture

### Mapping

`evaluatePreservationMapping()` accepts a manifest, accessible original Blob, selected derivative Blobs, optional provenance, and a fixed profile. It validates source/derivative relationships, calculates SHA-256 with bounded slices, compares trusted evidence, creates generated metadata bytes, and returns `exportable`, `exportable_with_warnings`, or `blocked` plus safe reasons. No filesystem path is accepted or touched during mapping.

### Paths And Relationships

The original always maps to `original/source.bin`. Derivatives map by ordinal plus a short hash of their semantic ID, never their filename/storage hint. Manifest, provenance, and the relationship sidecar use fixed metadata paths. Prefix/case/normalization collisions and unsafe segments are validated before output.

BagIt adds `data/` to content logical paths and keeps SDK metadata as tag files protected by `tagmanifest-sha256.txt`. OCFL stores every logical file under `v1/content/<digest-prefix>/<digest>` and maps digests to one or more logical state paths, naturally deduplicating identical bytes.

### Materialization

Export requires an already exportable mapping and a destination that does not exist. The writer creates a sibling hidden `.incomplete-*` directory, streams each unique Blob, writes standard metadata, validates the staged export, then renames it to the final destination. Failure leaves the incomplete directory distinguishable and reports only safe categories.

### Validation

BagIt validation checks declaration, complete payload manifest coverage, payload SHA-256, tag manifest coverage/digests, and relationship sidecar consistency. OCFL validation checks declaration, root/version inventory parity, inventory sidecars, manifest/content/state agreement, content digests, path safety, and sidecar relationships.

## Compatibility Strategy

- Add a Node-only subpath; no root/core/session API changes.
- Keep manifest v1, provenance v1, and resume schemas unchanged.
- Use shared release 1.6.0.
- Reject existing destinations and unsupported standard versions without mutation.

## Verification Strategy

1. Export and independently validate one original, two derivatives, manifest, provenance, and relationship sidecar in both standards.
2. Mutate files, manifests, inventories, sidecars, declaration files, and inventory digest sidecars.
3. Test unsafe names, identical names, identical bytes, normalization/prefix conflicts, missing digests/content, and unsupported provenance.
4. Prove deterministic mappings and OCFL digest deduplication.
5. Stream a synthetic large Blob while asserting bounded slice/read size and no full-size application buffer.
6. Inject write interruption and verify no completed destination replacement.
7. Run package and full repository gates.

## Complexity Tracking

No constitution violations. A Node-only single-version exporter is the smallest useful standard boundary; repository history management and arbitrary import remain separate future work.
