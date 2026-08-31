# Official Transport Conformance

Version 1.6.0 adds an evidence-producing conformance catalog for the official S3 multipart, tus, and NAS paths. Conformance means equivalent safety outcomes, not identical protocol messages, receipt formats, or performance.

## Shared Invariants

Every applicable official target must demonstrate all of the following through the public adapter or gateway path:

| Invariant | Required evidence |
| --- | --- |
| Validate before mutation | Invalid input and a metadata-equal altered source produce zero remote mutation. |
| Exact-source recovery | Whole-file identity is established before acknowledged ranges are skipped. |
| No duplicate acknowledged transfer | Interrupted recovery reports zero retransmitted acknowledged bytes. |
| Safe reconciliation | Matched, missing, locally ahead, remotely ahead, unverifiable, and applicable expired states have explicit outcomes. |
| Separate finalization and verification | Transfer completion is followed by independent stored byte-count and whole-file SHA-256 checks. |
| One authoritative completion | Lost or ambiguous responses cannot produce duplicate application completion. |
| Observable cancellation and cleanup | Cleanup completion, failure, and identifiable abandoned resources remain visible without exposing locations. |

The catalog has ten ordered scenarios under `large-image-ingest.transport-conformance-catalog.v1`. A report is `conformant` only when all applicable scenarios pass and every positive capability has behavioral evidence. A skipped scenario makes the report `incomplete`; a failed invariant or unsupported positive claim makes it `non_conformant`.

## Protocol Evidence Differences

| Transport | Recovery evidence | Integrity evidence | Notable limitation |
| --- | --- | --- | --- |
| S3 multipart | Validated part receipts and broker reconciliation | Per-part evidence plus independent stored SHA-256 | Expiration is broker/provider policy and is not advertised by the generic adapter. |
| tus | Authoritative `Upload-Offset`, upload URL state, and `Upload-Expires` when present | Independent stored SHA-256 | The official adapter does not advertise the optional tus checksum extension, so the chunk-integrity scenario is `unsupported`. |
| NAS | Durable session metadata, staged chunk records, and coordinated locks | Staged chunk SHA-256 plus final stored SHA-256 | Browser clients require a server-side gateway; mount and rename semantics must be qualified in the deployment environment. |

Static `TransportCapabilities`, successful imports, endpoint reachability, or ordinary custom-transport compatibility are not conformance evidence. A custom transport remains usable without being described as conformant.

## Credential-Free Release Evidence

Run the isolated representative suite with:

```bash
npm run test:conformance -- --repeat 10 \
  --output benchmarks/results/2026-08-transport-conformance.json
```

The retained August 31, 2026 report contains ten deterministic runs for all three target categories. Each S3 and NAS run has ten passing scenarios. Each tus run has nine passing scenarios and one correctly unsupported chunk-integrity scenario. All 30 reports are conformant; scenario status, cleanup status, evidence, limitations, and overall status are identical across repetitions. Timing and the recording timestamp are intentionally excluded from the determinism signature.

Representative targets are credential-free regression evidence for the library paths. They do not certify a particular cloud account, tus implementation, NAS mount, compliance program, or production configuration.

## Safe Report Boundary

Import the public contract from `large-image-ingest/conformance`:

```ts
import {
  runTransportConformance,
  validateTransportConformanceReport
} from "large-image-ingest/conformance";

const report = await runTransportConformance(target);
const validation = validateTransportConformanceReport(report);
```

The report accepts only bounded, versioned fields: safe category identifiers, booleans, counts, timestamps, durations, result status, cleanup status, and declared limitations. It excludes raw provider exceptions, credentials, endpoints, upload URLs, object keys, filesystem paths, customer metadata, manifests, recovery records, receipts, and checksum values.

## Real-Target Qualification

Real target mutation requires exact opt-in and an operator-owned driver:

```bash
LII_CONFORMANCE_OPT_IN=1 \
LII_CONFORMANCE_DRIVER_MODULE=./private/target-driver.mjs \
npm run qualify:transport -- \
  --output benchmarks/results/private-target-report.json
```

The driver owns credentials, test namespace provisioning, cost limits, provider lifecycle operations, retention, and cleanup. It must export `createTarget()` or a target value matching the public conformance target contract and label the profile as `real-deployment`.

Without both variables, the command skips without external mutation. Once configured, a skipped scenario returns an incomplete result and a non-zero qualification exit; only a complete conformant report is a pass. CLI messages never echo the driver path or raw driver errors. See [Integration Test Policy](integration-tests.md) and the [feature contract](../specs/014-transport-conformance/contracts/conformance-api.md).
