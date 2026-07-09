# Research: 1.1.0 Operational Safety

## Decision: Add Safe Summary Helpers Instead Of Changing Existing Event Shapes

**Rationale**: Existing event payloads are public API. Removing manifest-bearing events or changing snapshot payloads would be a breaking change. Additive helpers let existing consumers keep working while giving new consumers a safe default for logs, telemetry, and support diagnostics.

**Alternatives considered**:

- Remove full manifests from `validated`, `started`, and `completed` events: rejected for 1.1.0 because it is a breaking change.
- Keep documentation-only guidance: rejected because consumers need reusable behavior, not just warnings.

## Decision: Use Explicit Redaction Categories

**Rationale**: Redacted objects should explain what was removed without exposing the removed values. Stable categories such as `manifest.metadata`, `transport.resumeToken`, `transport.remote`, `receipt.transport.location`, `receipt.transport.opaque`, and `resume.transport.data` are useful for tests, support tooling, and downstream audits.

**Alternatives considered**:

- Return only opaque "redacted" markers: rejected because callers need to know which areas were redacted.
- Deep clone and blindly remove all unknown fields: rejected because extension data may include safe public IDs that are useful for diagnostics.

## Decision: Keep Full Snapshots Caller-Controlled

**Rationale**: Full snapshots and resume records can be required for application-owned recovery. The SDK should not silently remove fields from caller persistence paths. Instead, event snapshots and diagnostic helpers should be safe by default, while `onSnapshot` remains full and explicitly documented as caller-controlled operational state.

**Alternatives considered**:

- Redact `onSnapshot` by default: rejected because it could break resume flows that rely on transport session data.
- Persist snapshots inside the SDK: rejected because storage policy, encryption, and retention are application decisions.

## Decision: Introduce Retry Policy Additively

**Rationale**: The existing numeric `retries` option is simple and already public. A new retry policy can coexist with it while preserving the default behavior. The policy should describe attempts, delay/backoff, and retryable filtering without retrying permanent integrity or resume failures.

**Alternatives considered**:

- Replace `retries` with a new required policy: rejected as unnecessary breaking change.
- Leave retry behavior fixed: rejected because real large uploads need predictable backoff under transient networks.

## Decision: Make Integration Tests Explicitly Opt-In

**Rationale**: The constitution requires default tests to avoid real credentials and services. Real TUS servers, S3-compatible brokers, and NAS mounts are valuable but must be enabled by explicit environment variables and kept out of default verification.

**Alternatives considered**:

- Run real services in default CI: rejected because it adds credentials, service lifecycle, and environment-specific flakiness.
- Rely only on local fakes: rejected because provider-specific CORS, offset, multipart, filesystem locking, and cleanup behavior cannot be fully proven with fakes.

## Decision: Provide Minimal Server-Side Guidance Before Full Framework Examples

**Rationale**: The SDK should remain framework-agnostic. A minimal server-side flow can clarify application-owned responsibilities for credentials, storage keys, target paths, completion, cleanup, and final verification without adding a framework dependency or committing to one backend style.

**Alternatives considered**:

- Add a full production server template: rejected for 1.1.0 because it would broaden scope and imply framework preference.
- Leave examples browser-only: rejected because storage credentials and NAS paths are intentionally server-owned responsibilities.
