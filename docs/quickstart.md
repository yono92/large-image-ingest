# Quickstart And API Examples

This guide keeps the npm README short while preserving the common usage examples for `large-image-ingest`.

## Imports

ESM:

```js
import { createIngestSession } from "large-image-ingest";
```

CommonJS:

```js
const { createIngestSession } = require("large-image-ingest");
```

Core-only imports:

```ts
import {
  createIngestSession,
  createManifest,
  verifyIngestIntegrity
} from "large-image-ingest/core";
```

## Manifest Creation

```ts
import { createManifest } from "large-image-ingest";

const manifest = await createManifest(file, {
  chunking: { chunkSize: 64 * 1024 * 1024 },
  metadata: {
    lotId: "LOT-2026-001",
    waferId: "W12"
  },
  storage: {
    kind: "nas",
    label: "fab-qc-nas",
    locationHint: "/inspection/inbox"
  }
});
```

Manifest creation preserves the original and records validation, checksum, chunking, storage hints, metadata, and derivative references.

## Validation

```ts
import { validateFile } from "large-image-ingest";

const result = validateFile(
  file,
  {
    acceptedExtensions: ["tif", "tiff"],
    acceptedMimeTypes: ["image/tiff"],
    maxBytes: 10 * 1024 * 1024 * 1024,
    minWidth: 1024,
    minHeight: 1024,
    requiredMetadata: ["lotId", "waferId"]
  },
  {
    lotId: "LOT-2026-001",
    waferId: "W12"
  },
  {
    width: 4096,
    height: 4096
  }
);
```

Dimension validation uses caller-provided image metadata. The core does not decode TIFF, microscopy, satellite, DICOM, OME-TIFF, or proprietary inspection formats.

## Checksum

```ts
import { calculateChecksum } from "large-image-ingest";

const checksum = await calculateChecksum(file, {
  chunkSize: 4 * 1024 * 1024,
  onProgress(progress) {
    console.log(progress.loadedBytes, progress.totalBytes);
  }
});
```

For specialized non-resumable workflows where checksum calculation is handled elsewhere, pass `checksum: false` to `createManifest()` or `createIngestSession()`. Persistent resume requires the SDK's trustworthy whole-file checksum and rejects `checksum: false` with `resume.content_identity_missing` before creating a remote session.

### Worker checksum execution

For huge browser sources, inject a Worker-compatible executor. The SDK ships the protocol and runtime installer, while the application owns the module Worker URL and CSP/bundler setup:

```ts
const executor = createWorkerChecksumExecutor({
  workerFactory: () => new Worker(
    new URL("./worker-checksum-runtime.js", import.meta.url),
    { type: "module" }
  )
});

const checksum = await calculateChecksum(file, {
  executor,
  signal: abortController.signal,
  onProgress: updateChecksumProgress
});
```

The worker receives the Blob/File handle and performs the same bounded slicing. Abort terminates that worker and suppresses late progress/results. See `examples/worker-checksum-runtime.ts` for `installChecksumWorkerRuntime(self)`.

## Persistent Resume

Transient retry and persistent resume are separate behaviors:

- Retry happens inside one running session.
- Persistent resume stores a versioned resume record so a later session can recover after a refresh, crash, or process restart.

```ts
import {
  WebStorageResumeStore,
  classifyResumeRecordForFile,
  createIngestSession,
  listRecoverableResumeRecords
} from "large-image-ingest";

const resumeStore = new WebStorageResumeStore(localStorage);

const session = createIngestSession(file, {
  chunking: { chunkSize: 64 * 1024 * 1024 },
  resume: { store: resumeStore },
  transport,
  onEvent(event) {
    if (event.type === "resume:checkpoint") {
      // Persisted after an acknowledged chunk.
    }
  }
});

await session.start();

const records = listRecoverableResumeRecords(await resumeStore.list());
const record = records[0];

if (record && (await classifyResumeRecordForFile(record, file)) === "compatible") {
  const resumed = createIngestSession(file, {
    resume: { store: resumeStore },
    transport
  });
  await resumed.resume(record.id);
}
```

Browser resume still requires the application to ask the user for the same original file again. New 1.4.0 records use `large-image-ingest.resume.v0.3` and bind every checkpoint to the original whole-file SHA-256 identity. The SDK recalculates the selected file's checksum before calling the transport's remote resume method. A metadata match with different bytes fails as `resume.content_mismatch`; a missing trustworthy identity fails as `resume.content_identity_missing`. Neither error includes checksum values.

The SDK stores upload metadata, chunk checkpoints, manifest identity, and transport resume handles; it does not store original image bytes. Records created by 1.2.0 use `large-image-ingest.resume.v0.2`. They remain safely resumable only when the embedded manifest contains a trustworthy whole-file checksum. Each acknowledged chunk stores its validated receipt together with derived progress, so a new S3 multipart session object can restore the original part numbers and ETags after all in-memory state is gone.

## React Headless State

The optional `large-image-ingest/react` subpath maps one core session to immutable React state. Create one controller per selected file and retain it above any components that may mount or unmount during upload.

The adapter exposes:

- `IngestProvider` for context composition
- `useIngestSession` for lifecycle, manifest, error, and recovery state
- `useUploadProgress` for normalized and byte progress
- `useUploadControls` for start, resume, pause, and cancel actions

It intentionally provides no visible upload UI or CSS. Application components remain responsible for file selection, layout, labels, accessibility, and design-system controls.

## TIFF And BigTIFF Metadata Probe

Install `geotiff` beside the SDK and import `probeTiffMetadata` from `large-image-ingest/tiff`. The probe reads the binary header and bounded image file directory metadata through Blob ranges.

Use `toTiffImageMetadata` to map one directory to the existing `image` option. Directory count, samples, compression, orientation, and tile or strip layout remain in the probe result for application UI and later derivative planning.

The probe does not decode raster pixels or generate display assets. BigTIFF identification is complete, but parsing support remains limited by GeoTIFF.js and unsafe 64-bit offsets are rejected.

The reader also recognizes legacy `large-image-ingest.resume.v0.1` records. tus and zero-progress S3 records can continue after remote validation. A progressed S3 v0.1 record fails with `resume.receipt_missing` because inventing or reconstructing authoritative ETags would be unsafe.

`WebStorageResumeStore` validates stored JSON on read, list, and write. Custom stores are validated again by `resume(recordId)` before range hydration or transport calls. Invalid or unsafe records fail with typed `resume.record_invalid`, `resume.receipt_invalid`, `resume.schema_unsupported`, `resume.content_identity_missing`, or `resume.content_mismatch` conflicts without including raw record contents or checksum values in default events.

Full resume records are sensitive persistence objects. They may contain customer metadata, remote upload IDs, tus upload URLs, object keys, ETags, locations, or opaque provider evidence. Do not log them directly; use `redactResumeRecord()` or `createSafeEventSummary()`.

### Legacy resume migration

v0.1 and v0.2 records remain parseable. A legacy record can resume only when its embedded manifest has a valid whole-file SHA-256 checksum and its transport state contains the receipts required by that adapter. Do not rewrite an unsafe legacy record into v0.3 or fabricate `contentIdentity`; restart the upload from byte zero so the SDK can create new trustworthy state.

## Completion Evidence

The manifest describes source intent before upload and therefore keeps `upload.status: "pending"`. Successful transport completion creates a separate immutable evidence record:

```ts
await session.start();

const evidence = session.getCompletionEvidence();
if (!evidence) throw new Error("Upload did not complete.");

if (evidence.status === "verified") {
  await promoteInspectionOriginal(evidence);
} else {
  await queueStoredObjectVerification(evidence.manifest.id);
}
```

A custom transport that returns `void` from `completeSession()` remains valid and produces `completed-unverified`. To produce verified evidence, return normalized whole stored-object facts:

```ts
async completeSession({ manifest, uploadId, receipts }) {
  const result = await broker.completeAndVerify({ manifest, uploadId, receipts });
  return {
    completedAt: result.completedAt,
    storage: { kind: "s3", label: "inspection-originals" },
    storedObject: {
      sizeBytes: result.sizeBytes,
      checksum: { algorithm: "sha256", value: result.sha256 }
    }
  };
}
```

Core rejects same-algorithm checksum or stored-size conflicts with `completion.integrity_mismatch` and exposes no successful evidence. Use `createSafeCompletionSummary()` for logs; full evidence can contain checksum and storage values.

## Verification

Use core verification when you need to check a manifest, file-like object, and upload receipts before promoting an upload in application state.

```ts
import { verifyIngestIntegrity } from "large-image-ingest/core";

const report = await verifyIngestIntegrity({
  manifest,
  file,
  receipts
});

if (!report.ok) {
  console.log(report.issues.map((issue) => issue.code));
}
```

Use Node verification after a server-side publish or NAS finalize step to compare the stored file against the manifest without loading the whole file into memory.

```ts
import { verifyNodeFileManifest } from "large-image-ingest/node";

const report = await verifyNodeFileManifest(
  "/mnt/inspection-originals/fab-a/lot-001/wafer-12/original.tif",
  manifest
);
```

## Safe Diagnostics

```ts
import {
  createSafeEventSummary,
  redactResumeRecord,
  redactUploadSessionSnapshot
} from "large-image-ingest/core";

const session = createIngestSession(file, {
  transport,
  onEvent(event) {
    void writeLog(createSafeEventSummary(event));
  },
  onSnapshot(snapshot) {
    const { snapshot: safeSnapshot } = redactUploadSessionSnapshot(snapshot);
    void updateSupportPanel(safeSnapshot.status, safeSnapshot.uploadedBytes);
  }
});

const safeRecord = redactResumeRecord(record);
```

Diagnostics helpers keep public IDs, status, progress, typed codes, and retryability while omitting full manifests, customer metadata, resume tokens, presigned URLs, opaque transport payloads, and sensitive resume state.

## Retry Policy

```ts
const session = createIngestSession(file, {
  transport,
  retryPolicy: {
    maxAttempts: 4,
    delayMs: 250,
    backoffFactor: 2,
    maxDelayMs: 5_000,
    jitter: "full"
  }
});
```

`maxAttempts` is the total number of attempts for a chunk operation. Pause, cancel, aborted signals, validation failures, checksum mismatches, resume conflicts, remote offset mismatches, expired resume state, and non-retryable transport errors bypass retry.

## Bounded Parallel Chunks

```ts
const session = createIngestSession(file, {
  execution: { maxParallelChunks: 4 },
  transport: parallelCapableTransport
});
```

The default is one. Values above one require `transport.capabilities.supportsParallelChunks === true`; otherwise the session fails before remote creation with `execution.parallel_unsupported`. Limits outside 1..32 fail as `execution.invalid_concurrency`. Successful siblings from a failed batch are validated and checkpointed in index order before the failure is reported, so exact-source resume does not retransmit them.

## Multi-File Queue Orchestration

```ts
import { createIngestQueue, WebStorageQueueStore } from "large-image-ingest/core";

const queue = createIngestQueue({
  maxActiveItems: 2,
  maxActiveBytes: 8 * 1024 ** 3,
  maxQueuedItems: 1_000,
  store: new WebStorageQueueStore(localStorage),
  createSessionOptions({ itemId }) {
    return {
      checksum: { required: true },
      resume: { store: resumeStore },
      transport: createTransportForItem(itemId)
    };
  },
  resolveSource(identity, itemId) {
    return sourcePicker.resolve(identity, itemId);
  }
});

await queue.restore();
await queue.enqueue(firstFile, { id: "inspection-001" });
await queue.enqueue(secondFile, { id: "inspection-002" });
const finalSnapshot = await queue.start();
```

FIFO admission never bypasses a head item blocked by the byte budget. A single source larger than the budget may run only when no other item is active, preventing deadlock. `maxQueuedItems` counts completed and canceled records until they are explicitly removed.

Queue records do not serialize files, transports, secrets, manifests, receipts, or raw errors. After restart, unresolved work remains `needs-source`; `attachSource()` performs a metadata precheck and underlying v0.3 session resume verifies exact SHA-256 content before transport access.

Use `createSafeQueueEventSummary()`, `createSafeQueueSnapshotSummary()`, and `redactIngestQueueRecord()` for operational output.

## Inspection Policy And Evidence Export

```ts
import {
  EVIDENCE_GRADE_INSPECTION_POLICY_V1,
  createEvidenceBundle,
  createSafeInspectionPolicySummary,
  evaluateInspectionPolicy,
  signEvidenceBundle
} from "large-image-ingest/core";

const policyReport = evaluateInspectionPolicy({
  manifest,
  completion: session.getCompletionEvidence(),
  policy: EVIDENCE_GRADE_INSPECTION_POLICY_V1
});

if (!policyReport.ok) {
  reportPolicyFailure(createSafeInspectionPolicySummary(policyReport));
}

const bundle = createEvidenceBundle({ manifest, completion, policyReport });
const envelope = await signEvidenceBundle(bundle, applicationOwnedSigner);
```

Profiles validate scalar metadata fields without echoing rejected values. Policies evaluate manifest and completion facts but do not decide application quarantine/release workflow. Canonical bundle bytes are stable across object key insertion order; array order remains significant.

`signEvidenceBundle()` does not manage keys or choose a trust policy. `verifySignedEvidenceEnvelope()` validates the bundle and SHA-256 digest before invoking the supplied verifier. A result is `trusted` only when both digest and callback verification pass.

## Transport Examples

Focused examples live in the repository:

- `examples/custom-transport.ts`: custom application upload API.
- `examples/tus-transport.ts`: browser upload through a tus endpoint.
- `examples/s3-multipart.ts`: browser upload through a broker-backed S3 multipart flow.
- `examples/nas-gateway-route.ts`: server-side NAS staging and finalize route shape.
- `examples/multi-file-queue.ts`: bounded durable multi-file orchestration.
- `examples/inspection-policy.ts`: custom versioned profile and policy pack.
- `examples/evidence-signing.ts`: application-owned WebCrypto sign/verify boundary.
