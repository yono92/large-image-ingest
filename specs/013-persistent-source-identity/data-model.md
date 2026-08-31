# Data Model: Persistent Source Identity and Responsive Checksum

## Content Source Identity V1

Versioned evidence that every original source byte participated in one cryptographic digest.

| Field | Type | Constraint |
| --- | --- | --- |
| `schemaVersion` | `"large-image-ingest.source-identity.v1"` | Required discriminator |
| `algorithm` | `"sha256"` | Only supported v1 algorithm |
| `scope` | `"whole-file"` | Cannot represent metadata or samples |
| `sizeBytes` | non-negative safe integer | Must equal source, manifest, and chunking totals |
| `value` | 64-character lowercase hexadecimal string | Sensitive; never included in routine diagnostics/UI |

The identity may be constructed from a validated `FileChecksum` with the same algorithm, scope, size, and source traversal. `calculatedAt` and checksum slice size remain checksum provenance, not identity equality inputs.

## Checksum Execution

### Checksum Execution Request

| Field | Meaning |
| --- | --- |
| `algorithm` | SHA-256 |
| `chunkSize` | Fixed bounded read size, minimum 64 KiB |
| `signal` | Cancellation authority |
| `onProgress` | Optional observer receiving sanitized byte progress |
| `onObserverError` | Optional isolated reporting callback |
| `executor` | Optional execution strategy, such as browser Worker |
| `fallback` | `"error"` or explicit `"inline"` |

### Progress Invariants

1. `0 <= loadedBytes <= totalBytes == source.size`.
2. Accepted `loadedBytes` never decreases.
3. `chunkIndex` and `totalChunks` are bounded integers when present.
4. Callback exceptions do not reject the calculation.
5. No progress or result is accepted after cancellation.

### Operation Lifecycle

```text
idle -> running -> completed
              -> canceled
              -> failed
              -> superseded (consumer generation changed)
```

Only `completed` may publish a checksum. Controller/UI generations additionally require the operation to still belong to the same exact selected source.

## Resume File Identity

Legacy fields remain unchanged:

- name
- size
- media type
- optional last modified time
- metadata fingerprint

`ResumeRecordV0_3.file` additionally requires `contentIdentity: ContentSourceIdentityV1`. Metadata fields are preliminary filters; `contentIdentity` is the durable skip authority.

## Resume Record V0.3

`large-image-ingest.resume.v0.3` retains all v0.2 fields and requires strong content identity.

| Group | Invariant |
| --- | --- |
| Identity | Manifest ID/creation, file totals, chunk totals, and content identity totals agree |
| Transport | Upload ID, optional resume token/expiration/data remain unchanged during migration |
| Receipts | Durable receipt indexes, ranges, and uploaded bytes agree |
| Progress | Ranges are bounded/normalized and next index is derived from them |
| Security | No binary source payload; raw record stays out of default errors/events/UI |
| Version | New writers use v0.3; readers accept v0.1/v0.2/v0.3 |

## Compatibility Result

| Field | Values | Meaning |
| --- | --- | --- |
| `status` | `resumable`, `upgradeable`, `restart_only`, `expired`, `incompatible` | Safe application action |
| `reason` | typed non-sensitive code | Why the status was selected |
| `recordId` | optional opaque ID | Application/store correlation only |
| `sourceIdentity` | internal/result option only | Never rendered or logged by default |

Core reasons include source mismatch, identity evidence missing, chunking mismatch, transport unsupported, transport mismatch, receipt evidence missing/invalid, terminal record, expiration, and malformed schema.

## Legacy Migration State

```text
read/list -> validate structure -> safe summary (no write)
reselect -> calculate whole-file identity -> classify (no write, no transport)
resume -> recover remote session only if classification permits
checkpoint -> optionally promote while preserving authoritative fields
```

Promotion invariants:

1. Record ID, manifest identity, transport identity/data, provider receipts, acknowledged ranges, and created time remain unchanged.
2. No content identity or receipt is guessed.
3. A progressed v0.1 record that lacks durable provider receipts is not promoted when v0.3 would require fabricated receipts.
4. Failure to qualify preserves the original record for explicit cleanup or a new ingest.

## Compatibility Matrix

| Record | Progress | Trustworthy manifest SHA-256 | Transport evidence | Exact source | Outcome |
| --- | ---: | ---: | --- | ---: | --- |
| v0.3 | any recoverable | content identity required | valid | yes | `resumable` |
| v0.3 | any recoverable | required | valid | no | `incompatible/source_mismatch` |
| v0.2 | any recoverable | yes | valid receipts | yes | `upgradeable` |
| v0.2 | progressed | no | valid receipts | unknown | `incompatible/identity_missing` |
| v0.2 | zero | no | valid | n/a | `restart_only` |
| v0.1 | zero | yes | no acknowledged receipt required | yes | `upgradeable` at first checkpoint |
| v0.1 | progressed | yes | tus/offset evidence sufficient | yes | `resumable`, retained v0.1 unless safe promotion becomes possible |
| v0.1 | progressed | yes/no | S3 part receipts absent | any | `incompatible/receipt_missing` |
| v0.1 | progressed | no | any | unknown | `incompatible/identity_missing` |
| v0.1/v0.2/v0.3 | expired | any | any | any | `expired` |
| v0.1/v0.2/v0.3 | terminal | any | any | any | `restart_only` or explicit cleanup; never resume |

## Transport Recovery Capabilities

Normalized summary:

| Field | Meaning | Missing value |
| --- | --- | --- |
| `resumable` | Generic protocol can continue some upload | Existing declared boolean |
| `snapshotResume` | Caller-supplied in-memory snapshot may recover | `false` |
| `persistentResume` | Durable record may recover after reload/process loss | `false` |

The normalized summary does not contain Worker/checksum capability. Transport recovery and checksum execution remain independent responsibilities.

## Manifest Provenance

The manifest keeps schema `large-image-ingest.manifest.v1`.

```text
manifest.schemaVersion = artifact contract version
manifest.library.name = producing package name
manifest.library.version = producing package release (1.5.0)
```

Producer version is not used to change manifest validation semantics.
