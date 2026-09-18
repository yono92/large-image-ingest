# Quickstart Validation: Parallel Upload Integrity

## Prerequisites

- Node.js 20 or newer.
- Project dependencies installed.
- No cloud credentials; the reference S3 broker and fetch layer are local fakes.

## Pre-Feature Baseline

Recorded on 2026-09-18 before implementation changes:

- `npm run typecheck`: passed.
- `npm test`: 80 files and 364 tests passed. The loopback HTTP fixture requires local port permission outside the filesystem sandbox.
- `npm run build`: passed, including package-consumption verification.
- Sequential transfer remains the compatibility baseline against which parallel opt-in behavior is compared.

## Validation Sequence

1. Run type and unit gates:

   ```bash
   npm run typecheck
   npm test
   npm run build
   ```

2. Run focused parallel session tests covering concurrency 2–16, reversed and random completion, retry, duplicate and stale results, pause, cancel, permanent failure, and exactly-once finalization.

3. Run persistent recovery tests that stop after sparse acknowledgement subsets, reconstruct the session from v0.4, reconcile remote parts, and assert that only missing or safely repeatable chunks are transmitted.

4. Run integrity tests with matching, missing, malformed, wrong-algorithm, wrong-range, and mismatched local and remote SHA-256 evidence. No invalid chunk may advance progress.

5. Run S3 adapter tests proving signed checksum input, matching response attestation, consecutive part completion, canonical order, ambiguous completion reconciliation, and abort-at-most-once behavior.

6. Run compatibility tests with no parallel option and with v0.1–v0.3 records. Existing sequential fixtures must pass unchanged.

7. Run the deterministic latency fixture with at least 32 chunks. Concurrency four must complete at least twice as fast as concurrency one while producing identical whole-file and stored-object verification results.

## Expected Outcomes

- Maximum observed in-flight chunks never exceeds the effective limit.
- Progress is monotonic unique acknowledged bytes under every completion order.
- Each completed chunk has one local SHA-256 record and, for qualified S3, a matching remote attestation.
- Pause, cancellation, and permanent failure emit no late progress after their settled state.
- Restart skips every remotely proven chunk and no unproven chunk.
- Finalization receives one canonical complete receipt set and runs exactly once unless explicit reconciliation resolves a lost response.
- Default diagnostics contain no credentials, presigned URLs, raw provider errors, or full operational receipts.
