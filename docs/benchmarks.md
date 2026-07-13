# Reference Integration And Benchmarks

`large-image-ingest` includes a repository reference harness that consumes the built public package entrypoints. It generates a deterministic source file, creates a checksum-backed manifest, uploads chunks through loopback HTTP into a filesystem staging target, forces one interruption after acknowledged progress, resumes from a JSON-backed durable record with a replacement session, completes once, and verifies the promoted target against the manifest.

The harness is validation infrastructure, not a production upload server. Executable code and generated fixtures stay outside the npm tarball; this methodology and result summary are packaged for npm readers.

## Recorded Runs

Measured on July 13, 2026 from the `1.3.0` working tree:

| Item | 1 GiB run | 3 GiB run |
| --- | ---: | ---: |
| Source size | 1,024 MiB | 3,072 MiB |
| Upload chunk size | 8 MiB | 64 MiB |
| Checksum read size | 4 MiB | 4 MiB |
| Forced interruption | After 16 MiB | After 128 MiB |
| Fixture generation | 16,015.47 ms | 23,611.36 ms |
| SHA-256 and manifest | 24,894.93 ms / 41.13 MiB/s | 55,250.04 ms / 55.60 MiB/s |
| HTTP transfer including resume | 28,539.45 ms / 35.88 MiB/s | 59,179.20 ms / 51.91 MiB/s |
| End-to-end harness time | 70,442.06 ms | 141,540.39 ms |
| Peak JavaScript heap | 11.42 MiB | 12.95 MiB |
| Peak RSS | 176.40 MiB | 185.64 MiB |
| Peak external memory | 119.96 MiB | 135.87 MiB |
| Peak array-buffer memory | 100.10 MiB | 128.81 MiB |
| Acknowledged bytes retransmitted | 0 | 0 |
| Remote completion calls | 1 | 1 |
| Stored-file SHA-256 verification | Passed | Passed |

Environment:

- Windows `10.0.26200`, x64
- Node.js `v24.17.0`
- Intel Core Ultra 5 115U, 10 logical processors
- 15.56 GiB system memory

The raw [1 GiB](https://github.com/yono92/large-image-ingest/blob/main/benchmarks/results/2026-07-local-1g.json) and [3 GiB](https://github.com/yono92/large-image-ingest/blob/main/benchmarks/results/2026-07-local-3g.json) results use schema `large-image-ingest.benchmark.v1` and record timing, memory, recovery, integrity, configuration, and environment values.

## Reproduce

Run the bounded 64 MiB release gate:

```bash
npm run build
npm run test:reference
```

Generate a 1 GiB result:

```bash
npm run benchmark:local -- --size-mib 1024 --output benchmarks/results/local-1g.json
```

Run a larger local scenario below the Node file-backed Blob limit when sufficient disk space and time are available:

```bash
npm run benchmark:local -- --size-mib 3072 --chunk-mib 64 --output benchmarks/results/local-3g.json
```

The command creates source, staging, target, and resume files under one operating-system temporary directory. It removes them in `finally` on success or failure unless `--keep-artifacts` is supplied.

## What This Proves

- The built package can process a 3 GiB file through bounded Blob slices without source-size-linear JavaScript heap growth in the recorded environment.
- A durable record retains two acknowledged chunk receipts across creation of a replacement ingest session.
- Resume skips acknowledged chunks, and the reference target observes zero duplicate bytes.
- Remote completion occurs once.
- The promoted target matches manifest size and whole-file SHA-256.
- The same 64 MiB correctness path runs in CI and before publish without credentials.

## Limitations

- Loopback HTTP and local filesystem throughput do not predict remote tus, S3-compatible, or mounted NAS throughput.
- The client and reference server run in one Node.js process, so memory measurements cover the complete harness rather than browser-only client memory.
- Results vary with CPU, filesystem, Node.js version, power policy, security software, and concurrent system load.
- The run replaces the ingest session object but does not restart the reference server process.
- The local Node file-backed Blob path is limited to less than 4 GiB because current Node behavior truncates larger sizes and offsets. Files at 4 GiB and above require a real browser File or provider-specific integration run.
- Real-provider offset, CORS, multipart lifecycle, and mount semantics remain explicit opt-in integration targets.

These results are evidence for the recorded configuration, not a universal performance guarantee.
