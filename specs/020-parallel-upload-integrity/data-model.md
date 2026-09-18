# Data Model: Parallel Upload Integrity

## Parallel Upload Policy

- `requestedConcurrency`: integer 2–16.
- `effectiveConcurrency`: minimum of request, transport ceiling, and remaining chunk count.
- `integrityPolicy`: stable reference to the selected chunk integrity policy.
- Identity is stable across persistent resume; a mismatch is incompatible before remote mutation.

## Chunk Integrity Policy

- `algorithm`: initially `sha256` for locally calculated evidence.
- `local`: always `required` for parallel transfer.
- `remoteAttestation`: `required` when the selected transport advertises attestation, otherwise `unavailable`.
- `encoding`: explicit (`hex` or `base64`); comparisons normalize to digest bytes.
- A deterministic policy digest binds algorithm, evidence roles, and encoding rules to resume state.

## Chunk Checksum Evidence

- Exact source identity and upload session identity.
- Chunk index, start byte, end byte, and size.
- Algorithm, encoding, value, and role (`local-calculation` or `remote-attestation`).
- Local and remote evidence may agree only after algorithm, range, and normalized bytes match.
- It is operational evidence, never whole-file or stored-object verification.

## Chunk Attempt

- Stable attempt identity within one session run.
- Chunk identity and attempt number.
- State: `scheduled | in-flight | acknowledged | retryable | ambiguous | failed | interrupted`.
- Only `acknowledged` with satisfied integrity policy may enter durable progress.
- Late results from superseded attempts cannot replace an authoritative receipt.

## Authoritative Chunk Outcome

- One outcome per planned chunk.
- Missing and ambiguous outcomes remain incomplete.
- Acknowledged outcome contains exactly one canonical receipt and integrity evidence.
- Failed outcome carries a safe typed issue; raw provider errors remain non-authoritative and redacted.

## Resume Record v0.4

- Extends the v0.3 whole-file content identity and evidence-bearing receipts.
- Adds parallel policy identity and chunk integrity policy identity.
- Retains compact sparse completed ranges derived from authoritative receipts.
- `uploadedBytes` is the sum of unique acknowledged planned ranges.
- `nextChunkIndex` remains a compatibility hint for the lowest missing index, not proof that all earlier work is complete.
- In-flight attempts are not persisted as complete. Lost acknowledgement windows are reconciled against remote truth or safely retransmitted.

## Transport Capability

- Parallel support and maximum concurrency.
- Sparse recovery support.
- Safe repeat or idempotency, or explicit remote reconciliation.
- Accepted checksum algorithms and encodings.
- Remote checksum attestation behavior.
- Abort and ambiguous-finalization reconciliation behavior.

## Canonical Receipt Set

- Contains exactly one receipt for every planned chunk.
- Sorted by chunk index and, for S3, consecutive part number beginning at one.
- Each parallel receipt includes required local evidence and required remote attestation.
- Passed once to the existing completion boundary.

## State Transitions

```text
missing -> scheduled -> in-flight -> acknowledged
                              |-> retryable -> scheduled
                              |-> ambiguous -> reconciled acknowledged/missing/failed
                              |-> interrupted
                              |-> failed

uploading --pause--> settling -> paused
uploading --cancel--> settling -> canceled
uploading --permanent failure--> settling -> failed
all chunks acknowledged -> completing -> completed
completing --unknown result--> reconciliation required -> completed/failed
```

State publication occurs only after all workers and serialized commits settle. An authoritative completion wins over a later cancellation request.
