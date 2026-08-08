# Research: Extreme-File Execution

## Worker factory instead of hidden global construction

**Decision**: Accept a `workerFactory` rather than constructing a fixed URL internally.

**Rationale**: CSP, module-worker support, asset hashing, SSR, and bundler URL rewriting differ. A factory keeps the SDK portable while the shipped runtime installer supplies the protocol implementation.

## One Blob/File message instead of whole-byte transfer

**Decision**: Structured-clone the Blob/File handle to the worker and retain bounded slicing inside the worker.

**Rationale**: This avoids allocating the entire source as an ArrayBuffer on the main thread. The worker performs the same bounded algorithm and progress reporting.

## Batch settlement for durable parallel recovery

**Decision**: Use bounded batches and `Promise.allSettled`, then checkpoint successes in chunk order before surfacing failure.

**Rationale**: Concurrent store writes can overwrite each other. Batch settlement preserves parallel network work while serializing the small durable state transition and retaining successful siblings.

## Conservative hard maximum

**Decision**: Reject concurrency outside 1..32.

**Rationale**: Unbounded request fan-out harms browsers, brokers, and customer networks. A fixed public guard is easier to explain and test than speculative adaptive tuning.
