# Research: Core 1.0 Release

## Runtime Dependencies

Decision: keep runtime dependencies empty for 1.0.

Reasoning: the core package is the trust boundary for large source-of-truth inspection files. A small dependency surface makes browser and Node usage easier to audit. Transport adapters can add provider dependencies later.

## Checksum Implementation

Decision: implement incremental SHA-256 in core rather than adding a hashing dependency.

Reasoning: WebCrypto does not expose incremental hashing, and digesting a whole multi-GB file at once would violate the memory goals. A small internal SHA-256 implementation keeps bounded memory and avoids shipping a runtime dependency.

## Pause Semantics

Decision: pause between chunks.

Reasoning: interrupting in-flight network requests is provider-specific and can corrupt resumability semantics. Between-chunk pause is deterministic and sufficient for 1.0 core behavior.

## Resume Persistence

Decision: expose serializable snapshots but do not persist them.

Reasoning: browser storage choices depend on application policy, quota, privacy requirements, and authentication boundaries. The core should provide the state object, not own persistence.

## Dimension Validation

Decision: validate dimensions only when callers provide image metadata.

Reasoning: inspection image formats can be TIFF, microscopy formats, satellite formats, or proprietary files. Decoding them in core would add dependencies and memory risk. Dedicated preview or node packages can enrich manifests later.

## Transport Packaging

Decision: keep official tus, S3, and NAS protocol code out of `large-image-ingest/core`, but ship first-party adapters as isolated package subpaths in `large-image-ingest@1.0.0`.

Reasoning: the core contract stays provider-neutral and runtime-dependency-free, while the package can still give users practical first-party adapters. Subpath exports keep browser-safe core imports separate from protocol-specific code and leave a clean migration path to future scoped packages.
