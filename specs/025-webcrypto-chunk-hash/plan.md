# Implementation Plan: WebCrypto Chunk Hashing

## Approach

- Change only `calculateBlobSha256` in `src/checksum.ts`. Its callers (parallel chunk evidence and parallel resume checks in `src/session.ts`) gain the speedup without changes.
- The 64 MiB ceiling bounds the one-shot buffer; the default upload chunk is far below it.
- Whole-file checksums keep the streaming hasher and the `ChecksumExecutor` contract.

## Verification

`tests/hash-executors.test.ts` (WebCrypto path, fallback without WebCrypto, >64 MiB streaming path, abort), then `npm run typecheck`, `npm test`, `npm run build`, `npm run size`.
