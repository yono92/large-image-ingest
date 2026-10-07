# Start With One Verified Local Upload

Requires Node.js 20+; no cloud account, credentials, React or TypeScript runner is needed.

From a checkout:

```bash
npm install
npm run example:minimal
npm run example:verified
```

The first command builds the SDK and runs [minimal-upload.mjs](minimal-upload.mjs). It creates a valid 512 × 512 grayscale TIFF, starts the real loopback HTTP target, transfers the original using the public core API, and independently verifies the stored SHA-256. Expected output includes `completed` and `storedVerified: true`.

The second runs [verified-workflow.mjs](verified-workflow.mjs). It supplies every adapter that the full workflow requires, pauses after acknowledged progress, reconstructs the client and stores, resumes against the running server, verifies the stored original, seals provenance and persists evidence. Expected output includes `evidence_persisted`, `recovered: true` and `evidenceReloaded: true`.

To retain files in a chosen directory:

```bash
npm run example:verified -- --root /tmp/my-ingest-example
```

The terminal prints safe status and the local artifact root. Inspect `targets/` for the original and `records/` for private resume/checkpoint/evidence files. Full manifests, checksums, metadata and provider state are never printed by default.

## Using A Packed Or Installed Package

From version 1.8.1, both scripts execute without repository tooling:

```bash
node node_modules/large-image-ingest/examples/onboarding/minimal-upload.mjs
node node_modules/large-image-ingest/examples/onboarding/verified-workflow.mjs
```

To validate a checkout as an installed package, run `npm run test:onboarding-package`. It packs the SDK and executes both shipped examples from an isolated consumer without access to checkout dependencies.

## Adapt The Example

- [transport.mjs](transport.mjs) connects to the included reference HTTP server. For an existing tus server, use `createTusTransport({ endpoint })`. For S3, provide the application broker described in [the server guide](../../docs/server-operational-guide.md).
- [file-stores.mjs](file-stores.mjs) supplies functioning resume, checkpoint and immutable evidence stores. Use the exported `createFileStores(root)` once for a root and share its adapters with your workflow.
- `createNodeStoredFileVerifier()` performs the separate stored-byte verification. The reference server resolves generated upload paths from its own manifest mapping.
- Structural TIFF metadata in this example is **caller supplied** and describes only its generated fixture. For another original, obtain real metadata using the TIFF probe or an appropriate trusted source; never reuse fixture dimensions.

## Recovery And Deployment Boundaries

Client reconstruction works while the same reference server is running. Its upload authority is held in memory; restarting the server is not a demonstrated recovery path. The example file stores serialize writes within one factory/process owner. They are not a multi-process database. Production deployment needs shared transactional checkpoint storage, immutable durable evidence storage, server-side authentication, storage authorization and restart-safe transport session persistence.

The example keeps uploaded completion, independent verification and persisted evidence distinct. Preserve those checks when replacing an adapter.
