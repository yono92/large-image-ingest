# Quickstart: Production Orchestration

```ts
import { createIngestQueue, WebStorageQueueStore } from "large-image-ingest/core";
import { createS3MultipartTransport } from "large-image-ingest/transport-s3";

const queue = createIngestQueue({
  maxActiveItems: 2,
  maxActiveBytes: 8 * 1024 ** 3,
  store: new WebStorageQueueStore(localStorage),
  createSessionOptions({ itemId }) {
    return {
      transport: createS3MultipartTransport(createS3Callbacks(itemId)),
      resume: { store: resumeStore },
      checksum: { required: true }
    };
  },
  async resolveSource(identity, itemId) {
    return askApplicationForExactFile(identity, itemId);
  }
});

await queue.restore();
await queue.enqueue(fileA);
await queue.enqueue(fileB);
await queue.start();
```

The queue store contains operational intent, not source bytes or transport credentials. After restart, unresolved items stay `needs-source` until the application supplies a candidate. Metadata is checked first; session resume then verifies exact source content.

`maxActiveBytes` limits admitted source sizes, not exact JavaScript heap usage. If each session also uses `execution.maxParallelChunks`, total active network requests can approach active items multiplied by per-session parallel chunks.
