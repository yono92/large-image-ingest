# Data Model: Uppy UI Integration

The runtime integration adds no manifest or resume schema. These models describe example-private composition state and durable planning evidence.

## Selected Source

- `uppyFileId`: Uppy-local identity used only to follow selection/removal events
- `file`: the original local browser `File` handed unchanged to large-image-ingest
- `name`, `size`, `mediaType`, `lastModified`: display and compatibility attributes derived from the selected file
- `selectionState`: `selected`, `locked`, or `removed`

Validation rules:

- There is at most one selected source in the initial recipe.
- `file` must be a local `File`, not a remote-provider placeholder or transformed Blob.
- Uppy restrictions may reject early for usability, but large-image-ingest validation is authoritative.
- The selected filename is display metadata only and never becomes a local server path.

## Integration Session View

- `selectedSource`: current Selected Source
- `controller`: one large-image-ingest controller created for that exact file
- `ingestStatus`: existing authoritative controller status
- `uploadedBytes`, `totalBytes`, `progress`: acknowledged ingest progress
- `recordId`: durable resume record identifier when available
- `safeError`: typed code and safe message suitable for the example UI
- `verificationStatus`: `not_started`, `checking`, `verified`, or `failed`
- `remoteStatusId`: opaque local reference session identity used to fetch safe verification state

Relationships:

- One Selected Source has at most one active Integration Session View.
- The controller owns the core session; the view does not create another upload operation.
- A record ID may survive the view and Uppy instance across reload.
- The verification status is downstream of transfer completion and cannot turn a failed integrity check into completed success.

## Selection And Ingest State Transitions

```text
empty -> selected -> locked -> terminal
  ^         |          |         |
  |         `-> removed           `-> replace/reset -> empty
  |                    |
  `------ reselect <---'

selected -> validating -> creating -> uploading -> completing -> completed -> verifying -> verified
                                  |          |             |
                                  |          |             `-> verification_failed
                                  |          `-> paused -> resuming -> uploading
                                  `-> failed / canceled
```

Rules:

- Selection becomes locked when start or resume begins.
- Active removal cannot silently detach the source. It first invokes the authoritative cancellation policy or is refused until terminal.
- A page reload clears Uppy selection and in-memory controller state but leaves the versioned resume record and remote reference state.
- Resume is enabled only after the reselected source is classified compatible with a recoverable record.
- Completion is not presented as verified until the reference service reports stored-file integrity success.

## Local Reference Upload

- `uploadId`: random server identity; never derived from filename
- `manifest`: validated manifest received when the session is created
- `totalBytes`: expected original size
- `stagingPath`: server-generated path under a temporary root
- `targetPath`: server-generated completed-original path under the same controlled root
- `acknowledgedChunks`: chunk index, byte range, size, and receipt digest
- `receivedBytes`: total accepted request bytes for diagnostics
- `duplicateBytes`: repeated bytes detected by the harness
- `status`: `open`, `completed`, or `canceled`
- `verification`: `pending`, `verified`, or `failed`

Validation rules:

- Chunk ranges must fall within the declared total and match their body length.
- Completed ranges must cover the source exactly before finalization.
- A completed or canceled upload rejects later mutation.
- Finalization verifies byte count and required checksum before promotion.
- Public status omits filesystem paths, full manifests, metadata, resume handles, and request bodies.

## Friction Record

- `id`: stable document identifier
- `journey`: selection, validation, start, progress, pause, recovery, cancellation, removal, completion, or verification
- `reproduction`: minimal repeatable steps
- `observedConsequence`: user or developer impact
- `severity`: `blocker`, `high`, `medium`, or `low`
- `classification`: `documentation-example`, `application-composition`, `public-api`, or `upstream-uppy`
- `ownershipBoundary`: which system currently owns the affected responsibility
- `workaround`: safe current approach, or `none`
- `evidence`: test, example location, or observed result
- `contractImplication`: no change, documentation change, example helper, or candidate public contract
- `status`: `open`, `resolved`, `accepted`, or `escalated`

## Adapter Decision

- `evaluatedAt`: decision date
- `evidenceIds`: friction records used
- `mandatoryFlowBlocked`: whether a required scenario is unsafe or impossible with public APIs
- `repeatedLibraryOwnedGap`: whether multiple material records point to the same application-agnostic gap
- `outcome`: `defer` or `specify-adapter`
- `rationale`: evidence-linked explanation
- `nextFeature`: separate feature directory when the outcome is `specify-adapter`

Invariant: `specify-adapter` never authorizes implementation by itself; a new spec, clarification, plan, and tasks are still required.

## tus-js-client Review Brief

- `currentNeed`: evidence the existing raw tus transport does or does not satisfy
- `responsibilityMatrix`: source slicing, chunk scheduling, retry, progress, pause, termination, URL persistence, local resume record, remote offset validation, receipts, completion, and parallelism
- `compatibilityQuestions`: manifest, receipt, error, transport-session, and resume-schema implications
- `experiments`: bounded prototypes or comparisons required before a decision
- `migrationRisk`: behavior and persisted-state compatibility for current tus users
- `options`: retain current transport, replace internals compatibly, add an alternate adapter, or add a new transport execution mode
- `decisionCriteria`: measurable benefits and unacceptable ownership conflicts
- `status`: `review-ready`, `needs-experiment`, `go`, or `no-go`
