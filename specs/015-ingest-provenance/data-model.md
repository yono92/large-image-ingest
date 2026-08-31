# Data Model: Auditable Ingest Provenance

## Ingest Provenance Artifact V1

| Field | Type | Rule |
| --- | --- | --- |
| `schemaVersion` | constant | `large-image-ingest.provenance.v1` |
| `id` / `correlationId` | safe identifier | stable per artifact/ingest |
| `createdAt` | ISO timestamp | descriptive, not trusted time |
| `library` | name/version | producing package |
| `disclosureProfile` | `audit` or `authorized-full` | explicit artifact projection |
| `manifest` | manifest/source reference | ID, schema, byte count, source evidence category, optional checksum |
| `policy` | current policy reference/result plus history | safe ID/version/codes/counts; retains policy changes across recovery |
| `transport` | transport evidence summary | category, capabilities, receipt/offset counts only |
| `recovery` | recovery summary | versions, classifications, resume/reuse/retransmission/conflict counts/codes |
| `entries` | ordered entries | 1–4096, exact unique sequence and IDs |
| `verification` | optional verification evidence | independent stored-original result |
| `derivatives` | derivative relationship summaries | max 1024 |
| `attestations` | external attestation references | max 64 |
| `terminalStatus` | terminal enum | deterministic reducer output |
| `annotations` | optional safe string map | only `authorized-full`, max 32 |
| `integrity` | JCS/SHA-256 | covers every other field |

## Entry

`entryId`, `sequence`, `occurredAt`, `type`, `evidenceSource`, optional safe `code`, and optional bounded numeric `metrics`. Sequence must equal its array index; timestamps may repeat or regress.

## Terminal State Reduction

```text
active
  -> upload_failed
  -> canceled
  -> completed_unverified
       -> completed              (stored verification passed)
       -> verification_failed    (stored verification failed)
```

Failure/cancellation cannot coexist with a completion claim. Verification cannot precede an observed completion entry.

## Manifest And Derivative Relationships

- Manifest ID, schema, original size, and optional whole-file SHA-256 are copied as narrow references.
- Derivative `sourceManifestId` must match the artifact manifest ID.
- When a referenced manifest is supplied to validation, manifest ID/schema/size/checksum and derivative IDs/status/source relationships must agree.

## Integrity Envelope

`integrity = { algorithm: "sha256", canonicalization: "rfc8785-jcs", value }`.
The digest input is the complete artifact with the `integrity` member removed. It detects changes but conveys no actor identity, trusted timestamp, compliance, or non-repudiation.

## Persistence Result

`{ ok: true, status: "persisted" }` or `{ ok: false, status: "failed", issue: { code: "provenance.persistence_failed" } }`. Raw sink errors never enter the result.
