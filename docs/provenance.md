# Auditable Ingest Provenance

`large-image-ingest/provenance` creates a durable evidence artifact for one ingest without turning the manifest, resume record, transport state, or diagnostic log into an audit record. Capture is opt-in and composes through the existing `onEvent` callback, so applications that do not create a recorder keep unchanged session behavior.

## Trust Model

The v1 artifact is integrity-protected with SHA-256 over an RFC 8785 JCS canonical representation. A valid digest detects changes to authoritative fields. It does not establish actor identity, trusted time, legal admissibility, non-repudiation, regulatory compliance, or the truth of application/transport assertions.

Validation reports content integrity and actor trust separately:

| Artifact | Integrity | Actor trust |
| --- | --- | --- |
| Valid, no attestation | `valid` | `unsigned` |
| Valid, attestation not evaluated | `valid` | `not_evaluated` |
| Valid, all application checks pass | `valid` | `externally_attested` |
| Attestation check fails | independently reported | `attestation_invalid` |

External signing keys, identity policy, timestamping, revocation, and attestation retention remain application-owned. The SDK stores only safe attestation identifiers and digests and never accepts private signing material.

## Evidence Sources And Ordering

Each entry identifies one source category: `library`, `application`, `transport`, `verification`, or `external`. Categories describe origin, not inherent trust.

Recorder-owned `sequence` and `entry-N` values are ordering authority. `occurredAt` remains descriptive and may repeat or move backward. This avoids inventing trusted time while keeping events deterministic.

The artifact can retain:

- manifest ID/schema, original byte count, and optional whole-file SHA-256;
- applied policy identities, versions, results, safe rule codes/counts, and policy history;
- safe transport capability and receipt/offset evidence counts;
- resume schema/classification history, resume/reuse/retransmission counts, and conflict codes;
- independent stored verification status and evidence categories;
- derivative ID/kind/status/source relationship, generator/policy categories, optional checksum, and storage kind;
- external attestation references and digests.

It never embeds the original bytes, full manifest, full resume record, upload URL, upload ID, object key, filesystem path, raw receipt, opaque provider response, credential, token, or raw exception.

## Recording

```ts
import { createIngestSession } from "large-image-ingest/core";
import { createIngestProvenanceRecorder } from "large-image-ingest/provenance";

const recorder = createIngestProvenanceRecorder({
  manifest,
  policy: { id: "semiconductor-ingest", version: "2.0.0" },
  transport: {
    category: "s3-multipart",
    capabilities: transport.capabilities
  }
});

const session = createIngestSession(file, {
  manifest,
  transport,
  onEvent(event) {
    recorder.observeIngestEvent(event);
  }
});

await session.start();

recorder.recordRecovery({
  recordSchemaVersion: "large-image-ingest.resume.v0.3",
  classification: "resumable",
  acknowledgedRangesReused: 2,
  retransmittedAcknowledgedBytes: 0
});

recorder.recordVerification({
  status: "verified",
  verifierCategory: "stored-original",
  expectedEvidenceCategories: ["byte-count", "whole-file-sha256"],
  observedEvidenceCategories: ["byte-count", "whole-file-sha256"]
});

const artifact = await recorder.seal();
```

Transfer completion initially reduces to `completed_unverified`. Only explicit stored-original evidence promotes it to `completed`; a failed verification becomes `verification_failed`. Upload failure and cancellation remain distinct terminal states.

## Disclosure Profiles

`audit` is the default curated artifact. `authorized-full` may contain an explicitly supplied bounded annotation map, but obvious URLs, paths, credential assignments, tokens, control characters, and oversized values are rejected. Even authorized artifacts cannot contain arbitrary provider or resume payloads.

```ts
import {
  createSafeProvenanceSummary,
  exportIngestProvenance
} from "large-image-ingest/provenance";

const summary = await createSafeProvenanceSummary(artifact);
const auditExport = await exportIngestProvenance(artifact, {
  disclosureProfile: "audit"
});
```

Safe summaries are fixed projections. They omit checksums, filenames, metadata/annotation values, attestation references, and operational handles. Unknown versions or fields cause rejection instead of pass-through. Exports require an explicit profile and receive a new integrity value after projection.

## Persistence And Retention

```ts
const result = await persistIngestProvenance(artifact, sink);
```

The sink is application-owned. Failure returns only `provenance.persistence_failed`; raw sink errors are discarded and an already completed or verified ingest remains authoritative. Applications should alert/retry according to their audit policy, ideally using an outbox or transactional application boundary when provenance retention must survive a process stop between completion and persistence.

Resume and provenance retention are separate:

- resume records are sensitive, short-lived operational state used to recover an upload;
- provenance artifacts are durable evidence with application-defined archival/deletion policy;
- deleting a resume record after completion must not delete the provenance artifact by implication;
- the SDK does not define legal holds, mandatory retention, archival storage, or erase workflows.

Preservation package mapping is handled by the separate preservation-interoperability feature.
