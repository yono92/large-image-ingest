# Local Reference Benchmark

This repository-only harness validates the built package through a real loopback HTTP boundary and local filesystem target. It generates a deterministic source file, calculates a manifest checksum through the public core entrypoint, interrupts after acknowledged progress, resumes from a JSON-backed durable record with a replacement session, completes exactly once, and verifies the promoted target through the public Node entrypoint.

Run the 64 MiB release gate after building:

```bash
npm run build
npm run test:reference
```

Retain a 1 GiB result:

```bash
npm run benchmark:local -- --size-mib 1024 --output benchmarks/results/local-1g.json
```

Available options:

- `--size-mib <number>`: generated fixture size; default `64`.
- `--chunk-mib <number>`: upload chunk size; default `8`.
- `--fail-after-chunks <integer>`: acknowledged chunks before one forced interruption; default `2`.
- `--output <path>`: JSON output under `benchmarks/results/`.
- `--keep-artifacts`: retain temporary source, resume, staging, and target data for local diagnosis.

The runner records process-level peak RSS, JavaScript heap, external memory, and array-buffer memory. The client and reference server share one Node process, so these values measure the complete local harness rather than client-only browser memory. Loopback and local-disk throughput are not predictions for remote tus, S3, or NAS infrastructure.

`results/2026-08-transport-conformance.json` retains the versioned ten-run credential-free S3 multipart, tus, and NAS conformance report used by the 1.6.0 release gate. See `docs/transport-conformance.md` for interpretation and limitations.

`results/2026-08-adoption-evidence.json` retains the three-candidate comparative adoption report. Generate it with `npm run evidence:adoption`; validate it and rerun the frozen matrix twice with `npm run test:adoption-evidence`. It records 42 candidate-scenario results and 150 raw trials without credentials, provider receipts, full manifests, or recovery records. See `docs/adoption-evidence.md` for the exact implementation metrics and claim limits.

For Feature 013, the 1 GiB and 3 GiB Node commands remain bounded integrity and one-traversal evidence only. They do not measure browser interaction. The separate browser Worker harness runs the packaged `large-image-ingest/browser` executor with a real `File`, records environment and slice size, verifies monotonic progress and fixed buffering, exercises cancellation, and fails when a measured main-thread task reaches 100 ms.

The August 31, 2026 completion run passed both sizes on the 1.5.0 working tree with peak JavaScript heap of 10.31 MiB for 1 GiB and 10.75 MiB for 3 GiB, zero duplicate acknowledged bytes, and verified stored SHA-256. Generated fixtures and raw result JSON were not retained; the command-output summary and environment are recorded in `docs/benchmarks.md`.

The local Node harness intentionally rejects fixtures of 4 GiB or larger. Current Node file-backed Blob behavior truncates sizes and offsets to 32-bit values in this path, so accepting a larger value would publish invalid evidence. Validate larger files with a real browser File and opt-in provider target rather than weakening the SDK's Blob contract or fabricating a local result.

## Browser Worker Qualification

Run the bounded 64 MiB drift gate after building:

```bash
npm run test:browser-checksum
```

Retain a full-size result:

```bash
npm run benchmark:browser-checksum -- --size-mib 1024 --output benchmarks/results/browser-checksum-1g.json
npm run benchmark:browser-checksum -- --size-mib 3072 --output benchmarks/results/browser-checksum-3g.json
```

The harness creates a sparse deterministic zero-filled source in the operating-system temporary directory, assigns it to a real browser file input, and makes the Worker read and hash every logical byte through the built ESM package. It independently calculates the expected digest, but does not write the digest to the report. It records cancellation, progress monotonicity, late events, main-page heartbeat delay, Long Tasks observations, page heap, and Chromium process-tree RSS.

The August 31, 2026 reviewed results are retained as `2026-08-browser-checksum-1g.json` and `2026-08-browser-checksum-3g.json`. Both verified the digest, returned `checksum.canceled` with zero late progress after cancellation, reported no long task, and stayed below the fixed 100 ms main-thread, 64 MiB page-heap-growth, and 512 MiB browser-RSS-growth gates. See `docs/benchmarks.md` for the comparison table and limitations.

Generated fixtures, benchmark executables, and raw result files are never included in the npm package. Only reviewed result summaries under `docs/` are packaged for npm readers.
