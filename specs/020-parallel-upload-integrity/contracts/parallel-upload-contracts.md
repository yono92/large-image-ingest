# Parallel Upload Public Contracts

This contract freezes behavior and type shape for planning. Exact names may be refined only if the semantics remain unchanged.

## Session Selection

- No parallel option: run the existing sequential path unchanged.
- Parallel option: require an integer concurrency 2–16 plus the mandatory local chunk checksum policy.
- Admission validates transport parallel capability, ceiling, checksum algorithm, attestation behavior, chunk limits, and recovery capability before creating a remote session.

## Additive Type Direction

```ts
interface ParallelUploadOptions {
  concurrency: number;
  chunkChecksum?: { algorithm?: "sha256" };
}

interface CreateIngestSessionOptions {
  parallel?: ParallelUploadOptions;
}

interface ChunkChecksumValue {
  algorithm: ChecksumAlgorithm;
  encoding: "hex" | "base64";
  value: string;
}

interface ChunkIntegrityEvidence {
  policyId: string;
  local: ChunkChecksumValue;
  remote?: ChunkChecksumValue;
}
```

`UploadChunkReceipt.checksum` remains readable for compatibility. New parallel receipts carry explicit `integrity` evidence so legacy single-value meaning is never silently reinterpreted.

## Transport Contract

- Capability metadata adds maximum concurrency, sparse reconciliation, safe repeat, accepted checksum algorithms, and remote attestation semantics.
- The upload-chunk context supplies locally calculated evidence and a signal scoped to that attempt plus the session lifecycle.
- A transport that advertises attestation returns remote evidence bound to the same chunk.
- A transport may expose sparse remote reconciliation. Results are validated before adoption.
- Existing custom transports that do not advertise the new capabilities remain sequential and require no code change.

## Event And Snapshot Contract

- Existing event names remain compatible.
- Parallel events include attempt identity where necessary to distinguish stale results.
- `uploadedBytes` always means unique authoritative bytes, never bytes merely sent.
- Snapshots expose requested and effective concurrency plus safe chunk outcome counts; default safe projections omit full receipts and remote details.
- Event ordering follows authoritative commit order, not network completion order. Final receipt order follows chunk index.

## Pause, Cancel, And Failure Contract

- Close scheduling before interrupting active attempts.
- Await worker settlement before publishing the lifecycle result.
- Serialize valid acknowledgements that won the race.
- Mark unproven remote outcomes ambiguous for resume reconciliation.
- Permanent integrity failure is non-retryable by the ordinary transient retry policy.
- Completion that became authoritative first is not rewritten as canceled.

## Resume Contract

- Parallel persistent state uses resume v0.4.
- Resume validates source, manifest, chunk plan, transport session, parallel policy, and integrity policy identities before mutation.
- v0.1–v0.3 records retain existing sequential classification and never gain fabricated checksum evidence.
- Remote-only chunks may be adopted only through validated reconciliation evidence.

## S3 Contract

- First-release parallel S3 uses SHA-256 composite part checksum semantics.
- The broker configures multipart creation consistently with that algorithm and signs or supplies the required part checksum header boundary.
- The SDK computes the exact part checksum, sends Base64 evidence, and requires the response checksum to match before acknowledging the part.
- Completion receives all consecutive part numbers and their checksums in canonical order.
- ETag remains provider receipt data and is never treated as a whole-file checksum.

## Compatibility Contract

- Sequential is the default.
- tus and NAS remain sequential and explicitly advertise no qualified parallel capability.
- Existing custom transports, stored v0.1–v0.3 records, manifests, workflows, React surfaces, and verification contracts retain their prior behavior unless parallel mode is explicitly selected.
