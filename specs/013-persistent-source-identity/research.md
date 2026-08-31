# Research: Persistent Source Identity and Responsive Checksum

## Decision: Use Whole-File SHA-256 As Strong Source Identity V1

**Decision**: Authorize durable acknowledged-byte reuse only with versioned SHA-256 evidence covering every source byte. Keep metadata fingerprints as fast candidate filters.

**Rationale**: Metadata can collide intentionally or accidentally. The existing manifest checksum already supplies compatible whole-file evidence and the incremental implementation is bounded.

**Alternatives considered**:

- Metadata plus sampled bytes: rejected because unobserved content can differ.
- Per-chunk hashes only: deferred; legacy records do not consistently retain them and this feature does not add transport chunk-checksum policy.
- A provider ETag: rejected because multipart/provider semantics do not reliably identify original bytes.

## Decision: Introduce Resume Record V0.3 And Preserve V0.1/V0.2 Readers

**Decision**: New persistent records use `large-image-ingest.resume.v0.3` with mandatory `ContentSourceIdentityV1` and durable receipts. v0.1/v0.2 remain parseable and classifiable.

**Rationale**: Making a strong field optional on the current writer would allow unsafe new records. A new schema expresses the trust boundary while retaining installed data.

**Alternatives considered**:

- Mutate v0.2 semantics in place: rejected because persisted schemas must not acquire hidden new requirements.
- Drop v0.1: rejected because the active compatibility contract documents it.
- Rewrite records on list/read: rejected because discovery must be non-destructive and may lack the selected source.

## Decision: Reuse Valid Legacy Manifest Checksums, Never Infer Missing Evidence

**Decision**: A legacy record's manifest SHA-256 may seed strong source identity only after schema validation and an exact digest match against the reselected source. Metadata fingerprints, provider IDs, ETags, and acknowledged size do not become content identity.

**Rationale**: Existing default manifests usually contain whole-file SHA-256, enabling safe compatibility without rereading twice. Missing evidence cannot be reconstructed from acknowledged ranges.

**Alternatives considered**:

- Trust the checksum string without recomputing the selected source: rejected because it does not prove reselection.
- Hash only unacknowledged bytes: rejected because skipped bytes would remain unverified.
- Delete weak records: rejected because applications still need safe summaries and explicit cleanup.

## Decision: Promote At Authoritative Checkpoints Only

**Decision**: Promote a safe legacy record to v0.3 when a durable checkpoint is already being written and all v0.3 evidence is trustworthy. Preserve the same record ID, manifest, transport state, receipts, progress, and timestamps except for the normal checkpoint update. Do not promote progressed v0.1 records whose provider receipts would have to be fabricated.

**Rationale**: Checkpoints are already authoritative persistence boundaries. Discovery and compatibility checks should not produce destructive side effects.

**Alternatives considered**:

- Promote immediately after parse: rejected because no source proof exists.
- Promote immediately after classification: rejected because a read-only UI action would mutate storage.
- Manufacture old receipts from ranges: rejected because provider evidence must not be invented.

## Decision: Keep One Incremental Engine Behind Pluggable Executors

**Decision**: Keep the current SHA-256 engine as the sole algorithm implementation. `calculateChecksum` orchestrates validation, cancellation, progress isolation, executor selection, fallback, and output validation. The Worker runtime imports the same function without an executor.

**Rationale**: This provides a clear execution boundary without maintaining two hash algorithms. Core and Node use inline bounded slices; browsers may opt into a Worker.

**Alternatives considered**:

- Duplicate SHA-256 inside the Worker: rejected because drift would undermine identity.
- Require Web Crypto whole-buffer digest: rejected because it requires a source-sized buffer.
- Make Worker the default everywhere: rejected because core/Node and non-browser runtimes must not depend on Worker.

## Decision: Ship The Browser Executor As An ESM-Only Subpath

**Decision**: Add `large-image-ingest/browser` with `createBrowserWorkerChecksumExecutor()`. It constructs the packaged Worker using `new URL(..., import.meta.url)` and is verified after packing. Root/core/CJS imports never evaluate it.

**Rationale**: ESM-relative Worker URLs are bundler-safe and keep browser-only code out of Node/CJS paths. The project is ESM-first and can document the browser subpath boundary.

**Alternatives considered**:

- Blob/eval Worker source: rejected due to CSP, debugging, and duplicated code concerns.
- Require every caller to provide a Worker URL: rejected because that is not an official ready-to-use path.
- Add a bundler runtime dependency: rejected because native modules are sufficient.

## Decision: Make Fallback Explicit

**Decision**: An explicitly configured executor fails with a typed execution error unless the caller selects inline fallback. Abort/cancellation never falls back.

**Rationale**: Silently moving sustained work to the main path violates caller expectations. Explicit fallback lets applications choose correctness with reduced responsiveness or fail safely.

**Alternatives considered**:

- Always fallback: rejected because it can unexpectedly freeze interaction.
- Never support fallback: rejected because some browser deployments need a safe degradation path.

## Decision: Isolate And Sanitize Progress

**Decision**: Clamp progress to `[0, source.size]`, suppress regressions, validate executor output, and catch observer exceptions. Session/controller plumbing reports callback failure through the existing observer-failure boundary without changing checksum authority.

**Rationale**: Third-party executors and callbacks are untrusted extension points. Progress must not become a control plane.

**Alternatives considered**:

- Pass executor events through unchanged: rejected because malformed progress could corrupt UI state.
- Fail checksum when a callback throws: rejected because observer failure must be isolated.

## Decision: Reuse Equivalent Evidence Once

**Decision**: When a manifest checksum exists, create the v0.3 source identity from that result. When manifest checksum is disabled but a persistent store is configured, calculate a separate strong identity exactly once. On resume, calculate once and use it for compatibility and any safe migration.

**Rationale**: This meets the one-traversal requirement without changing manifest schema v1 or attaching private state to manifests.

**Alternatives considered**:

- Always calculate identity and manifest checksum independently: rejected due to double traversal.
- Add source identity to manifest v1: rejected because this feature does not need a manifest schema change.

## Decision: Normalize Missing Recovery Detail To Unsupported

**Decision**: Preserve existing optional capability fields, but normalize omitted `supportsSnapshotResume` and `supportsPersistentResume` to false for recovery decisions. Normal create/upload behavior remains available. Official tus and S3 adapters explicitly declare and test both modes.

**Rationale**: Generic `resumable` does not prove caller snapshot or durable recovery safety. This preserves custom transport source compatibility while preventing unsupported claims.

**Alternatives considered**:

- Infer support from `resumeSession`: rejected because a method may support only one recovery form.
- Make new fields required: rejected because existing custom transports must continue to compile.

## Decision: Verify Producer Version Against Package Metadata

**Decision**: Use a single source constant set to `1.5.0` in manifest production, make the manifest type accept package version strings rather than schema literals, and fail build/package verification if it differs from `package.json`.

**Rationale**: Runtime browser code cannot reliably read package metadata. A build gate makes the embedded producer value release-accurate in dev, ESM, CJS, and packed output.

**Alternatives considered**:

- Read `package.json` at runtime: rejected for browser and bundler portability.
- Reuse manifest schema version: rejected because artifact schema and producer release are separate concepts.

## Decision: Keep Provider Qualification Opt-In

**Decision**: All default tests use synthetic `File`/`Blob`, fake transports, Worker fakes/real browser harness, and the local reference server. Real tus, S3-compatible, and NAS checks remain environment-gated.

**Rationale**: The constitution forbids default credential requirements and the current integration harness already reports explicit skips.
