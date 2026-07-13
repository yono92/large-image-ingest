# Research: Reference Integration And Benchmarks

## Decision 1: Benchmark The Ingest Contract, Not A UI

**Decision**: Measure checksum, manifest creation, HTTP chunk transfer, forced interruption, durable resume, completion, and stored-file verification.

**Rationale**: These are the library's differentiated claims. Styled UI, raster rendering, and cloud-specific SDK performance are outside the product boundary.

**Alternatives considered**: A full React demo was rejected because it would measure presentation behavior rather than ingest integrity. A raw checksum microbenchmark alone was rejected because it would not prove recovery.

## Decision 2: Use A Native Local HTTP Reference Target

**Decision**: Use a test-owned HTTP service and filesystem target implemented with native runtime APIs.

**Rationale**: It crosses a real network boundary, writes real storage, remains deterministic, needs no credentials, and can run in CI. External tus, S3-compatible, and mounted NAS checks stay opt-in for provider semantics.

**Alternatives considered**: Docker-only MinIO and tusd would be closer to providers but cannot be a default release gate when Docker is unavailable. In-memory fake transport was rejected because it does not prove HTTP or filesystem behavior.

## Decision 3: Generate Deterministic Fixtures On Demand

**Decision**: Stream a repeated deterministic byte pattern to a temporary file while calculating its expected SHA-256.

**Rationale**: GiB-scale fixtures must not enter git or npm. Streaming generation avoids source-size-linear application buffers and gives an independent expected checksum.

## Decision 4: Publish Raw Evidence And A Human Summary

**Decision**: Commit a versioned JSON result from an actual 1 GiB or larger run and summarize methodology and limitations in packaged documentation.

**Rationale**: Raw evidence supports reproduction and review; a concise table helps npm readers. Environment-specific measurements are not presented as universal guarantees.

## Decision 5: Add A Small Release Gate

**Decision**: Run a 64 MiB scenario after build in CI and `prepublishOnly`.

**Rationale**: The harness must not silently rot. The small scenario exercises the same recovery and verification path while keeping routine checks bounded.

## Decision 6: Reject Invalid Node Blob Sizes

**Decision**: Limit the local Node file-backed Blob harness to less than 4 GiB and require real browser or provider runs above that boundary.

**Rationale**: Node 24.17.0 reports a 10 GiB `fs.openAsBlob()` source as 2 GiB and its Blob slice implementation requires 32-bit offsets. Publishing a 10 GiB result through that path would be false evidence. The SDK keeps its standard Blob contract; the harness reports the runtime limitation explicitly.
