# Implementation Plan: Extreme-File Execution

## Summary

Release 1.5.0 adds an injectable checksum executor with a versioned Worker protocol and adds bounded batch-parallel chunk scheduling to the existing session. The default remains the current sequential, in-process path. Core continues to own ordering, receipt validation, durable checkpointing, and completion evidence; transports opt in only through their existing capability flag.

## Technical Context

- TypeScript, ESM-first with generated CommonJS compatibility
- Browser APIs: Blob, File, AbortSignal, Worker-compatible messaging
- Node 20+ test/runtime compatibility
- No new runtime dependency
- Existing manifest v1, resume v0.3, completion v1 remain unchanged

## Constitution Check

- Originals remain immutable and are read through Blob slicing.
- Parallelism is opt-in, bounded, provider-neutral, and observable.
- Persistent recovery checkpoints only validated acknowledgements.
- Worker construction remains adapter-like so core does not assume bundler or CSP policy.
- Existing defaults stay sequential and framework-agnostic.

## Project Structure

```text
src/checksum.ts
src/checksum-worker.ts
src/checksum-worker-runtime.ts
src/session.ts
src/types.ts
tests/checksum-worker.test.ts
tests/session-parallel.test.ts
examples/worker-checksum.ts
```

## Design

### Worker checksum

`ChecksumExecutor.calculate(file, options)` is selected by `calculateChecksum` when supplied. `createWorkerChecksumExecutor` creates one worker per calculation, sends one versioned request containing the Blob/File and scalar checksum options, forwards validated progress, and terminates on every terminal path. `installChecksumWorkerRuntime(scope)` installs the corresponding worker listener and delegates to the same default checksum implementation without recursively selecting an executor.

### Parallel scheduler

`execution.maxParallelChunks` is normalized before remote session creation. The scheduler takes incomplete chunks in bounded batches, emits start events, waits for every operation in the batch to settle, validates and checkpoints successful results in chunk-index order, then throws the first ordered failure. This retains acknowledgements from successful siblings without concurrent resume-store writes.

### Compatibility

- Default concurrency is one.
- Explicit concurrency above one requires an affirmative transport capability.
- Manifest, resume, completion, receipt, and event schemas do not change.
- Official S3 and tus implementations remain sequential.

## Verification Strategy

- Protocol unit tests with an in-memory Worker fake
- Session concurrency/failure/resume tests with a timing-controlled transport
- Existing full suite for compatibility
- Example typecheck, package consumption, reference benchmark, package dry-run, audit
