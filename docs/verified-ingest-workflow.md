# Verified Ingest Workflow

`large-image-ingest/workflow` is the opt-in control-plane facade for one original-preserving ingest. It connects an explicitly selected domain profile, manifest creation, the existing resumable session, independent stored-object verification, provenance sealing, durable evidence persistence, and an optional preservation handoff.

The facade owns cross-stage order. It does not create a second upload engine: `LargeImageIngestSession`, its resume record, transport receipts, and transport reconciliation remain the only upload authority.

## Golden path

```ts
import { loadBundledDomainProfile } from "large-image-ingest/profiles";
import { createVerifiedIngestWorkflow } from "large-image-ingest/workflow";

const profile = await loadBundledDomainProfile("semiconductor-inspection");
const workflow = createVerifiedIngestWorkflow(file, {
  profile: { definition: profile, structuralEvidence },
  session: {
    transport,
    resume: { store: resumeStore, cleanup: "delete-on-complete" },
    metadata: { lotId, waferId, inspectionTimestamp },
    image: structuralEvidence
  },
  verifier: storedObjectVerifier,
  checkpointStore,
  evidenceSink,
  onEvent: (event) => publishSafeStatus(event)
});

const result = await workflow.start();
if (result.status === "evidence_persisted") {
  retainEvidenceReference(result.evidenceReference);
}
```

## Authority model

| Fact | Authority | Workflow role |
| --- | --- | --- |
| Source policy acceptance | Domain profile evaluation and binding | Runs before any remote mutation |
| Chunk plan, acknowledged bytes, retry, pause, resume, completion | Existing core session and resume record | Projects state and delegates actions |
| Stored bytes match the original | Application verifier | Invoked only after transfer completion |
| Lifecycle evidence | Existing provenance recorder | Records policy, transfer, and verification, then seals |
| Durable dossier revision | Application evidence sink receipt | Exposes a bundle only after sink confirmation |
| Preservation completion | Application preservation adapter receipt | Optional, after evidence revision 1 |
| Actor identity and trusted time | External application trust system | Never inferred by this SDK |

Transfer completion and stored verification are deliberately different facts. A completed upload moves to `uploaded_unverified`; only the verifier can move it to `verified`.

## State machine

```text
preparing → prepared → uploading → uploaded_unverified → verifying → verified
                                                       ↓
                                          persisting_evidence
                                                       ↓
                    evidence_persisted (terminal when preservation is absent)
                                                       ↓ optional
                             preserving → finalizing_evidence → preserved
```

Recoverable side states are `paused`, `upload_failed`, `verification_failed`, `evidence_persistence_failed`, `preservation_failed`, `evidence_finalization_failed`, and `reconciliation_required`. `canceled` applies before authoritative upload completion. `stopped` preserves the last authoritative post-upload fact while stopping downstream work.

The workflow handle exposes legal actions through each state's `allowedActions`. `VerifiedIngestRunResult` includes recoverable boundaries; `VerifiedIngestTerminalState` excludes retryable and reconciliation-required results.

## Failure, recovery, and idempotency

| Failure | Authority retained | Recovery | Idempotency rule |
| --- | --- | --- | --- |
| Profile/preparation rejected | None | Correct input and start a new workflow | No remote call is allowed |
| Upload paused or failed | `prepared` plus core resume record | `retry()` or reconstruct and `resume(workflowId)` | Core session alone decides acknowledged ranges |
| Stored verification failed | `uploaded_unverified` | `retry()` when the adapter permits | Stable verification operation ID; upload is not recreated |
| Verifier acknowledgement ambiguous | `uploaded_unverified` | Adapter reconciliation or `reconciliation_required` | Never infer success from invocation |
| Evidence sink rejects | `verified` | `retry()` | Same evidence ID, revision, bytes, and operation ID |
| Evidence acknowledgement lost | `verified` | Sink reconciliation before replay | No blind duplicate write |
| Preservation transient failure | `evidence_persisted` revision 1 | `retry()` | Same preservation operation ID; no upload or verification replay |
| Preservation permanent failure | `evidence_persisted` | Terminal revision 2 records failure | Immutable final outcome |
| Final evidence write fails after handoff | `evidence_persisted` plus checkpointed outcome | Retry/reconcile revision 2 only | Preservation handoff is never repeated |
| Checkpoint CAS conflict | External stored checkpoint | Reload current authority | Stale writers never overwrite |

Workflow checkpoints are versioned, exact-key, compare-and-set records. They contain safe source/profile references and operation IDs, but never original bytes, credentials, presigned URLs, raw object keys, provider receipts, or full resume records. The core resume record stays separate because its operational sensitivity and retention are different.

## Evidence bundle v1

`large-image-ingest.evidence-bundle.v1` is an immutable dossier revision, not a replacement for the manifest, provenance artifact, resume record, or preservation package. It contains:

- evidence/workflow/correlation identity and producer version;
- manifest ID and whole-file SHA-256 source identity;
- applied profile reference and evaluation outcome;
- transfer-completion category;
- independent stored-verification categories;
- sealed provenance identity, digest, and evidence-persistence operation;
- preservation `not_requested`, `pending`, `preserved`, or `failed` outcome;
- ordered stage attempts and terminal classification;
- separate self-hash, actor-trust, and time-trust statements.

Without preservation, revision 1 is terminal `evidence_persisted`. With preservation, revision 1 is durable `pending` before handoff and revision 2 records the exact terminal handoff outcome. Revisions share one evidence ID and cannot be replaced.

`validateIngestEvidenceBundle()` checks exact keys, version, SHA-256 integrity, stage order, state relationships, and optional manifest/provenance references. `createSafeWorkflowSummary()` omits digests, operation IDs, references, timestamps, manifests, and application data. Full export requires `exportIngestEvidenceBundle(..., { disclosureProfile: "audit" })` or `"authorized-full"`.

The bundle's RFC 8785 canonical SHA-256 detects modification. It is not a signature, trusted timestamp, proof of actor identity, non-repudiation, legal-admissibility opinion, or compliance certification.

Every `stages` entry contains a safe `operationId`, attempt count, outcome, and bounded issue-code list. Revision 2 keeps the revision-1 provenance persistence operation and records preservation plus evidence-finalization as distinct operations, so retrying dossier finalization cannot be confused with repeating the handoff.

## Application-owned adapters

Applications continue to provide:

- an upload transport and any broker/credential exchange boundary;
- a durable core `ResumeStore`;
- independent stored-object verification;
- a compare-and-set workflow checkpoint store;
- an immutable, idempotent, reconcilable evidence sink;
- optional preservation destination/source resolution;
- any external signature, trusted timestamp, policy exception approval, or retention system.

Adapter results must contain typed categories and safe opaque references only. They must not return credentials, presigned URLs, object keys, filesystem roots, raw provider errors or receipts, or customer metadata in public fields.

## Browser and Node boundaries

`large-image-ingest/workflow` is browser-safe and contains no Node filesystem, React, or preservation-exporter dependency. Browser applications reselect the exact `File` after restart; the source identity is checked before transport recovery.

`large-image-ingest/node` adds `createNodeStoredFileVerifier()` and `createFilesystemPreservationHandoff()`. Both receive paths only from trusted application resolvers. The preservation helper uses existing BagIt/OCFL new-output exporters and returns an opaque operation-derived reference, never the destination path.

The Node preservation helper does not operate an OCFL repository, append versions, manage storage roots, schedule retention, replicate data, or provide disaster recovery.

## React projection

`createVerifiedIngestController()` and the hooks in `large-image-ingest/react` cache and subscribe to workflow snapshots; all actions delegate to the workflow. `VerifiedIngestPanel`, `VerifiedIngestStatus`, and `VerifiedIngestActions` in `large-image-ingest/react-ui` render the workflow's state and legal actions. They contain no second transition table.

## Migration

Existing `createIngestSession()`, provenance, profiles, preservation, Node, React, and React UI APIs are unchanged. Adopt incrementally:

1. Keep the current transport and resume store.
2. Move existing profile evaluation, verifier, and provenance/evidence persistence behind the workflow options.
3. Switch the application lifecycle switch statement to `workflow.getState()` and `allowedActions`.
4. Add preservation only when a new-output handoff is required.
5. Keep low-level sessions for applications that intentionally own orchestration.

No existing manifest, resume, provenance, preservation, or conformance schema is reinterpreted.

## Non-goals

- Central SaaS control plane or administrator console.
- Provider credentials, presigned URL issuance, or object-key policy.
- Image decode, resize, recompression, EXIF removal, preview generation, or any source mutation.
- Multi-file transaction semantics in v1. Independent workflow/evidence IDs can later be grouped without changing one-file identity.
- External signing, timestamp authority, legal claims, or regulatory certification.
- OCFL append/import, repository lifecycle, retention enforcement, replication, or disaster recovery.
- Treating credential-free representative conformance as real-provider qualification.
