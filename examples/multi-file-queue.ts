import {
  WebStorageQueueStore,
  createIngestQueue,
  type IngestFileLike,
  type IngestQueueSourceIdentity,
  type ResumeStore
} from "large-image-ingest/core";
import {
  createS3MultipartTransport,
  type S3MultipartBroker
} from "large-image-ingest/transport-s3";

export function createInspectionQueue(options: {
  brokerForItem(itemId: string): S3MultipartBroker;
  resumeStore: ResumeStore;
  resolveSource(
    identity: IngestQueueSourceIdentity,
    itemId: string
  ): Promise<IngestFileLike | undefined>;
}) {
  return createIngestQueue({
    maxActiveItems: 2,
    maxActiveBytes: 8 * 1024 ** 3,
    store: new WebStorageQueueStore(localStorage),
    resolveSource: options.resolveSource,
    createSessionOptions({ itemId }) {
      return {
        checksum: { required: true },
        chunking: { chunkSize: 64 * 1024 ** 2 },
        resume: { store: options.resumeStore },
        transport: createS3MultipartTransport({
          broker: options.brokerForItem(itemId)
        })
      };
    }
  });
}
