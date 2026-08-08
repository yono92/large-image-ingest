# Data Model: Evidence-Grade Ingest Integrity

## Producer Identity

Identifies the package that created a persistent artifact.

| Field | Type | Rules |
| --- | --- | --- |
| `name` | `"large-image-ingest"` | Fixed product identity |
| `version` | string | Must equal the package version at production time |

## Resume Content Identity

Required by new persistent resume records.

| Field | Type | Rules |
| --- | --- | --- |
| `algorithm` | `"sha256"` | Initial supported whole-file identity |
| `value` | string | Lowercase 64-character hexadecimal digest |
| `scope` | `"whole-file"` | Must cover every original byte in order |

The identity is copied from the source manifest checksum when the initial record is created. On resume, the selected source is hashed again and compared before transport access.

## Resume Record v0.3

Extends the durable v0.2 receipt-bearing record.

| Field | Type | Rules |
| --- | --- | --- |
| `schemaVersion` | `"large-image-ingest.resume.v0.3"` | Required discriminator |
| `producer` | Producer Identity | Required |
| `id` | string | Existing stable record ID |
| `manifest` | Ingest Manifest v1 | Must contain the same content checksum |
| `file` | Resume File Identity | Existing metadata identity plus required content identity |
| `chunking` | Resume Chunking Identity | Must match active plan exactly |
| `transport` | Resume Transport State | Sensitive, adapter-owned resume state |
| `receipts` | Upload Chunk Receipt[] | Every acknowledged chunk exactly once |
| `progress` | Resume Progress | Must agree with receipts and chunk ranges |
| `createdAt` / `updatedAt` | ISO timestamps | Existing lifecycle rules |

### Compatibility

- v0.1 remains parseable where existing recovery evidence is sufficient.
- v0.2 remains parseable and may resume only when its embedded manifest has a trustworthy whole-file checksum matching the reselected source.
- v0.1/v0.2 records without trustworthy content checksum remain inspectable but are rejected for persistent resume.
- New records are always written as v0.3.

## Transport Completion Result

Optional normalized result returned by a transport after successful completion.

| Field | Type | Rules |
| --- | --- | --- |
| `completedAt` | ISO timestamp, optional | Defaults to SDK clock when omitted |
| `storage` | Storage Target Manifest, optional | Application-approved storage reference; may be sensitive |
| `storedObject.sizeBytes` | non-negative safe integer | Required when `storedObject` is present |
| `storedObject.checksum` | Checksum Receipt, optional | Whole stored-object checksum, not a part or composite checksum unless explicitly equivalent |

Provider-specific payloads are not part of this result. Adapters retain them in their own systems.

## Ingest Completion Evidence v1

Immutable result created after transport completion facts pass classification.

| Field | Type | Rules |
| --- | --- | --- |
| `schemaVersion` | `"large-image-ingest.completion.v1"` | Required discriminator |
| `id` | string | Stable within one session |
| `createdAt` | ISO timestamp | Evidence construction time |
| `completedAt` | ISO timestamp | Remote completion time or construction time |
| `producer` | Producer Identity | Exact package version |
| `manifest` | object | Manifest ID and manifest schema version only |
| `source.sizeBytes` | non-negative safe integer | Copied from original manifest |
| `source.checksum` | File Checksum, optional | Present when source checksum calculation was enabled; required for `verified` status |
| `status` | `verified` or `completed-unverified` | Derived by core |
| `upload.transportName` | string | Normalized transport identity |
| `upload.totalBytes` | non-negative safe integer | Must equal source size |
| `upload.totalChunks` | non-negative safe integer | Planned chunk count |
| `upload.acknowledgedChunks` | non-negative safe integer | Receipt count |
| `upload.receiptDigest` | checksum object | SHA-256 digest of normalized ordered receipts |
| `storage` | Storage Target Manifest, optional | Transport result overrides intent storage when supplied |
| `verification` | object, optional | Present only for `verified` status |

### Verification Object

| Field | Type | Rules |
| --- | --- | --- |
| `verifiedAt` | ISO timestamp | Required |
| `sourceChecksum` | File Checksum | Copied from manifest |
| `storedChecksum` | Checksum Receipt | Same algorithm and value as source checksum |
| `storedSizeBytes` | non-negative safe integer | Must equal source size |

### State Derivation

```text
transport completion failed
  -> no completion evidence

transport completion succeeded, no source checksum or no equivalent stored checksum
  -> completed-unverified evidence

transport completion succeeded, stored size and same-algorithm checksum match source
  -> verified evidence

transport completion succeeded, stored size or same-algorithm checksum conflicts
  -> typed integrity failure, no successful evidence
```

## Safe Completion Summary

| Field | Allowed | Notes |
| --- | --- | --- |
| Evidence ID, manifest ID | Yes | Stable public correlation only |
| Status, schema version, producer version | Yes | Operational classification |
| Transport name, counts, algorithms, timestamps | Yes | No provider payload |
| Filename, metadata, checksum values | No | Always omitted |
| Upload ID, resume token, storage location | No | Always omitted |
| Opaque provider values | No | Never accepted into common evidence |
