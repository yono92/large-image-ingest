# BagIt And OCFL Preservation Export

`large-image-ingest/preservation` is a Node-only, explicitly invoked bridge from a verified ingest to either a new BagIt 1.0 package or a new OCFL 1.1 object version. It does not change upload sessions, manifests, provenance artifacts, or source bytes.

## Supported Profiles

| Profile | Output boundary | Digest |
| --- | --- | --- |
| `bagit-1.0-sha256` | One new BagIt 1.0 package under RFC 8493 | SHA-256 payload and tag manifests |
| `ocfl-1.1-sha256` | One new OCFL 1.1 object with only `v1` | SHA-256 content addressing and inventory sidecars |

The API does not import arbitrary bags or OCFL objects, append object versions, manage an OCFL storage root, synchronize repository history, apply retention policy, or certify regulatory compliance.

## Preflight Mapping

Call `evaluatePreservationMapping()` before choosing an output directory. Preflight reads every selected Blob in bounded checksum slices, compares it with existing whole-file SHA-256 evidence, validates derivative source identity and provenance integrity, assigns deterministic paths, and returns one of:

- `exportable`
- `exportable_with_warnings`
- `blocked`

`require-existing` is the default digest policy. `calculate-and-verify` permits a missing digest to be calculated, but any existing digest still has to match. A missing source, changed bytes, unsupported digest, non-created derivative, mismatched source relationship, invalid provenance, or unsafe mapping blocks materialization before filesystem output begins.

The returned mapping owns a private verified-source handle. A mapping reconstructed from JSON is intentionally not executable.

```ts
import {
  evaluatePreservationMapping,
  exportBagIt,
  validateBagIt
} from "large-image-ingest/preservation";

const mapping = await evaluatePreservationMapping({
  profile: "bagit-1.0-sha256",
  manifest,
  original: { bytes: originalFile },
  derivatives: [{ derivative: previewReference, bytes: previewBlob }],
  provenance,
  digestPolicy: "require-existing"
});

if (mapping.status !== "blocked") {
  await exportBagIt(mapping, { destination: "/new/export/bag" });
  const result = await validateBagIt("/new/export/bag");
}
```

## Mapping And Paths

Source filenames, storage hints, URLs, object keys, and caller metadata never become filesystem paths.

- The original is `original/source.bin`.
- Derivatives use an ordinal and a short SHA-256 of the derivative ID.
- Manifest, provenance, and relationship metadata use fixed `metadata/` roles.
- BagIt prefixes original and derivative paths with `data/` and stores SDK metadata below `large-image-ingest/` as tag files.
- OCFL maps logical paths to `v1/content/<digest-prefix>/<sha256>`. Identical bytes are written once and may have multiple logical paths.

Path validation rejects absolute paths, traversal, backslashes, control characters, empty segments, Unicode normalization changes, case-normalized collisions, and file/directory prefix conflicts.

## Relationship Sidecar

`large-image-ingest.preservation-relationships.v1` retains semantics that BagIt and OCFL do not natively express: the unique original, derivative IDs and kinds, source manifest identity, metadata paths, and digest relationships. It has its own RFC 8785 canonical JSON SHA-256 and is protected again by the BagIt tag manifest or OCFL inventory.

Base-standard consumers can validate payload/content fixity without this SDK. The SDK validator reports relationship validation as failed if the sidecar is absent, changed, malformed, or inconsistent.

## Materialization And Recovery

Export requires a destination that does not exist. Content is streamed into a sibling directory named with an `.incomplete-` marker, self-validated, and promoted only after validation succeeds. A failed or interrupted write never replaces a completed destination; the incomplete directory remains distinguishable so the application can diagnose or clean it deliberately.

Blob hashing uses bounded `slice()` reads and file output uses streams. Neither path creates an application-owned buffer proportional to source size. Actual throughput, filesystem cache, Node runtime RSS, validation rereads, free disk space, and repository transaction semantics remain environment responsibilities.

## Independent Validation

`validateBagIt()` checks the BagIt declaration, complete payload-manifest coverage, payload SHA-256, complete tag-manifest coverage, tag SHA-256, safe paths, and relationship consistency.

`validateOcflObject()` checks the object declaration, root/version inventory parity, inventory digest sidecars, inventory structure, manifest/state agreement, content coverage and SHA-256, logical/content paths, and relationship consistency.

Validators return safe typed issue codes and counts. Routine mappings, results, exceptions, and validation reports omit filesystem roots, filenames, metadata values, credentials, secret URLs, object keys, recovery records, and provider receipts.

## Non-goals

Preservation export does not decode pixels, create derivatives, recompress images, resize images, remove EXIF, edit the source manifest, or make provenance actor trust authoritative. It is a packaging and fixity boundary, not a preservation repository.

Standards references: [RFC 8493: The BagIt File Packaging Format](https://www.rfc-editor.org/rfc/rfc8493.html) and [OCFL 1.1](https://ocfl.io/1.1/spec/).
