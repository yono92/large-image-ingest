# Quickstart Validation: Verified Ingest Workflow

This is the validated README first-screen contract. Adapter implementations remain application-owned and are intentionally outside the golden-path line budget.

```ts
import { createVerifiedIngestWorkflow } from "large-image-ingest/workflow";
import { loadBundledDomainProfile } from "large-image-ingest/profiles";

const profile = await loadBundledDomainProfile("semiconductor-inspection");
const workflow = createVerifiedIngestWorkflow(file, {
  profile: {
    definition: profile,
    structuralEvidence
  },
  session: {
    chunking: { chunkSize: 64 * 1024 * 1024 },
    metadata: {
      lotId: "LOT-2026-001",
      waferId: "W12",
      inspectionTimestamp: "2026-09-07T09:00:00+09:00"
    },
    transport,
    resume: { store: resumeStore }
  },
  verifier: storedObjectVerifier,
  checkpointStore,
  evidenceSink,
  preservation: preservationHandoff,
  onEvent: ({ type }) => console.log(type)
});

const result = await workflow.start();
if (result.status !== "preserved") {
  console.log(result.status, result.allowedActions);
}
```

The code block contains 27 nonblank lines. An example without preservation omits the `preservation` line and treats `evidence_persisted` as terminal success.

## Validation Scenarios

### Happy path

1. Supply a real `File`/`Blob`, explicit profile, credential-free reference transport, resume store, verifier, checkpoint store, and evidence sink.
2. Start the workflow.
3. Expect the state sequence `preparing → prepared → uploading → uploaded_unverified → verifying → verified → persisting_evidence → evidence_persisted`.
4. With preservation configured, expect `preserving → preserved`.
5. Validate the returned evidence bundle and prove the stored source SHA-256 equals the manifest whole-file checksum.

### Restart path

1. Stop after a durable upload checkpoint, recreate the workflow with the exact same source and options, and call `resume(workflowId)`.
2. Expect the existing core resume record to classify the source and reuse acknowledged ranges.
3. Repeat after `uploaded_unverified`, `verified`, and an ambiguous evidence-sink acknowledgement.
4. Expect continuation from the last authority; ambiguous external outcomes must reconcile before retry.

### Failure isolation

1. Inject verifier, evidence sink, and preservation failures independently.
2. Confirm the last authoritative state remains `uploaded_unverified`, `verified`, and `evidence_persisted`, respectively.
3. Call `retry()` and prove upload creation, chunk upload, and completion call counts do not increase.

### Safety

Seed adapters and metadata with credentials, presigned URLs, object keys, filesystem paths, raw provider errors, receipts, and customer values. Inspect workflow events, state summaries, checkpoints, bundle summaries, and failure results; none may contain the seeded values. Authorized full evidence may contain the whole-file digest but still may not contain credentials or raw provider payloads.

## Release Verification Commands

```bash
npm run typecheck
npm test
npm run build
npm run test:conformance
npm run test:reference
npm run test:adoption-evidence
```

Feature implementation executes these gates before release metadata is considered ready.
