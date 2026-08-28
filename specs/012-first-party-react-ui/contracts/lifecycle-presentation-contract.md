# Contract: Lifecycle And Presentation Ownership

## Ownership Matrix

| Concern | Owner | UI responsibility |
| --- | --- | --- |
| Local selection gesture | First-party UI coordinator | Preserve one exact `File`; provide keyboard and drag/drop paths. |
| Validation policy | Existing ingest configuration/core | Present safe issues; never override pass/fail. |
| Fingerprint/checksum | Core/headless controller | Present authoritative preparation progress only. |
| Manifest and chunk plan | Core | Never construct or render full values. |
| Upload session and retry | Core plus transport adapter | Present controller status and safe retry guidance. |
| Acknowledged progress | Core receipts/snapshot | Format bytes and progress; do not interpolate unacknowledged bytes. |
| Pause/resume/cancel | Existing controller | Invoke once and present requested-action state until controller settles. |
| Durable record storage | Existing resume store | Discover, project, match, and optionally discard through configured policy. |
| Compatibility | Core resume classifier | Enable Resume only for compatible source/chunking. |
| Transfer completion | Existing controller | Present as transfer-completed, not verified. |
| Stored verification | Application adapter/server | Present pending/result and optional retry. |
| Preview | Host derivative pipeline | Render caller-supplied derivative only. |
| Theme and labels | Host application within contract | Apply tokens, classes, slots, and label overrides. |

## Action Matrix

| Phase | Select/replace | Remove | Start | Pause | Resume | Cancel | Verify retry |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `empty` | yes | no | no | no | after compatible reselection | no | no |
| `selected` | yes | yes | yes | no | if compatible choice exists | no | no |
| preparation/create | no | cancel first | no | no | no | yes | no |
| `uploading` | no | cancel first | no | yes | no | yes | no |
| `pause_requested` | no | cancel first | no | no | no | yes | no |
| `paused` | detach only when recovery exists | policy-dependent | no | no | yes | yes | no |
| `resuming` | no | cancel first | no | yes when controller permits | no | yes | no |
| `completing` | no | no | no | no | no | controller capability only | no |
| `transfer_completed` | yes | yes | no | no | no | no | if unavailable/retryable |
| `verified` | yes | yes | no | no | no | no | no |
| `verification_failed` | yes | yes | no | no | no | no | if retryable |
| `failed` | replace allowed | yes | retry/new start according to controller | no | with compatible record | cleanup if available | no |
| `canceled` | yes | yes | new start allowed | no | no | no | no |

Disabled controls are omitted or disabled consistently and explain why through nearby state text when the reason is not obvious.

## Error Category Mapping

| Typed prefix/code | UI category | Default guidance |
| --- | --- | --- |
| `file.*`, `metadata.*`, `image.*`, `checksum.mismatch`, `validation.failed` | validation | Select a compliant source or correct required metadata. |
| `resume.*` | compatibility | Reselect the original, refresh recovery, or use configured discard policy. |
| `transport.paused` | none/paused | Present paused state, not an error alert. |
| `transport.canceled` | none/canceled | Present canceled state, not a failure alert. |
| other `transport.*` | transport | Retry when typed retryability permits or cancel/replace source. |
| cleanup observer signal | cleanup | Upload result remains; explain that local recovery cleanup needs attention. |
| observer failure | observer | Explain that UI/observer reporting failed while ingest authority remained isolated. |
| `verification.*` | verification | Keep transfer-completed result visible and offer configured verification retry. |
| unknown | unknown | Show generic safe guidance and deliver original cause only to application callback. |

Raw messages pass through the existing safe diagnostic sanitizer before default display. Host label overrides must not interpolate arbitrary error details.

## Recovery Sequence

```text
provider mounts
  -> list and validate recoverable records
  -> project safe choices
  -> show reselection requirement
user selects File
  -> classify every current recoverable choice
  -> exactly one compatible choice may be selected by default
  -> mismatches remain safe summaries and cannot trigger resume
user chooses Resume
  -> create controller for exact File
  -> controller.resume(private record id)
  -> controller owns all later states
```

If multiple choices classify as compatible, the UI requires explicit user selection rather than guessing. Cross-tab locking is not added in this feature; documentation must warn that applications should provide one controlling tab until a separate coordination contract exists.

## Verification Sequence

```text
controller completes -> phase transfer_completed
if verifier absent -> verification not_configured
if verifier present -> verification pending
  -> verified | failed | unavailable
retry only when adapter result marks retryable
```

Changing source aborts or ignores an obsolete verification promise through an operation generation/abort signal so a late result cannot attach to the wrong source.
