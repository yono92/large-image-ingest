# Quickstart: Reference Integration And Benchmarks

Run the bounded release-gate scenario after building the package:

```bash
npm run build
npm run test:reference
```

Run and retain a 1 GiB result:

```bash
npm run benchmark:local -- --size-mib 1024 --output benchmarks/results/local-1g.json
```

Run a larger local scenario below the Node file-backed Blob limit only when sufficient disk space and time are available:

```bash
npm run benchmark:local -- --size-mib 3072 --chunk-mib 64 --output benchmarks/results/local-3g.json
```

The command generates and removes temporary source, staging, target, and resume files. Add `--keep-artifacts` only for local diagnosis. Result JSON never contains full manifests, endpoint secrets, resume tokens, or file contents.

The local Node harness rejects fixtures of 4 GiB or larger because the runtime file-backed Blob path truncates larger sizes and offsets. The benchmark proves behavior for the recorded machine and command. It does not promise identical throughput for browsers, remote networks, mounted NAS storage, tus servers, or S3 providers.
