# Data Model: Verified Ingest Workflow

## Authority Model

The workflow is a projection across existing authorities. It MUST NOT replace the authority named in this table.

| Fact | Authority | Durable evidence | Workflow role |
| --- | --- | --- | --- |
| Source bytes and whole-file identity | Original `Blob`/`File` plus manifest checksum | Manifest v1 and source identity | References and enforces identity |
| Domain policy result | Domain profile evaluator | Profile evaluation and effective-policy digest | Sequences evaluation and binding |
| Upload progress, pause, retry, resume, cancel, completion | `LargeImageIngestSession` | Snapshot, resume v0.3 record, receipts, completion event | Projects state; never decides chunks |
| Stored-original correctness | Application verifier | Typed verification result | Invokes and records result |
| Lifecycle evidence | Provenance recorder | Provenance v1 artifact and integrity | Feeds existing events, records policy/verification, seals |
| Durable evidence write | Application evidence sink | Idempotent persistence receipt | Coordinates and checkpoints |
| Preservation completion | Application preservation adapter | Safe handoff receipt or existing exporter result | Optional final stage |
| External actor/time trust | Application trust system | External attestation reference | Reports separately; never infers |

## Workflow Identity

One `workflowId` identifies one source ingest attempt across process restarts. It is stable after initial checkpoint creation. A future batch layer may group multiple workflow IDs under a separate collection ID; no v1 field assumes that one workflow is the only member of a batch.

Fields:

- `workflowId`: safe opaque ID, stable across resume/retry.
- `correlationId`: stable safe correlation label shared with provenance.
- `manifestId`: assigned during preparation and immutable afterward.
- `sourceIdentity`: whole-file SHA-256 and exact byte count.
- `profileReference`: name, semantic version, and effective-policy digest.
- `revision`: monotonically increasing checkpoint revision for compare-and-set persistence.

## Workflow State

```text
preparing
  -> prepared
  -> failed(stage=preparation)

prepared
  -> uploading
  -> canceled

uploading
  -> paused -> uploading
  -> uploaded_unverified
  -> failed(stage=upload)
  -> canceled
  -> reconciliation_required(stage=upload_completion)

uploaded_unverified
  -> verifying
  -> stopped(lastAuthority=uploaded_unverified)

verifying
  -> verified
  -> verification_failed
  -> reconciliation_required(stage=verification)

verification_failed
  -> verifying (retry)
  -> stopped(lastAuthority=uploaded_unverified)

verified
  -> persisting_evidence
  -> stopped(lastAuthority=verified)

persisting_evidence
  -> evidence_persisted
  -> evidence_persistence_failed
  -> reconciliation_required(stage=evidence_persistence)

evidence_persistence_failed
  -> persisting_evidence (retry/reconcile)
  -> stopped(lastAuthority=verified)

evidence_persisted
  -> terminal success (when preservation is not requested)
  -> preserving (when requested)

preserving
  -> finalizing_evidence (after a successful or failed handoff)
  -> reconciliation_required(stage=preservation)

finalizing_evidence
  -> preserved (successful handoff recorded in durable bundle revision)
  -> preservation_failed (failed handoff recorded in durable bundle revision)
  -> evidence_finalization_failed
  -> reconciliation_required(stage=evidence_finalization)

evidence_finalization_failed
  -> finalizing_evidence (retry/reconcile without repeating preservation)
  -> stopped(lastAuthority=evidence_persisted)

preservation_failed
  -> preserving (retry/reconcile)
  -> stopped(lastAuthority=evidence_persisted)
```

`stopped` means the operator intentionally stops downstream coordination after an already authoritative stage. It is a terminal-incomplete result, not a cancellation of prior work.

### State families

- **Active**: `preparing`, `uploading`, `verifying`, `persisting_evidence`, `preserving`, `finalizing_evidence`.
- **Stable resumable**: `prepared`, `paused`, `uploaded_unverified`, `verification_failed`, `verified`, `evidence_persistence_failed`, `evidence_persisted`, `preservation_failed`, `evidence_finalization_failed`, `reconciliation_required`.
- **Terminal success**: `evidence_persisted` when preservation is not requested; `preserved` when it is requested.
- **Run-result but recoverable**: retryable `verification_failed`, `evidence_persistence_failed`, `preservation_failed`, `evidence_finalization_failed`, and `reconciliation_required`; these end one API invocation but not the workflow.
- **Terminal incomplete**: `stopped` after the caller elects not to continue.
- **Terminal before transfer completion**: `canceled` or a failure whose retryability is `terminal`.

### Typed failure state

A failure carries only:

- `failedStage`: `preparation | upload | verification | evidence_persistence | preservation | evidence_finalization`.
- `lastAuthoritativeState`: the last stable state whose authority remains valid.
- `issueCodes`: bounded typed safe codes.
- `retryability`: `retry | reconcile | restart_upload | terminal`.
- `operationId`: included only in the restricted checkpoint and authorized full bundle, not the default summary.

Raw errors remain available only to an explicitly configured application callback and never become evidence or diagnostics.

## Workflow Checkpoint V1

Schema: `large-image-ingest.workflow-checkpoint.v1`

Purpose: operational process-restart coordination. It is not an audit record and follows shorter, application-owned retention than evidence.

Fields:

- schema version, workflow/correlation IDs, revision, created/updated timestamps;
- current state and last authoritative state;
- manifest and profile references;
- whole-file source identity;
- restricted upload recovery locator referencing the existing resume store record, never embedding the record;
- stage attempt summaries and current operation ID;
- verification/provenance/evidence/preservation status and safe result references;
- no original bytes, credentials, URLs, object keys, receipts, provider payloads, or customer metadata values.

Checkpoint updates use optimistic revision matching. A stale writer receives `workflow.checkpoint_conflict` and must reload; it must not overwrite a newer authoritative stage.

## Stage Attempt

Fields:

- `stage`: one canonical stage name.
- `operationId`: stable for the intended external effect across retry and restart.
- `attempt`: monotonic invocation count.
- `startedAt`, optional `finishedAt`: descriptive timestamps only.
- `outcome`: `pending | succeeded | failed | ambiguous`.
- `issueCodes`: safe typed codes.
- `evidenceRef`: optional safe application reference.

Ordering authority is checkpoint revision plus stage order and attempt number, not wall-clock order.

## Evidence Bundle V1 Draft

Schema: `large-image-ingest.evidence-bundle.v1`

```json
{
  "schemaVersion": "large-image-ingest.evidence-bundle.v1",
  "id": "evidence-...",
  "revision": 1,
  "workflowId": "workflow-...",
  "correlationId": "correlation-...",
  "createdAt": "2026-09-07T00:00:00.000Z",
  "library": { "name": "large-image-ingest", "version": "1.7.0" },
  "subject": {
    "manifest": { "id": "manifest-...", "schemaVersion": "large-image-ingest.manifest.v1" },
    "sourceIdentity": {
      "algorithm": "sha256",
      "scope": "whole-file",
      "sizeBytes": 3221225472,
      "value": "<64 lowercase hex>"
    }
  },
  "policy": {
    "profile": {
      "name": "semiconductor-inspection-baseline",
      "version": "1.0.0",
      "effectivePolicyDigest": { "algorithm": "sha256", "value": "<64 lowercase hex>" }
    },
    "result": "passed",
    "failedRuleCodes": [],
    "warningRuleCodes": []
  },
  "transfer": {
    "status": "completed",
    "transportCategory": "application-broker",
    "completionEvidence": "transport_and_session",
    "completedAt": "2026-09-07T00:00:00.000Z"
  },
  "verification": {
    "status": "verified",
    "verifierCategory": "stored-original",
    "expectedEvidenceCategories": ["whole-file-sha256", "size"],
    "observedEvidenceCategories": ["whole-file-sha256", "size"],
    "issueCodes": [],
    "verifiedAt": "2026-09-07T00:00:00.000Z"
  },
  "provenance": {
    "id": "provenance-...",
    "schemaVersion": "large-image-ingest.provenance.v1",
    "integrity": { "algorithm": "sha256", "value": "<64 lowercase hex>" },
    "persistence": { "status": "persisted", "operationId": "operation-..." }
  },
  "preservation": { "status": "not_requested" },
  "stages": [
    { "stage": "upload", "operationId": "operation-...", "attempts": 1, "outcome": "succeeded", "issueCodes": [] },
    { "stage": "verification", "operationId": "operation-...", "attempts": 1, "outcome": "succeeded", "issueCodes": [] },
    { "stage": "evidence_persistence", "operationId": "operation-...", "attempts": 1, "outcome": "succeeded", "issueCodes": [] }
  ],
  "terminal": {
    "classification": "success",
    "state": "evidence_persisted",
    "lastAuthoritativeState": "evidence_persisted"
  },
  "trust": { "integrity": "self_hashed", "actorTrust": "unsigned", "timeTrust": "untrusted" },
  "integrity": { "algorithm": "sha256", "canonicalization": "rfc8785-jcs", "value": "<64 lowercase hex>" }
}
```

### Bundle validation rules

- Exact known schema and bounded exact-key objects; unknown versions are rejected.
- Manifest ID, source identity, profile reference, provenance reference, state, and stage outcomes must agree.
- `verified` requires transfer completed plus verification `verified`.
- `evidence_persisted` requires verified, valid sealed provenance, and a successful evidence receipt.
- Bundle revisions are positive, immutable, contiguous, and share one evidence ID; revision content cannot be replaced under the same revision or operation ID.
- With preservation configured, revision 1 records `pending`; revision 2 records the exact handoff outcome.
- `preserved` requires evidence persisted, a successful preservation receipt, and durable final bundle revision 2.
- `not_requested` preservation is valid only with terminal `evidence_persisted` success.
- Failure terminal states retain `lastAuthoritativeState` and may not claim a later successful result.
- Integrity covers the complete body except the `integrity` member.
- A default safe summary omits source digest value, operation IDs, evidence references, timestamps that are not already safe, and all application annotations.

## Failure, Recovery, And Idempotency Matrix

| Stage / failure | Last authority retained | Safe retry origin | Idempotency / reconciliation rule | Terminal if not continued |
| --- | --- | --- | --- | --- |
| Preparation/profile failure | None | New preparation after input correction | Pure evaluation; manifest identity reused only from checkpoint | `failed(preparation)` |
| Pause during upload | Existing upload checkpoint | Existing core `resume(recordId)` | Core resume record/receipts are sole chunk authority | `paused` |
| Cancel before upload completion | Acknowledged upload evidence only | New workflow unless transport defines recovery | Existing session abort/cleanup; no downstream stage | `canceled` |
| Chunk retry exhausted | Prepared plus durable upload checkpoint | Existing core session recovery | Core retry/resume rules; never workflow-level chunk replay | `failed(upload)` |
| Lost completion response | Prepared/upload checkpoint | Reconcile through transport/session | No automatic new upload or completion repeat without core/adapter authority | `reconciliation_required(upload_completion)` |
| Process restart during upload | Latest core resume record | Existing core `resume()` | Exact source/profile/chunking/transport match before remote call | `paused` or `failed(upload)` |
| Verification failed | `uploaded_unverified` | Verification | Read-only verifier may retry under same operation ID; new attempt counted | `verification_failed` |
| Verification acknowledgement lost | `uploaded_unverified` | Reconcile verifier if supported; otherwise explicit retry policy | Never infer verified from invocation alone | `reconciliation_required(verification)` |
| Evidence sink rejects | `verified` | Evidence persistence | Same operation ID; sink must return same receipt or conflict | `evidence_persistence_failed` |
| Evidence acknowledgement lost | `verified` | Sink `reconcile(operationId)` | No blind duplicate durable write | `reconciliation_required(evidence_persistence)` |
| Preservation preflight fails | `evidence_persisted` | Preservation after input/policy correction | No destination mutation on blocked mapping | `preservation_failed` |
| Preservation materialization fails | `evidence_persisted` | Adapter-defined retry/reconcile, then record outcome revision | Same operation ID; existing destination cannot be overwritten; terminal failure follows durable outcome revision | `preservation_failed` or `reconciliation_required` |
| Preservation outcome bundle finalization fails or is ambiguous | `evidence_persisted` plus checkpointed handoff outcome | Final evidence revision only | Distinct stable finalization operation ID; reconcile/retry the immutable revision and never repeat handoff | `reconciliation_required(evidence_finalization)` |
| Checkpoint write conflict | External authority unchanged | Reload latest checkpoint | Compare-and-set revision; stale writer never wins | `reconciliation_required(checkpoint)` |
| Observer/callback throws | Current authority unchanged | No stage retry caused by observer | Report through isolated observer channel | Current state unchanged |

## Retention And Sensitivity

| Artifact | Purpose | Sensitivity | Typical retention owner |
| --- | --- | --- | --- |
| Manifest | Source description and identity | May contain customer metadata | Application record policy |
| Resume record | Remote recovery and receipts | High; may contain handles/tokens | Short operational retention |
| Workflow checkpoint | Cross-stage restart coordination | Restricted; may reference resume/effect IDs | Until terminal/reconciled |
| Provenance | Durable curated lifecycle evidence | Curated audit data | Application audit policy |
| Evidence bundle | Durable cross-artifact dossier | Authorized evidence; digest may be sensitive | Application evidence policy |
| Preservation package | Portable retained content/evidence | Contains original and selected artifacts | Preservation repository policy |

No artifact is a substitute for another. Default diagnostics use separate safe summary projections.
