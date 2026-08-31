# Reference Integration And Benchmarks

`large-image-ingest` includes a repository reference harness that consumes the built public package entrypoints. It generates a deterministic source file, creates a checksum-backed manifest, uploads chunks through loopback HTTP into a filesystem staging target, forces one interruption after acknowledged progress, resumes from a JSON-backed durable record with a replacement session, completes once, and verifies the promoted target against the manifest.

The harness is validation infrastructure, not a production upload server. Executable code and generated fixtures stay outside the npm tarball; this methodology and result summary are packaged for npm readers.

## Comparative Adoption Evidence

The separate adoption-evidence runner compares the built SDK binding with raw tus-style and raw S3-style reference compositions over one frozen, credential-free ingest journey. Its retained August 31, 2026 report contains three verified happy paths, 42/42 safe controlled candidate-scenario outcomes, and all 150 raw trials.

The SDK fixture owns 2 of 14 lifecycle responsibilities and 5 explicit configuration decisions, versus 14 responsibilities and 12 decisions in each generic fixture: reductions of 85.71% and 58.33% under unweighted frozen counts. The physical source-line result goes the other way and is retained: 167 SDK-binding lines versus 140 raw-tus and 142 raw-S3 lines. See [Comparative adoption evidence](adoption-evidence.md) and the [raw report](../benchmarks/results/2026-08-adoption-evidence.json) for boundaries, numerators, denominators, revisions, and limitations.

## Recorded Runs

Feature 013 completion verification on August 31, 2026 used the 1.5.0 dirty working tree, Node.js 22.14.0, macOS 26.6.2 arm64, 10 logical CPUs, and 32 GiB system memory:

| Item | 1 GiB run | 3 GiB run |
| --- | ---: | ---: |
| Upload chunk size | 8 MiB | 64 MiB |
| SHA-256 and manifest | 6,825.30 ms / 150.03 MiB/s | 21,257.44 ms / 144.51 MiB/s |
| HTTP transfer including resume | 9,847.04 ms / 103.99 MiB/s | 26,959.10 ms / 113.95 MiB/s |
| Peak JavaScript heap | 10.31 MiB | 10.75 MiB |
| Peak RSS | 194.34 MiB | 267.48 MiB |
| Acknowledged bytes retransmitted | 0 | 0 |
| Stored-file SHA-256 verification | Passed | Passed |

These completion runs were recorded from command output and did not retain generated fixtures or raw JSON result files. They validate current v0.3 identity, interruption/recovery, fixed-size checksum reads, and stored-original verification on the Node reference path. They do not measure a real browser event loop or prove the browser-specific 100 ms responsiveness target.

### Browser Worker Qualification

Feature 013 also retained real Chromium runs of the packaged `large-image-ingest/browser` Worker executor. Each run selected a real sparse `File`, read and hashed every logical byte through 4 MiB slices, verified the result against an independently calculated SHA-256, exercised cancellation after 64 MiB, and sampled the main page plus Chromium process tree:

| Item | 1 GiB run | 3 GiB run |
| --- | ---: | ---: |
| Worker checksum | 3,841.20 ms / 266.58 MiB/s | 11,503.00 ms / 267.06 MiB/s |
| Main-thread maximum interval delay | 1.10 ms | 2.00 ms |
| Observed long tasks | 0 | 0 |
| Main-page heap start / peak | 1.95 MiB / 1.95 MiB | 1.95 MiB / 1.95 MiB |
| Chromium process-tree RSS start / peak | 290.53 MiB / 405.78 MiB | 290.94 MiB / 497.02 MiB |
| Chromium RSS growth | 115.25 MiB | 206.08 MiB |
| Cancellation result | `checksum.canceled` | `checksum.canceled` |
| Progress after cancellation | 0 events | 0 events |
| Completed SHA-256 | Verified | Verified |

The retained [1 GiB](https://github.com/yono92/large-image-ingest/blob/main/benchmarks/results/2026-08-browser-checksum-1g.json) and [3 GiB](https://github.com/yono92/large-image-ingest/blob/main/benchmarks/results/2026-08-browser-checksum-3g.json) results use schema `large-image-ingest.browser-checksum-benchmark.v1`. The gate fails if progress is non-monotonic, the Worker returns after cancellation, the digest differs, the result reports a slice other than 4 MiB, a measured main-thread task reaches 100 ms, main-page heap grows by 64 MiB or more, or Chromium process-tree RSS grows by 512 MiB or more.

These runs used Chromium 151.0.7922.34 on the same August 31, 2026 macOS arm64 host. Process-tree RSS includes fixed browser overhead and Worker runtime memory; the conservative fixed ceiling demonstrates bounded behavior for these sizes, not an exact allocation profile or a universal device guarantee.

### Historical 1.3.0 Baseline

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

These historical runs predate the 1.5.0 browser Worker and v0.3 source-identity release. They prove bounded Node slice processing and stored-file integrity for their recorded version, but they are not evidence for browser main-thread responsiveness or Feature 013 cancellation. Use the separately retained browser qualification above for those claims.

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

Run the bounded browser Worker release gate:

```bash
npm run test:browser-checksum
```

Retain full-size browser qualification results when sufficient disk, memory, and time are available:

```bash
npm run benchmark:browser-checksum -- --size-mib 1024 --output benchmarks/results/browser-checksum-1g.json
npm run benchmark:browser-checksum -- --size-mib 3072 --output benchmarks/results/browser-checksum-3g.json
```

The browser runner creates a temporary sparse source, serves the built ESM entrypoint over loopback HTTP, sets that source on a real file input, and removes the source and browser process in `finally`. It does not retain the source digest in its report.

## What This Proves

- The built package can process a 3 GiB file through bounded Blob slices without source-size-linear JavaScript heap growth in the recorded environment.
- A durable record retains two acknowledged chunk receipts across creation of a replacement ingest session.
- Resume skips acknowledged chunks, and the reference target observes zero duplicate bytes.
- Remote completion occurs once.
- The promoted target matches manifest size and whole-file SHA-256.
- The same 64 MiB correctness path runs in CI and before publish without credentials.
- The packaged browser Worker hashes real 1 GiB and 3 GiB `File` inputs with fixed slices, monotonic progress, verified output, responsive cancellation, and no measured 100 ms main-thread task in the recorded environment.
- Main-page heap and Chromium process-tree RSS remain within fixed, source-size-independent qualification ceilings for both recorded browser sizes.

## Limitations

- Loopback HTTP and local filesystem throughput do not predict remote tus, S3-compatible, or mounted NAS throughput.
- The client and reference server run in one Node.js process, so memory measurements cover the complete harness rather than browser-only client memory.
- Results vary with CPU, filesystem, Node.js version, power policy, security software, and concurrent system load.
- The run replaces the ingest session object but does not restart the reference server process.
- The local Node file-backed Blob path is limited to less than 4 GiB because current Node behavior truncates larger sizes and offsets. Files at 4 GiB and above require a real browser File or provider-specific integration run.
- Real-provider offset, CORS, multipart lifecycle, and mount semantics remain explicit opt-in integration targets.
- Browser qualification uses a sparse zero-filled file to reduce fixture creation cost. Chromium still reads and hashes every logical byte, but this does not model storage media with different read behavior.
- Chromium process-tree RSS is a coarse operating-system sample that includes the browser, renderer, Worker, and fixed runtime overhead. It is deliberately not presented as Worker-only memory.
- The heartbeat and Long Tasks API observations support the recorded responsiveness claim but do not prove behavior on every browser, device, power policy, or concurrent workload.

These results are evidence for the recorded configuration, not a universal performance guarantee.
