# large-image-ingest

TypeScript SDK for verifiable, resumable ingestion of very large inspection images while preserving the original file as the source of truth.

The package is built for semiconductor inspection, microscopy, industrial vision, wafer inspection, medical imaging, satellite imaging, and other workflows where the uploaded original is a source-of-truth artifact that must remain verifiable.

The package orchestrates validation, checksums, manifest generation, chunk planning, resumable session state, safe diagnostics, derivative references, and adapter-based storage transfer. It does not decode, resize, compress, tile, or otherwise transform images.

## Install

```bash
npm install large-image-ingest
```

## Verified Reference Run

The repository reference harness exercises the built package through real loopback HTTP, forces an interruption after durable progress, resumes with a replacement session, and verifies the stored file against its manifest.

| Scenario | Result |
| --- | ---: |
| Source size | 3 GiB |
| SHA-256 and manifest | 144.51 MiB/s |
| HTTP transfer including resume | 113.95 MiB/s |
| Peak JavaScript heap / RSS | 10.75 MiB / 267.48 MiB |
| Acknowledged bytes retransmitted | 0 |
| Remote completion calls | 1 |
| Stored-file SHA-256 | Verified |

This August 31, 2026 Feature 013 verification used Node.js 22.14.0 on macOS 26.6.2 arm64 with a 64 MiB upload chunk. The client and local reference server shared one process; loopback throughput is not a remote-provider or browser-responsiveness guarantee. See the [methodology, historical results, limitations, and reproduction commands](docs/benchmarks.md).

The separately retained Chromium Worker qualification hashed real 1 GiB and 3 GiB `File` inputs at 266.58 and 267.06 MiB/s. Both digests matched, cancellation returned `checksum.canceled` with no late progress, and the maximum measured main-thread delay was 2.00 ms with no observed long task. These are machine-specific qualification results, not universal performance guarantees.

The credential-free adoption comparison also records three equivalent reference integrations across 14 injected scenarios. The SDK binding reduced application-owned lifecycle responsibilities from 14 to 2 (85.71%) and explicit configuration decisions from 12 to 5 (58.33%), while the honest physical-line result was adverse: 167 SDK-binding lines versus 140 and 142 in the two generic fixtures. All candidates passed 14/14 controlled scenarios, so this evidence demonstrates coordination ownership reduction—not a lower real-world incident rate. See [the method, raw report, and claim limits](docs/adoption-evidence.md).

## Quick Start

```ts
import { createIngestSession } from "large-image-ingest/core";

const session = createIngestSession(file, {
  chunking: {
    chunkSize: 64 * 1024 * 1024
  },
  validation: {
    maxBytes: 10 * 1024 * 1024 * 1024,
    acceptedMimeTypes: ["image/tiff", "image/png", "image/jpeg"],
    acceptedExtensions: ["tif", "tiff", "png", "jpg", "jpeg"],
    requiredMetadata: ["lotId", "waferId"]
  },
  image: {
    format: "tiff",
    width: 4096,
    height: 4096,
    colorDepth: 16
  },
  metadata: {
    lotId: "LOT-2026-001",
    waferId: "W12"
  },
  transport: {
    capabilities: {
      name: "app-api",
      resumable: true,
      abortable: true,
      expires: false,
      supportsParallelChunks: false,
      supportsChunkChecksum: false
    },
    async createSession({ manifest }) {
      return {
        uploadId: `upload-${manifest.id}`,
        transportName: "app-api",
        createdAt: new Date().toISOString()
      };
    },
    async uploadChunk({ chunk, body }) {
      await fetch(`/api/uploads/chunks/${chunk.index}`, {
        method: "PUT",
        body
      });

      return {
        chunkIndex: chunk.index,
        sizeBytes: body.size,
        completedAt: new Date().toISOString(),
        transport: { name: "app-api" }
      };
    },
    async completeSession({ manifest, uploadId, receipts }) {
      await fetch(`/api/uploads/${uploadId}/complete`, {
        method: "POST",
        body: JSON.stringify({ manifest, receipts })
      });
    }
  },
  onEvent(event) {
    console.log(event.type);
  }
});

const manifest = await session.start();
```

More examples are in [docs/quickstart.md](docs/quickstart.md).

## What It Provides

- Original-preserving manifest schema `large-image-ingest.manifest.v1`
- File validation for size, MIME type, extension, metadata, dimensions, and checksum mismatch
- Whole-file SHA-256 checksums using bounded `Blob.slice` reads, cancellation, and an optional browser Worker executor
- Deterministic chunk planning for large files
- Upload sessions with progress, retry, pause, cancel, failure, completion, and resume events
- Content-bound v0.3 persistent resume records with durable chunk receipts and safe v0.1/v0.2 readers
- Safe diagnostics helpers for logs, telemetry, support traces, and recovery UI
- Derivative references for previews, thumbnails, tiles, metadata enrichments, and custom outputs
- Browser-safe tus and S3 multipart transport helpers
- Server-side NAS gateway and stored-file verification helpers under the Node subpath
- Versioned, evidence-driven S3/tus/NAS conformance reports and an explicit real-target qualification path
- Opt-in integrity-protected ingest provenance with safe summaries, explicit exports, and application-owned persistence
- Node-only BagIt 1.0 and OCFL 1.1 preflight, streaming export, and independent fixity validation
- Explicit versioned semiconductor, microscopy, and satellite validation profiles with safe derived-policy and resume binding
- Optional first-party React panel, provider, hook, composable primitives, and opt-in static CSS
- ESM, CommonJS, and TypeScript declaration entrypoints

The first-party UI never decodes, previews, resizes, recompresses, or strips metadata from the selected original. Any preview is an explicit caller-owned derivative. The optional TIFF subpath probes structural metadata without decoding pixels, and provider SDKs remain caller-owned adapters.

## Package Map

```txt
large-image-ingest
large-image-ingest/core
large-image-ingest/browser
large-image-ingest/conformance
large-image-ingest/provenance
large-image-ingest/preservation
large-image-ingest/profiles
large-image-ingest/transport-tus
large-image-ingest/transport-s3
large-image-ingest/node
large-image-ingest/react
large-image-ingest/react-ui
large-image-ingest/react-ui/styles.css
large-image-ingest/tiff
```

- Use `large-image-ingest/core` for framework-agnostic browser-safe core APIs.
- Use the ESM-only `large-image-ingest/browser` subpath for the packaged Worker checksum executor.
- Use `large-image-ingest/conformance` for the versioned scenario catalog, runner, target types, and untrusted-report validator.
- Use `large-image-ingest/provenance` for durable lifecycle evidence that remains separate from sensitive resume state.
- Use `large-image-ingest/preservation` to map and export one verified ingest as a new BagIt 1.0 package or OCFL 1.1 v1 object.
- Use `large-image-ingest/profiles` for explicitly selected domain baselines, derived organization policies, and safe profile evaluation.
- Use `large-image-ingest/transport-tus` for the raw `fetch` tus transport.
- Use `large-image-ingest/transport-s3` for broker-backed S3 multipart uploads.
- Use `large-image-ingest/node` for server-only NAS gateway, metadata derivative, tile descriptor, and stored-file verification APIs.
- Use `large-image-ingest/react` for optional headless React state and upload controls.
- Use `large-image-ingest/react-ui` for the official ready-made panel or composable inspection UI.
- Import `large-image-ingest/react-ui/styles.css` only when the default theme is wanted.
- Use `large-image-ingest/tiff` for optional bounded TIFF and BigTIFF structural metadata probing.
- Use `large-image-ingest` as a compatibility root for core plus browser-safe transports.

## Browser Checksum And Persistent Identity

Persistent resume records created by 1.5.0 are `large-image-ingest.resume.v0.3`. They bind acknowledged ranges to a whole-file SHA-256 source identity; filename, size, media type, modification time, and metadata remain preliminary filters only. A metadata-equal file with different bytes is rejected before remote recovery or upload work. The identity is reused from the manifest checksum when possible, so the normal checksum-enabled path reads the source once. If manifest checksum output is disabled while a persistent store is configured, the SDK still calculates a separate strong resume identity.

Browser applications can move sustained checksum work off the interactive path:

```ts
import { createBrowserWorkerChecksumExecutor } from "large-image-ingest/browser";
import { createIngestSession } from "large-image-ingest/core";

const checksumExecutor = createBrowserWorkerChecksumExecutor();
const session = createIngestSession(file, {
  checksum: {
    executor: checksumExecutor,
    fallback: "inline"
  },
  resume: { store: resumeStore },
  transport
});
```

Fallback is explicit: omit `fallback` to receive `checksum.execution_failed` when Worker execution cannot start or returns invalid evidence, or choose `"inline"` to retain bounded reads and cancellation on the caller's execution path. Abort signals stop acceptance of canceled results. Progress is monotonic and bounded, and callback failures are isolated through `onObserverError`.

The reader continues to validate v0.1 and v0.2 records. Legacy records with trustworthy manifest whole-file SHA-256 evidence can resume or promote at the next authoritative checkpoint. Weak zero-progress records are restart-only; weak progressed records and progressed v0.1 S3 records are incompatible. They remain stored until explicit cleanup. Never log full records or content identities; use `redactResumeRecord()` and safe UI summaries.

Transport recovery support is conservative. `resumable`, `supportsSnapshotResume`, and `supportsPersistentResume` describe different behaviors. Missing detailed capability flags do not block ordinary upload, but they are not treated as proof that snapshot or durable recovery is safe. Manifest schema remains `large-image-ingest.manifest.v1`; `manifest.library.version` identifies the actual producing package release independently.

## Auditable Provenance

Create an opt-in recorder after the manifest exists and forward the existing event stream. The recorder does not change session authority or persistence when unused.

```ts
import { createIngestProvenanceRecorder } from "large-image-ingest/provenance";

const recorder = createIngestProvenanceRecorder({
  manifest,
  policy: { id: "inspection-default", version: "1.0.0" },
  transport: { category: "s3-multipart", capabilities: transport.capabilities }
});

const session = createIngestSession(file, {
  manifest,
  transport,
  onEvent: (event) => recorder.observeIngestEvent(event)
});
```

After completion, record independent stored verification and call `seal()`. SHA-256 over RFC 8785 canonical JSON detects artifact changes but is not a signature or trusted timestamp. Default summaries omit filenames, checksums, annotation values, manifests, resume state, receipts, URLs, paths, keys, and raw errors. See [Auditable ingest provenance](docs/provenance.md).

## BagIt And OCFL Preservation

The Node-only preservation subpath verifies selected Blob bytes against manifest evidence before it touches an output directory. It assigns source-independent paths, retains original/derivative/provenance relationships in an integrity-protected sidecar, and streams either a new BagIt 1.0 package or a new OCFL 1.1 `v1` object through an incomplete staging directory.

```ts
import {
  evaluatePreservationMapping,
  exportOcflObject
} from "large-image-ingest/preservation";

const mapping = await evaluatePreservationMapping({
  profile: "ocfl-1.1-sha256",
  manifest,
  original: { bytes: originalFile },
  derivatives,
  provenance
});

if (mapping.status !== "blocked") {
  await exportOcflObject(mapping, { destination: "/new/object" });
}
```

The first release creates only new outputs; it does not import, append versions, or manage an OCFL storage root. See [BagIt and OCFL preservation export](docs/preservation.md).

## Domain Validation Profiles

Domain policy is opt-in and never inferred. Load one immutable baseline, evaluate it against the existing manifest and labelled bounded structural evidence, then pass the resulting binding to the session only when it passed.

```ts
import {
  evaluateDomainValidationProfile,
  loadBundledDomainProfile
} from "large-image-ingest/profiles";

const profile = await loadBundledDomainProfile("semiconductor-inspection");
const evaluation = await evaluateDomainValidationProfile({
  profile,
  manifest,
  structuralEvidence
});

if (evaluation.sessionBinding) {
  await createIngestSession(file, {
    manifest,
    domainProfile: evaluation.sessionBinding,
    transport,
    resume: { store: resumeStore }
  }).start();
}
```

Baseline profiles are reference starting points, not compliance or scientific certification. Derived policies require a new identity and explicit categorized exceptions for any relaxation. New resume records retain the exact profile reference and reject policy changes before remote resume. See [Domain validation profiles](docs/domain-profiles.md).

## First-Party React UI

Install React as an optional peer, import the panel, and opt into the static stylesheet. The application still supplies the exact-file controller configuration, transport, resume store, and stored-object verifier.

```tsx
import { InspectionUploadPanel } from "large-image-ingest/react-ui";
import "large-image-ingest/react-ui/styles.css";
import { createIngestController } from "large-image-ingest/react";

<InspectionUploadPanel
  createController={(file) => createIngestController(file, options)}
  recovery={{
    store: resumeStore,
    chunking: options.chunking,
    capabilities: options.transport.capabilities,
    sourceIdentity: options.sourceIdentity
  }}
  verifier={storedObjectVerifier}
  accept=".tif,.tiff,.png,.jpg,.jpeg"
/>
```

The initial public workflow supports one local `File`. It shows controller-authoritative validation, source-identity preparation, acknowledged progress, pause/cancel/recovery, transfer completion, and application-supplied stored-original verification. Full manifests, resume records, URLs, keys, credentials, provider receipts, and customer metadata are not rendered. See the [React UI guide](docs/react-ui.md) and [credential-free reference app](examples/inspection-upload-react/README.md).

For an entirely custom design, use the provider, `useInspectionUploadUi`, and primitives from `react-ui`, or use the lower-level headless `large-image-ingest/react` surface. Uppy remains an optional selection-only recipe for applications already standardized on Uppy.

## React Headless Adapter

Install React alongside the SDK only when the optional React subpath is used.

```bash
npm install large-image-ingest react
```

The adapter provides state and controls without rendering a dropzone, dashboard, buttons, or CSS.

```tsx
import { useState } from "react";
import type { CreateIngestSessionOptions, IngestFileLike } from "large-image-ingest";
import {
  IngestProvider,
  createIngestController,
  useIngestSession,
  useUploadControls,
  useUploadProgress
} from "large-image-ingest/react";

function UploadStatus() {
  const { status, error } = useIngestSession();
  const { progress } = useUploadProgress();
  const { start, pause, cancel, canStart, canPause, canCancel } = useUploadControls();

  return (
    <section>
      <progress value={progress} max={1} />
      <output>{status}</output>
      <button onClick={() => void start()} disabled={!canStart}>Upload</button>
      <button onClick={() => pause()} disabled={!canPause}>Pause</button>
      <button onClick={() => void cancel()} disabled={!canCancel}>Cancel</button>
      {error ? <output>Upload failed</output> : null}
    </section>
  );
}

function UploadPanel({
  file,
  options
}: {
  file: IngestFileLike;
  options: CreateIngestSessionOptions;
}) {
  const [controller] = useState(() => createIngestController(file, options));
  return (
    <IngestProvider controller={controller}>
      <UploadStatus />
    </IngestProvider>
  );
}
```

Keep the controller mounted above route changes when uploads must continue while individual UI components unmount.

The controller preserves the existing `starting` revision and also publishes additive
`preparation` details for `validating`, `preparing_identity`, and
`creating_upload`. Byte progress is reported only when checksum preparation can
measure bounded reads. Preflight policy rejection uses the typed
`validation.failed` code, while application event, snapshot, and observer-error
callbacks remain isolated from ingest control flow.

## Uppy UI-Only Integration

Uppy is an optional compatibility recipe for applications that already use its selection UI. `large-image-ingest` remains the sole owner of validation, checksum, manifest, upload, retry, progress, pause, cancellation, persistent resume, and completion evidence. New applications that want a ready-made experience should start with the first-party UI above.

```bash
npm install large-image-ingest react @uppy/core @uppy/react
```

The supported reference flow accepts one local file, passes the exact browser `File` to one ingest controller, and configures no Uppy uploader plugin or source transform. After reload, the user reselects the original and the SDK validates it against a versioned resume record before continuing.

The [Uppy UI-only guide](docs/integrations/uppy.md) contains the ownership and event mapping. The repository also includes a [runnable React example](examples/uppy-react/README.md) with a credential-free local transfer, pause/reload recovery, cancellation, and final stored-file verification.

```bash
npm run example:uppy:fixture
npm run example:uppy
```

## TIFF And BigTIFF Metadata

Install the optional parser peer only when TIFF metadata probing is needed.

```bash
npm install large-image-ingest geotiff
```

The TIFF subpath validates binary headers, bounds image file directory traversal, and reports structural metadata without decoding raster pixels.

```ts
import {
  probeTiffMetadata,
  toTiffImageMetadata
} from "large-image-ingest/tiff";

const probe = await probeTiffMetadata(file, {
  maxDirectories: 64,
  signal: abortController.signal
});

const primary = probe.directories[0];
console.log(probe.container, probe.directoryCount, primary?.layout);

const image = toTiffImageMetadata(probe);
const session = createIngestSession(file, {
  ...options,
  image
});
```

The probe reports width, height, bit depth, samples, compression, photometric interpretation, orientation, planar configuration, and tile or strip layout when available. GeoTIFF.js documents limited BigTIFF support; unsupported 64-bit offsets or parser-specific BigTIFF structures fail with typed errors. This subpath does not render TIFF, read raster pixels, generate thumbnails, resize images, or create tile pyramids.

## Derivatives

Previews, thumbnails, tile pyramids, metadata extractions, compressed outputs, and custom transformed outputs are modeled as derivatives. They never replace or rewrite the original source artifact.

```ts
import {
  attachDerivative,
  createPreviewDerivative,
  validateManifestDerivatives
} from "large-image-ingest";

const preview = createPreviewDerivative({
  manifest,
  id: "preview-1024",
  kind: "preview",
  status: "created",
  mediaType: "image/jpeg",
  width: 1024,
  height: 1024,
  storage: {
    kind: "object",
    label: "preview-store",
    locationHint: "previews/manifest-id-1024.jpg"
  }
});

const manifestWithPreview = attachDerivative(manifest, preview);
const derivativeValidation = validateManifestDerivatives(manifestWithPreview);
```

See [docs/derivatives.md](docs/derivatives.md) for derivative boundaries and examples.

## Transports And Storage

- tus: resumable browser uploads through `large-image-ingest/transport-tus`
- S3 multipart: broker-backed presigned part upload flow through `large-image-ingest/transport-s3`
- NAS: server-side staging/finalize gateway through `large-image-ingest/node`

The credential-free conformance suite runs the same ten safety scenarios through all three official paths. S3 multipart and NAS pass all ten; tus passes the nine applicable scenarios and explicitly marks optional chunk-integrity evidence unsupported. A positive capability must have passing behavior evidence, and stored completion is checked independently by byte count and whole-file SHA-256. See [Official transport conformance](docs/transport-conformance.md).

The browser core does not write directly to SMB, NFS, NAS, WebDAV, SFTP, or a filesystem. Use a server-side gateway for those targets.

NAS gateway instances that share a staging root coordinate same-session staging, finalization, cancellation, and expired cleanup. Session metadata is promoted atomically from unique same-directory candidates so concurrent or interrupted updates preserve the last committed state without changing the v0.1 session schema.

Persistent resume records created by 1.5.0 use schema `large-image-ingest.resume.v0.3`, bind durable receipts to whole-file content identity, and remain recoverable after a page or process restart without relying on an in-memory snapshot. v0.1/v0.2 records remain readable when their whole-file and transport evidence is trustworthy; progressed S3 v0.1 records are rejected because their ETags cannot be reconstructed safely.

Full resume records can contain source digests, upload identifiers, tus upload URLs, customer metadata, object keys, and provider receipt evidence. Store them according to application security policy and use the diagnostic redaction helpers for logs and support output.

Starting in 1.3.0, successful transport completion remains authoritative even when local resume-record cleanup fails. The session still resolves with a completed snapshot and emits a non-fatal `resume:cleanup-failed` event so applications can inspect or remove stale local state without retrying remote completion.

Event and snapshot observers are isolated from upload control flow. Use `onObserverError` when UI or telemetry callback failures need separate reporting; exceptions from observers or from the reporter itself never change session state.

```ts
const session = createIngestSession(file, {
  ...options,
  onEvent(event) {
    if (event.type === "resume:cleanup-failed") {
      reportLocalCleanupWarning(createSafeEventSummary(event));
    }
  },
  onObserverError({ observer, eventType, error }) {
    reportUiObserverFailure({ observer, eventType, error });
  }
});
```

Server-owned credential, object key, NAS path, cleanup, and final verification responsibilities are documented in [docs/server-operational-guide.md](docs/server-operational-guide.md).

## Documentation

- [Quickstart and API examples](docs/quickstart.md)
- [Derivative and preview foundations](docs/derivatives.md)
- [Reference integration and benchmarks](docs/benchmarks.md)
- [Comparative adoption evidence](docs/adoption-evidence.md)
- [Official transport conformance](docs/transport-conformance.md)
- [Auditable ingest provenance](docs/provenance.md)
- [Opt-in integration test policy](docs/integration-tests.md)
- [Server operational guide](docs/server-operational-guide.md)
- [First-party React UI](docs/react-ui.md)
- [Uppy UI-only integration](docs/integrations/uppy.md)
- [Uppy friction and adapter decision](docs/integrations/uppy-friction.md)
- [tus-js-client transport review brief](docs/integrations/tus-js-client-review.md)
- [Roadmap](docs/roadmap.md)
- [Changelog](CHANGELOG.md)

## Verification

```bash
npm ci
npm run typecheck
npm run typecheck:examples
npm run typecheck:uppy-example
npm run typecheck:inspection-ui-example
npm test
npm run test:ui
npm run build
npm run test:conformance
npm run test:reference
npm run test:browser-checksum
npm run test:adoption-evidence
npm run test:integration
npm pack --dry-run
```

Default verification is local and credential-free. The conformance gate executes isolated S3 multipart, tus, and NAS representative targets; the reference gate performs a 64 MiB HTTP interruption-and-resume scenario with stored-file verification. Real tus servers, S3-compatible buckets, and mounted NAS paths require `LII_CONFORMANCE_OPT_IN=1` plus an operator-owned conformance driver.

## Design Principles

1. Preserve the original file by default.
2. Treat resize, compression, EXIF stripping, previews, thumbnails, and tiles as derivatives.
3. Use chunked upload flows for large files.
4. Generate a manifest before upload starts.
5. Make upload state observable and recoverable.
6. Keep the core framework-agnostic.
7. Use adapters for upload transports and storage targets.
8. Keep runtime dependencies small.
