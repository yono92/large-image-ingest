# Data Model: First-Party Inspection Upload UI

The UI adds presentation entities only. Manifests, upload snapshots, receipts, and resume records retain their existing schemas and remain authoritative.

## Inspection UI Phase

Canonical presentation phase derived from selection state, headless controller state, preparation progress, requested control action, and verification state.

| Phase | Meaning | Authoritative source |
| --- | --- | --- |
| `empty` | No local source is selected. | UI selection state |
| `selected` | One exact local source is selected; no ingest has started. | UI selection state plus idle controller |
| `validating` | Ingest policy and source metadata are being evaluated. | Headless controller preparation state |
| `preparing_identity` | Fingerprint/checksum identity work is active. | Headless controller preparation/checksum progress |
| `creating_upload` | Validation passed and the transport session is being created. | Headless controller state and validated event |
| `uploading` | Chunks are transferring; byte progress is acknowledged progress. | Upload snapshot |
| `pause_requested` | The user requested pause and the active operation is settling safely. | UI control intent plus active controller |
| `paused` | The controller reports a paused recoverable or transient state. | Upload snapshot/controller |
| `resuming` | Compatibility passed and the remote session is being resumed. | Controller |
| `cancel_requested` | Cancellation is in flight. | UI control intent plus controller cancel promise |
| `canceled` | Cancellation reached a terminal state. | Upload snapshot/controller |
| `completing` | All chunks are acknowledged and transport completion is in progress. | Upload snapshot |
| `transfer_completed` | Transport completion succeeded; stored verification is absent or pending. | Controller manifest result plus verification state |
| `verified` | Stored-original verification succeeded. | Verification adapter result |
| `verification_failed` | Transfer succeeded but stored-original verification failed. | Verification adapter result |
| `failed` | A non-verification ingest operation failed. | Controller error/snapshot |

The phase is presentational. It cannot advance transport state and cannot override a contradictory controller snapshot.

## Selected Inspection Source

Represents the one exact local source held by the UI coordinator.

| Field | Description | Constraint |
| --- | --- | --- |
| `file` | Original browser file object | Stored by reference; never copied or transformed |
| `name` | Display filename | Treated as untrusted text |
| `sizeBytes` | Source byte length | Non-negative safe integer |
| `mediaType` | Browser-provided type or unknown | Display hint, not validation authority |
| `lastModified` | Optional browser modification time | Safe formatted display only |
| `selectionId` | UI-local opaque identity | Not persisted and not an upload ID |

Identity rule: replacing `file` always creates a new selected source and a new controller. A controller is never retargeted.

## Preparation Progress

Additive headless-controller state used before upload creation.

| Field | Description |
| --- | --- |
| `phase` | `validating`, `preparing_identity`, or `creating_upload` |
| `processedBytes` | Bytes observed by bounded checksum preparation when available |
| `totalBytes` | Selected source size |
| `progress` | Normalized value when byte progress exists; otherwise indeterminate |

The UI must show indeterminate progress when the underlying operation cannot report bytes. It must not invent a time estimate.

## Recovery Choice Summary

Minimal presentation derived from a recoverable resume record.

| Field | Description | Exposure rule |
| --- | --- | --- |
| `key` | UI-local opaque choice key | May be used in control wiring; not presented as meaningful customer data |
| `fileName` | Safe filename display | Escaped as text |
| `sizeBytes` | Original size | Safe display |
| `updatedAt` | Last checkpoint time | Safe formatted display |
| `uploadedBytes` | Acknowledged durable progress | Safe display |
| `totalBytes` | Original total bytes | Safe display |
| `transportLabel` | Optional non-secret transport name | No URL, path, bucket, or object key |
| `compatibility` | `awaiting_source`, `compatible`, `file_mismatch`, `chunking_mismatch`, or `expired` | Derived through public compatibility APIs |

The underlying record ID and full record remain inside the coordinator/recovery adapter and are never passed to arbitrary presentation slots.

## Safe UI Error

Presentation-safe interpretation of a typed ingest failure.

| Field | Description |
| --- | --- |
| `category` | `validation`, `compatibility`, `transport`, `cancellation`, `cleanup`, `observer`, `verification`, or `unknown` |
| `code` | Stable typed code when available |
| `title` | Short default label, overridable through the label contract |
| `guidance` | Safe recovery guidance chosen by category and retryability |
| `retryable` | Whether retry is supported by the authoritative contract |
| `cause` | Original error available only to application callbacks; never rendered automatically |

Routine presentation excludes raw details, URLs, paths, records, manifests, and provider payloads.

## Verification Presentation

| Field | Description |
| --- | --- |
| `status` | `not_configured`, `pending`, `verified`, `failed`, or `unavailable` |
| `issues` | Safe issue codes and severity only |
| `checkedAt` | Optional verification completion time |
| `retryable` | Whether the application permits verification retry |

Verification state begins only after authoritative transfer completion. `completed` never implies `verified`.

## Inspection UI State

Aggregate immutable snapshot consumed by the panel, primitives, and `useInspectionUploadUi`.

| Group | Fields |
| --- | --- |
| Selection | selected source, selection locked, supported action |
| Presentation | phase, status label key, busy state, requested control action |
| Preparation | optional preparation progress |
| Transfer | uploaded bytes, total bytes, normalized acknowledged progress, current controller state |
| Recovery | safe recovery choices, selected compatible choice, recovery loading/error |
| Result | safe UI error, manifest result reference for callbacks, verification presentation |
| Controls | booleans for select, remove, start, pause, resume, cancel, retry verification |

## State Transitions

```text
empty -> selected -> validating -> preparing_identity -> creating_upload
      -> uploading -> completing -> transfer_completed -> verified
                    |             |                     -> verification_failed
                    |             -> failed
                    -> pause_requested -> paused -> resuming -> uploading
                    -> cancel_requested -> canceled

reload + recoverable record -> empty with recovery choices
reselect compatible source -> selected + compatible recovery -> resuming
reselect incompatible source -> selected + mismatch (no remote transition)
```

## Invariants

1. At most one selected source and one ingest controller exist in one provider.
2. The exact selected `File` is passed to the controller factory.
3. Only controller operations can start, resume, pause, cancel, or complete ingest.
4. UI progress never exceeds acknowledged controller progress.
5. Recovery cannot call `resume` until public compatibility classification succeeds.
6. Full resume records and transport evidence never enter render state.
7. Verification cannot become `verified` solely from controller completion.
8. A preview descriptor is always labeled `derivative` and never changes source identity.
9. Custom slots cannot replace the live status region or remove required accessible names from lifecycle controls.
