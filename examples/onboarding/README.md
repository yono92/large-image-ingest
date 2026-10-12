# Start With One Verified Local Upload

Requires Node.js 20+; no cloud account, credentials, React or TypeScript runner is needed.

From a checkout:

```bash
npm install
npm run example:minimal
npm run example:verified
```

The first command builds the SDK and compiles the TypeScript example into `dist/examples/`. Its source is [minimal-upload.mts](minimal-upload.mts). It creates a valid 512 × 512 grayscale TIFF, starts the real loopback HTTP target, transfers the original using the public core API, and independently verifies the stored SHA-256. Expected output includes `completed` and `storedVerified: true`.

The second compiles and runs [verified-workflow.mts](verified-workflow.mts). It supplies every adapter that the full workflow requires, pauses after acknowledged progress, reconstructs the client and stores, resumes against the running server, verifies the stored original, seals provenance and persists evidence. Expected output includes `evidence_persisted`, `recovered: true` and `evidenceReloaded: true`.

To retain files in a chosen directory:

```bash
npm run example:verified -- --root /tmp/my-ingest-example
```

The terminal prints safe status and the local artifact root. Inspect `targets/` for the original and `records/` for private resume/checkpoint/evidence files. Full manifests, checksums, metadata and provider state are never printed by default.

## Using A Packed Or Installed Package

Version 1.8.2 provides commands that resolve through each package manager, including Yarn PnP:

| Manager | Minimal upload | Verified fixture workflow |
| --- | --- | --- |
| npm | `npm exec --no -- large-image-ingest-minimal` | `npm exec --no -- large-image-ingest-verified` |
| pnpm | `pnpm exec large-image-ingest-minimal` | `pnpm exec large-image-ingest-verified` |
| Yarn | `yarn run large-image-ingest-minimal` | `yarn run large-image-ingest-verified` |
| Bun | `bun run large-image-ingest-minimal` | `bun run large-image-ingest-verified` |

These commands execute compiled examples with Node.js 20+, including when Bun installs the package. They need no repository tooling or optional React/geotiff peers. Direct paths also work with node_modules installations:

```bash
node node_modules/large-image-ingest/dist/examples/onboarding/minimal-upload.mjs
node node_modules/large-image-ingest/dist/examples/onboarding/verified-workflow.mjs
```

Version 1.8.1 keeps these scripts at `examples/onboarding/` instead of `dist/examples/onboarding/`.

To build and validate npm consumption, run `npm run test:onboarding-package`. After building once, use `npm run test:package-manager -- --manager npm` (or `pnpm`, `yarn`, `bun`). The runner actually installs a local tarball, checks ESM/CommonJS and absent optional peers, then executes both examples and a supplied-file journey. Missing managers fail instead of being skipped. See [qualification setup and scope](../../docs/development.md).

## Use Your Own Original

```bash
npm run example:minimal -- --file "./inspection image.tiff" --root ./local-ingest
# Installed package:
npm exec --no -- large-image-ingest-minimal --file "./inspection image.tiff" --root ./local-ingest
```

The minimal example accepts any non-empty local regular file, labels MIME type from known image extensions, and independently verifies the stored bytes. It does not decode or infer dimensions/domain metadata, so a TIFF extension alone does not establish a valid TIFF container. Files are opened read-only with file-backed `Blob` slices; Node 20's native `fs.openAsBlob` API is experimental. Source changes are rejected rather than reported as verified. The local target has a 10 GiB size limit and needs disk space for its stored copy.

The full workflow keeps its known generated fixture and domain metadata; it rejects `--file`. Both commands accept `--root` and `--help`. Artifact paths printed after success are for local inspection; error output never prints source names, paths, checksums or raw exceptions.

## Safe Failure Guidance

| Cause code | Next action |
| --- | --- |
| `usage.invalid` | Run `--help`; remove duplicate/unsupported options and supply values. |
| `input.not_found`, `input.access_denied`, `input.failed` | Check the input path and read permissions. |
| `input.not_regular`, `input.empty` | Choose a non-empty regular original. |
| `input.changed` | Keep the source unchanged during the entire run and retry. |
| `storage.access_denied`, `storage.full` | Select a writable artifact root with enough free space. |
| `server.port_in_use` | Stop the conflicting local server. |
| `validation.failed` | Check the file and ingest policy. |
| `verification.failed` | Keep the source unchanged and inspect local stored bytes before retrying. |
| `example.failed` | Check the documented runtime, local server and storage requirements. |

## Adapt The Example

- [transport.mts](transport.mts) connects to the included reference HTTP server. For an existing tus server, use `createTusTransport({ endpoint })`. For S3, provide the application broker described in [the server guide](../../docs/server-operational-guide.md).
- [file-stores.mts](file-stores.mts) supplies functioning resume, checkpoint and immutable evidence stores. Use the exported `createFileStores(root)` once for a root and share its adapters with your workflow.
- `createNodeStoredFileVerifier()` performs the separate stored-byte verification. The reference server resolves generated upload paths from its own manifest mapping.
- Structural TIFF metadata in this example is **caller supplied** and describes only its generated fixture. For another original, obtain real metadata using the TIFF probe or an appropriate trusted source; never reuse fixture dimensions.

## Recovery And Deployment Boundaries

Client reconstruction works while the same reference server is running. Its upload authority is held in memory; restarting the server is not a demonstrated recovery path. The example file stores serialize writes within one factory/process owner. They are not a multi-process database. Production deployment needs shared transactional checkpoint storage, immutable durable evidence storage, server-side authentication, storage authorization and restart-safe transport session persistence.

The example keeps uploaded completion, independent verification and persisted evidence distinct. Preserve those checks when replacing an adapter.
