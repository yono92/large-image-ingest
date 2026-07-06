# Contracts: Node Verification & Integrity

## Core Exports

```ts
import {
  verifyIngestIntegrity,
  verifyManifest,
  verifyUploadReceipts
} from "large-image-ingest/core";
```

Expected behavior:

- `verifyManifest(manifest)` validates manifest structure and internal consistency.
- `verifyManifest(manifest, { file, checksum: "when-present" })` also verifies file identity and checksum when the manifest includes one.
- `verifyUploadReceipts(manifest, receipts)` requires a complete receipt set.
- `verifyUploadReceipts(manifest, receipts, { allowPartial: true })` validates only the provided receipts.
- `verifyIngestIntegrity({ manifest, file, receipts })` combines manifest, file-like checksum, and receipt verification into one report.

## Node Exports

```ts
import {
  calculateNodeFileChecksum,
  verifyNodeFileManifest
} from "large-image-ingest/node";
```

Expected behavior:

- `calculateNodeFileChecksum(path)` returns a SHA-256 whole-file checksum using streaming reads.
- `verifyNodeFileManifest(path, manifest)` checks that the stored file exists, is a file, matches `manifest.original.sizeBytes`, and matches `manifest.original.checksum` when present.

## Report Shape

```ts
{
  ok: boolean;
  issues: Array<{
    code: string;
    message: string;
    severity: "error" | "warning";
    path?: string;
    details?: Record<string, unknown>;
  }>;
}
```

Reports must not include presigned URLs, credentials, raw customer metadata, or full manifest objects in `details`.
