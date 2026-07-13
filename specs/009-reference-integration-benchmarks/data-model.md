# Data Model: Reference Integration And Benchmarks

## Benchmark Configuration

- `sizeBytes`: positive safe integer for generated source size.
- `chunkSizeBytes`: positive safe integer below the fixture size for multi-chunk recovery.
- `failAfterChunks`: acknowledged chunk count after which one forced client interruption occurs.
- `outputPath`: repository-owned JSON evidence path when persistence is requested.
- `keepArtifacts`: opt-in diagnostic retention flag, false by default.

## Reference Run State

- Temporary root and source, staging, target, and resume paths.
- Upload identifier and acknowledged chunk indexes.
- Total received and duplicate received bytes.
- Durable resume record identifier.
- Completion and independent verification status.

## Benchmark Result

- `schemaVersion`: `large-image-ingest.benchmark.v1`.
- `createdAt`: UTC result creation time.
- `packageVersion` and source commit.
- Safe runtime environment facts.
- Configuration values.
- Fixture generation and expected checksum evidence.
- Checksum/manifest, interrupted upload, resumed upload, and total timings.
- Derived throughput values.
- Peak heap, external memory, array buffer, and RSS observations.
- Recovery counters including acknowledged and duplicate bytes.
- Final stored-file size and checksum verification booleans.
- Limitations and reproduction command.

## Lifecycle

1. Create isolated temporary root.
2. Generate source and expected checksum.
3. Open a file-backed Blob and create a manifest.
4. Start HTTP target and first ingest session.
5. Force one client failure after persisted progress.
6. Load the durable record and create a replacement session.
7. Resume, complete, and verify stored file.
8. Write optional result JSON outside the temporary root.
9. Stop the server and remove temporary data unless retention is explicit.
