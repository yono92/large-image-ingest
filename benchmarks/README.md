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

The local Node harness intentionally rejects fixtures of 4 GiB or larger. Current Node file-backed Blob behavior truncates sizes and offsets to 32-bit values in this path, so accepting a larger value would publish invalid evidence. Validate larger files with a real browser File and opt-in provider target rather than weakening the SDK's Blob contract or fabricating a local result.

Generated fixtures and temporary storage are never included in the npm package. Only reviewed result summaries under `docs/` are packaged for npm readers.
