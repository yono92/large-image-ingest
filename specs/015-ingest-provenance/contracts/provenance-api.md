# Contract: Ingest Provenance API

## Public Entry Point

```ts
import {
  createIngestProvenanceRecorder,
  createSafeProvenanceSummary,
  exportIngestProvenance,
  persistIngestProvenance,
  validateIngestProvenance
} from "large-image-ingest/provenance";
```

## Recorder

```ts
const recorder = createIngestProvenanceRecorder({
  manifest,
  disclosureProfile: "audit",
  policy: {
    id: "semiconductor-ingest",
    version: "1.0.0"
  },
  transport: {
    category: "s3-multipart",
    capabilities
  }
});

const session = createIngestSession(file, {
  ...options,
  onEvent(event) {
    recorder.observeIngestEvent(event);
  }
});

recorder.recordRecovery({
  recordSchemaVersion: "large-image-ingest.resume.v0.3",
  classification: "resumable",
  acknowledgedRangesReused: 2,
  retransmittedAcknowledgedBytes: 0
});

recorder.recordVerification({
  status: "verified",
  verifierCategory: "node-stored-file",
  issueCodes: []
});

const artifact = await recorder.seal();
```

Recorder methods are synchronous except `seal()`. They validate inputs before adding them. Sequence and entry IDs are recorder-owned.

## Validation And Trust

```ts
const result = await validateIngestProvenance(artifact, {
  manifest,
  verifyAttestation: async (attestation) => ({ valid: true })
});
```

The result contains typed issues, `integrity`, and `actorTrust`. A valid unsigned artifact reports `actorTrust: "unsigned"`.

## Safe Summary And Export

```ts
const summary = await createSafeProvenanceSummary(artifact);
const authorized = await exportIngestProvenance(artifact, {
  disclosureProfile: "authorized-full"
});
```

Summary output is a fixed projection and omits source/derivative checksums, annotation values, external references, raw manifests, resume state, and provider evidence. Export requires an explicit profile and re-seals the projected artifact.

## Persistence

```ts
const result = await persistIngestProvenance(artifact, {
  async write(value) {
    await auditStore.put(value.id, value);
  }
});
```

Sink failure returns only `provenance.persistence_failed`; upload completion and verification authority remain outside this helper.
