# Data Model: Preservation Interoperability

## Preservation Profile

`bagit-1.0-sha256` or `ocfl-1.1-sha256`. Each fixes standard version, digest algorithm, path rules, required metadata, and validation obligations.

## Mapping

| Field | Purpose |
| --- | --- |
| `schemaVersion` | `large-image-ingest.preservation-mapping.v1` |
| `profile` / `standardVersion` | explicit compatibility target |
| `status` | `exportable`, `exportable_with_warnings`, or `blocked` |
| `manifestId` | safe correlation identity |
| `entries` | original/derivative/generated metadata roles, logical paths, SHA-256, size, availability |
| `warnings` / `blockers` | safe typed reason codes only |
| `extensionUsage` | relationship sidecar and provenance availability |

Mapping retains private Blob sources only in a non-serializable execution handle; report fields never include filenames, provider locations, or filesystem roots.

## Relationship Sidecar

Records the manifest ID, exactly one original logical path/digest, derivative ID/kind/status/logical path/digest relationships, manifest/provenance paths, standard profile, and its own JCS/SHA-256 integrity. Missing/corrupt/inconsistent sidecars make relationship validation fail while base standard validators can still validate fixity.

## OCFL Inventory

One v1 inventory with `id`, OCFL type URI, `digestAlgorithm: sha256`, `head: v1`, `manifest`, and `versions.v1.state`. Manifest maps digest to one physical content path; state maps digest to one or more logical paths.

## Materialization Result

Returns standard/profile/status and safe counts only. Paths supplied by the caller or internal incomplete directory names are never returned in routine failure messages.
