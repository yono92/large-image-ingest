# Public Contract: Transport Conformance

The additive `large-image-ingest/conformance` subpath exposes a provider-neutral catalog runner. Names below are normative; detailed TypeScript spelling may add readonly modifiers but must preserve the described data and authority boundaries.

## Constants

```ts
TRANSPORT_CONFORMANCE_CATALOG_VERSION =
  "large-image-ingest.transport-conformance-catalog.v1";

TRANSPORT_CONFORMANCE_REPORT_VERSION =
  "large-image-ingest.transport-conformance-report.v1";
```

## Core Types

```ts
type TransportConformanceCategory = "s3-multipart" | "tus" | "nas";
type TransportConformanceTargetClass =
  | "credential-free-representative"
  | "real-deployment";

type TransportConformanceScenarioStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "unsupported";

type TransportConformanceOverallStatus =
  | "conformant"
  | "non_conformant"
  | "incomplete";

type TransportConformanceCleanupStatus =
  | "not_required"
  | "completed"
  | "failed"
  | "abandoned_identifiable";
```

`TransportConformanceCapabilities`, `TransportConformanceTargetProfile`, `TransportConformanceObservation`, `TransportConformanceScenarioResult`, `TransportConformanceIssue`, and `TransportConformanceReportV1` follow [data-model.md](../data-model.md). The report contract contains no arbitrary provider payloads.

## Target Boundary

```ts
interface TransportConformanceTarget {
  readonly profile: TransportConformanceTargetProfile;
  readonly capabilities: TransportConformanceCapabilities;

  runScenario(context: {
    scenario: TransportConformanceScenario;
    signal: AbortSignal;
  }): Promise<TransportConformanceObservation | TransportConformanceSkip>;
}
```

Rules:

- The runner chooses scenario order and status authority.
- A driver may return `skip` only with a safe diagnostic category and limitation codes.
- A driver exception becomes a safe `failed` result; its message and object are not copied.
- The driver must isolate resources per scenario and report cleanup facts in the observation.
- The target must not place credentials, URLs, keys, paths, raw receipts, manifests, records, customer metadata, or checksum values in any returned field.

## Runner

```ts
function runTransportConformance(
  target: TransportConformanceTarget,
  options?: {
    signal?: AbortSignal;
    reportId?: string;
    now?: () => Date;
  }
): Promise<TransportConformanceReportV1>;
```

The runner:

1. validates the target profile and capability relationships;
2. iterates the immutable catalog in order;
3. returns `unsupported` without invoking the driver when a capability-scoped scenario is legitimately inapplicable;
4. validates every driver observation against scenario-required fields;
5. derives result status and safe diagnostics;
6. validates positive capability evidence;
7. aggregates cleanup and limitations;
8. derives overall status;
9. returns a report that validates against `qualification-report.schema.json`.

The runner never returns `conformant` when a scenario is skipped, failed, missing, duplicated, invalid, or when a positive capability lacks passing behavioral evidence.

## Report Validation

```ts
function validateTransportConformanceReport(
  value: unknown
): TransportConformanceReportValidationResult;
```

The validator is bounded and non-throwing for untrusted input. Success returns a safe typed report. Failure returns safe issue codes and JSON-style field paths; it never echoes rejected values.

## Capability Evidence

```ts
function evaluateTransportCapabilityEvidence(
  capabilities: TransportConformanceCapabilities,
  results: readonly TransportConformanceScenarioResult[]
): readonly TransportConformanceIssue[];
```

Positive claims must map to passing scenarios as follows:

| Claim | Required behavioral evidence |
| --- | --- |
| `resumable` | `recovery.interrupted-no-retransmit` |
| `snapshotResume` | interruption/recovery result tagged with snapshot evidence |
| `persistentResume` | interruption/recovery result tagged with durable-record evidence |
| `abortable` | `cancellation.abandoned-session-reported` with completed or safely identifiable cleanup |
| `expirationAware` | `recovery.session-reconciliation` with expired-state evidence |
| `chunkIntegrity` | `integrity.chunk-evidence-enforced` |
| `parallelChunks` | Reserved; must remain false/unqualified in catalog v1 unless an explicit parallel scenario is added |

## Scenario Invariants

| Scenario | Passing observation |
| --- | --- |
| `source.validation-before-mutation` | invalid source rejected, original unchanged, zero pre-authority remote mutation |
| `source.mismatch-before-mutation` | strong mismatch detected, original unchanged, zero pre-authority remote mutation |
| `recovery.interrupted-no-retransmit` | source identity established, acknowledged bytes greater than zero, zero acknowledged retransmission, required snapshot/durable evidence present, stored byte count and checksum matched |
| `recovery.invalid-evidence-rejected` | malformed/duplicate/out-of-range/incompatible fixtures rejected and zero remote mutation |
| `recovery.session-reconciliation` | all applicable matched/missing/local-ahead/remote-ahead/unverifiable outcomes covered; expired covered when advertised; no unsafe skipping |
| `completion.stored-original-verified` | transfer finalized, exactly one authoritative completion, byte count and whole-file checksum matched, original unchanged |
| `completion.ambiguous-result-reconciled` | ambiguous response reconciled, exactly one authoritative completion, stored byte count and checksum matched |
| `cancellation.abandoned-session-reported` | cleanup completed or any abandoned resource has only a safe report reference and count |
| `cleanup.failure-after-completion-isolated` | injected cleanup failure observed, verified authoritative completion preserved, final test-owned resource cleanup reported |
| `integrity.chunk-evidence-enforced` | required chunk evidence validated and mismatched evidence rejected without progress advancement |

## Safe Output Contract

All identifiers and limitation codes must match `^[a-z0-9][a-z0-9._-]{0,63}$`. Environment values are selected from fixed fields and length-bounded. Failures expose only public codes such as:

- `conformance.target_invalid`
- `conformance.observation_invalid`
- `conformance.invariant_failed`
- `conformance.scenario_skipped`
- `conformance.execution_failed`
- `conformance.capability_unproven`
- `conformance.report_invalid`

No API in this subpath accepts or emits raw credentials, provider URLs, object keys, filesystem paths, customer metadata, full manifests, full recovery records, raw receipts, or checksum values. `evidence` is an explicitly enumerated object; it is not an open string map.

## Compatibility

- Existing `UploadTransport`, official transports, manifests, and resume records are unchanged.
- Custom transports remain usable without importing this subpath.
- Conformance is never inferred from a transport name or source compatibility.
