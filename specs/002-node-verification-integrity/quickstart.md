# Quickstart: Node Verification & Integrity

## Verify a Manifest and Receipts

```ts
import { verifyIngestIntegrity } from "large-image-ingest/core";

const report = await verifyIngestIntegrity({
  manifest,
  receipts
});

if (!report.ok) {
  console.error(report.issues.map((issue) => issue.code));
}
```

Expected outcome:

- `report.ok` is true when the manifest is internally consistent and every expected chunk has one valid receipt.
- Missing, duplicate, wrong-size, or wrong-transport receipts produce typed `verification.*` issues.

## Verify a Stored NAS File

```ts
import { verifyNodeFileManifest } from "large-image-ingest/node";

const report = await verifyNodeFileManifest(finalizedPath, manifest);

if (!report.ok) {
  throw new Error(`Upload verification failed: ${report.issues[0]?.code}`);
}
```

Expected outcome:

- The helper reads the stored file without mutating it.
- Size is checked before checksum.
- Whole-file SHA-256 checksum is streamed when the manifest includes a checksum.

## Local Validation

```bash
npm run typecheck
npm run typecheck:examples
npm test
npm run build
```
