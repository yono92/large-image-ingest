# large-image-ingest

[![npm](https://img.shields.io/npm/v/large-image-ingest)](https://www.npmjs.com/package/large-image-ingest)
[![CI](https://github.com/yono92/large-image-ingest/actions/workflows/ci.yml/badge.svg)](https://github.com/yono92/large-image-ingest/actions/workflows/ci.yml)

Resumable upload SDK for very large inspection images that never touches the original bytes and proves what was stored.

Built for semiconductor and industrial inspection, microscopy and satellite imagery, where the uploaded original is a source-of-truth artifact. It validates, hashes, plans chunks, uploads through your transport (tus, S3 multipart, NAS gateway) and verifies the stored file. It never decodes, resizes, recompresses or strips metadata.

## Why not just Uppy or tus-js-client?

Keep them for UI and plain transfer. Use this SDK when you must show that the stored file is the original.

| | large-image-ingest | tus-js-client | Uppy |
| --- | --- | --- | --- |
| Resume identity | Whole-file SHA-256 of the content | Fingerprint of name, size, type and modified time | Same as its transport plugin |
| Original bytes | Never transformed | Not transformed | Optional plugins (compressor, image editor) can transform |
| Stored-file verification | Built in (`node` subpath, workflow) | Not built in | Not built in |
| Per-chunk integrity | SHA-256 per chunk for parallel S3 transfer | Not built in | Not built in |
| Manifest | Versioned, with checksums and derivative references | None | None |

Uppy can still be your UI: see [the Uppy integration](docs/integrations/uppy.md).

## Install

```bash
npm install large-image-ingest
```

pnpm (`pnpm add`), Yarn (`yarn add`) and Bun (`bun add`) work the same way. Node.js 20+ for Node usage; any modern browser for browser usage.

## Upload a file

```ts
import { createIngestSession } from "large-image-ingest/core";
import { createTusTransport } from "large-image-ingest/transport-tus";

export async function upload(file: File) {
  const session = createIngestSession(file, {
    transport: createTusTransport({ endpoint: "/uploads/" })
  });
  return session.start(); // manifest with whole-file SHA-256, chunk receipts
}
```

The session computes the SHA-256, owns chunking, retries, pause and resume, and returns a manifest. Verify the stored original on the server with `verifyNodeFileManifest` from `large-image-ingest/node`. See [the quickstart](docs/quickstart.md).

## Try it locally

Run a complete upload over real HTTP with independent stored-file verification. No cloud credentials needed:

```bash
npm exec --no -- large-image-ingest-minimal
```

Use your own file (opened read-only, streamed, verified after storage):

```bash
npm exec --no -- large-image-ingest-minimal --file "./inspection image.tiff" --root ./local-ingest
```

For profile evaluation, durable recovery, stored verification and audit evidence together:

```bash
npm exec --no -- large-image-ingest-verified
```

Use `pnpm exec`, `yarn run` or `bun run` in place of `npm exec --no --`. See [the example instructions](examples/onboarding/README.md).

## Faster hashing

Hashing happens before upload, so its speed is the wait users see. Pick an executor for your runtime:

```ts
// Node.js: node:crypto
import { createNodeChecksumExecutor } from "large-image-ingest/node";
createIngestSession(file, { transport, checksum: { executor: createNodeChecksumExecutor() } });

// Browser: built-in SHA-256 in a Worker, keeping the page responsive
import { createBrowserWorkerChecksumExecutor } from "large-image-ingest/browser";
createIngestSession(file, { transport, checksum: { executor: createBrowserWorkerChecksumExecutor() } });
```

| Executor | Measured (Apple Silicon) |
| --- | ---: |
| Built-in JavaScript (default), 1 GiB file, Node.js | 399 MiB/s |
| `createNodeChecksumExecutor`, 1 GiB file | 1,881 MiB/s |
| `createBrowserWorkerChecksumExecutor`, 256 MiB, Chromium | 347 MiB/s |

All executors produce identical digests and the same progress and cancellation contract. See [benchmarks](docs/benchmarks.md).

## Stability

| Tier | Import paths | Promise |
| --- | --- | --- |
| Stable | `core`, `browser`, `transport-tus`, `transport-s3`, `node`, `react`, `tiff` | Semver: breaking changes only in a major release |
| Experimental | `provenance`, `preservation`, `profiles`, `workflow`, `conformance`, `react-ui` | May change in a minor release; changes are listed in the [changelog](CHANGELOG.md). Exports carry an `@experimental` TSDoc tag |
| Compatibility | root `large-image-ingest` | Re-exports `core` plus the tus and S3 transports |

All paths are prefixed with `large-image-ingest/`.

## Verify the package you install

Releases from 1.9.0 are published from GitHub Actions with npm provenance. Check signatures and attestations of your installed dependencies with:

```bash
npm audit signatures
```

## Documentation

- [Feature guide](docs/guide.md): checksums, parallel upload, provenance, preservation, profiles, React, TIFF, derivatives, transports, verification commands
- [Quickstart and API examples](docs/quickstart.md)
- [Verified ingest workflow](docs/verified-ingest-workflow.md)
- [Benchmarks](docs/benchmarks.md) and [adoption evidence](docs/adoption-evidence.md)
- [Transport conformance](docs/transport-conformance.md) and [server operational guide](docs/server-operational-guide.md)
- [First-party React UI](docs/react-ui.md)
- [Glossary](docs/glossary.md)
- [Roadmap](docs/roadmap.md), [development](docs/development.md), [changelog](CHANGELOG.md)

## Design principles

1. Preserve the original file by default; previews, thumbnails and tiles are separate derivatives.
2. Upload large files in chunks, with observable and recoverable state.
3. Generate a manifest before upload starts and verify after storage.
4. Keep the core framework-agnostic and transports adapter-based.
5. Keep runtime dependencies at zero; heavier helpers are optional peers.

## License

MIT
