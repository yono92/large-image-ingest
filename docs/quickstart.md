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

For specialized workflows where checksum calculation is handled elsewhere, pass `checksum: false` to `createManifest()` or `createIngestSession()`.

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

Browser resume still requires the application to ask the user for the same original file again. The SDK stores upload metadata, chunk checkpoints, manifest identity, and transport resume handles; it does not store original image bytes.

Records created by 1.2.0 use `large-image-ingest.resume.v0.2`. Each acknowledged chunk stores its validated receipt together with derived progress, so a new S3 multipart session object can restore the original part numbers and ETags after all in-memory state is gone.

The reader also recognizes legacy `large-image-ingest.resume.v0.1` records. tus and zero-progress S3 records can continue after remote validation. A progressed S3 v0.1 record fails with `resume.receipt_missing` because inventing or reconstructing authoritative ETags would be unsafe.

`WebStorageResumeStore` validates stored JSON on read, list, and write. Custom stores are validated again by `resume(recordId)` before range hydration or transport calls. Invalid records fail with typed `resume.record_invalid`, `resume.receipt_invalid`, or `resume.schema_unsupported` conflicts without including raw record contents in default events.

Full resume records are sensitive persistence objects. They may contain customer metadata, remote upload IDs, tus upload URLs, object keys, ETags, locations, or opaque provider evidence. Do not log them directly; use `redactResumeRecord()` or `createSafeEventSummary()`.

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

## Transport Examples

Focused examples live in the repository:

- `examples/custom-transport.ts`: custom application upload API.
- `examples/tus-transport.ts`: browser upload through a tus endpoint.
- `examples/s3-multipart.ts`: browser upload through a broker-backed S3 multipart flow.
- `examples/nas-gateway-route.ts`: server-side NAS staging and finalize route shape.
