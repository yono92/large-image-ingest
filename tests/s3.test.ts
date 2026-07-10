import { describe, expect, it } from "vitest";
import { createManifest } from "../src/manifest";
import {
  createResumeChunkingIdentity,
  createResumeFileIdentity,
  createResumeRecord
} from "../src/resume";
import { createIngestSession } from "../src/session";
import { createS3MultipartTransport } from "../src/s3";
import type {
  S3CompletedPart,
  S3MultipartBroker,
  S3MultipartFetch,
  S3MultipartPartContext,
  UploadChunkReceipt,
  UploadSessionSnapshot
} from "../src";
import { MemoryResumeStore, toLegacyResumeRecord } from "./resume-fixtures";

const MiB = 1024 * 1024;
const chunkSize = 5 * MiB;
const objectSize = 11 * MiB;

interface S3Request {
  bodySize: number;
  headers: Headers;
  input: string;
  method: string;
}

interface FakeS3FetchOptions {
  failPartNumbers?: readonly number[];
  missingEtag?: boolean;
  onUploadPart?: (partNumber: number) => void;
}

describe("createS3MultipartTransport", () => {
  it("advertises snapshot and persistent resume separately", () => {
    const transport = createS3MultipartTransport({
      broker: createFakeBroker(),
      fetch: createFakeS3Fetch().fetch
    });

    expect(transport.capabilities).toMatchObject({
      resumable: true,
      supportsSnapshotResume: true,
      supportsPersistentResume: true
    });
  });

  it("uploads multipart chunks with presigned part URLs and completes with ordered ETag receipts", async () => {
    const fetch = createFakeS3Fetch();
    const partContexts: S3MultipartPartContext[] = [];
    const completedParts: S3CompletedPart[][] = [];
    const snapshots: UploadSessionSnapshot[] = [];
    const broker = createFakeBroker({
      onPart(context) {
        partContexts.push(context);
      },
      onComplete(parts) {
        completedParts.push([...parts]);
      }
    });
    const file = createLargeFile(objectSize);

    const session = createIngestSession(file, {
      chunking: { chunkSize },
      onSnapshot(snapshot) {
        snapshots.push(snapshot);
      },
      transport: createS3MultipartTransport({
        broker,
        fetch: fetch.fetch
      })
    });

    await session.start();

    expect(partContexts.map((context) => context.partNumber)).toEqual([1, 2, 3]);
    expect(fetch.requests.map((request) => request.method)).toEqual(["PUT", "PUT", "PUT"]);
    expect(fetch.requests.map((request) => request.bodySize)).toEqual([
      chunkSize,
      chunkSize,
      objectSize - chunkSize * 2
    ]);
    expect(completedParts).toHaveLength(1);
    expect(completedParts[0]).toEqual([
      {
        partNumber: 1,
        etag: "\"etag-1\"",
        checksum: {
          algorithm: "crc32c",
          value: "checksum-1"
        }
      },
      {
        partNumber: 2,
        etag: "\"etag-2\"",
        checksum: {
          algorithm: "crc32c",
          value: "checksum-2"
        }
      },
      {
        partNumber: 3,
        etag: "\"etag-3\"",
        checksum: {
          algorithm: "crc32c",
          value: "checksum-3"
        }
      }
    ]);
    expect(snapshots.at(-1)?.completedChunks.map((receipt) => receipt.transport.etag)).toEqual([
      "\"etag-1\"",
      "\"etag-2\"",
      "\"etag-3\""
    ]);
  });

  it("rejects non-final chunks smaller than the S3 multipart minimum before creating upload", async () => {
    const fetch = createFakeS3Fetch();
    let createCalls = 0;
    const broker = createFakeBroker({
      onCreate() {
        createCalls += 1;
      }
    });

    await expect(
      createIngestSession(createLargeFile(6 * MiB), {
        chunking: { chunkSize: 3 * MiB },
        transport: createS3MultipartTransport({
          broker,
          fetch: fetch.fetch
        })
      }).start()
    ).rejects.toMatchObject({
      code: "chunk.invalid_size",
      retryable: false
    });
    expect(createCalls).toBe(0);
    expect(fetch.requests).toHaveLength(0);
  });

  it("resumes using stored multipart session state and completed receipts", async () => {
    const fetch = createFakeS3Fetch();
    const completedParts: S3CompletedPart[][] = [];
    const partNumbers: number[] = [];
    const file = createLargeFile(objectSize);
    const manifest = await createManifest(file, {
      chunking: { chunkSize }
    });
    const broker = createFakeBroker({
      onCreate() {
        throw new Error("createMultipartUpload should not run while resuming.");
      },
      onPart(context) {
        partNumbers.push(context.partNumber);
      },
      onComplete(parts) {
        completedParts.push([...parts]);
      }
    });

    await createIngestSession(file, {
      chunking: { chunkSize },
      manifest,
      resumeFrom: {
        manifestId: manifest.id,
        status: "paused",
        transportSession: {
          uploadId: "s3-upload-resume",
          transportName: "s3-multipart",
          createdAt: "2026-01-01T00:00:00.000Z",
          remote: {
            bucket: "inspection-bucket",
            key: "trusted/wafer.tif"
          }
        },
        chunkPlan: {
          chunkSize,
          totalBytes: file.size,
          totalChunks: 3,
          chunks: [
            { index: 0, start: 0, end: chunkSize, size: chunkSize },
            { index: 1, start: chunkSize, end: chunkSize * 2, size: chunkSize },
            { index: 2, start: chunkSize * 2, end: file.size, size: file.size - chunkSize * 2 }
          ]
        },
        completedChunks: [
          {
            chunkIndex: 0,
            sizeBytes: chunkSize,
            completedAt: "2026-01-01T00:00:00.000Z",
            transport: {
              name: "s3-multipart",
              partNumber: 1,
              etag: "\"etag-1\""
            }
          }
        ],
        uploadedBytes: chunkSize,
        totalBytes: file.size,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      transport: createS3MultipartTransport({
        broker,
        fetch: fetch.fetch
      })
    }).start();

    expect(partNumbers).toEqual([2, 3]);
    expect(completedParts[0].map((part) => part.partNumber)).toEqual([1, 2, 3]);
  });

  it("resumes a persisted multipart upload after in-memory state is discarded", async () => {
    const file = createLargeFile(objectSize);
    const store = new MemoryResumeStore();
    const firstFetch = createFakeS3Fetch({ failPartNumbers: [2] });

    await expect(
      createIngestSession(file, {
        chunking: { chunkSize },
        retries: 0,
        resume: { store },
        transport: createS3MultipartTransport({
          broker: createFakeBroker(),
          fetch: firstFetch.fetch
        })
      }).start()
    ).rejects.toMatchObject({ code: "transport.part_rejected" });

    const [record] = await store.list();
    expect(record).toMatchObject({
      schemaVersion: "large-image-ingest.resume.v0.2",
      receipts: [{
        chunkIndex: 0,
        transport: { partNumber: 1, etag: "\"etag-1\"" }
      }]
    });

    const resumedParts: number[] = [];
    const completedParts: S3CompletedPart[][] = [];
    const resumeFetch = createFakeS3Fetch();
    const resumeBroker = createFakeBroker({
      onCreate() {
        throw new Error("createMultipartUpload should not run while resuming.");
      },
      onPart(context) {
        resumedParts.push(context.partNumber);
      },
      onComplete(parts) {
        completedParts.push([...parts]);
      }
    });

    if (!record) {
      throw new Error("Expected a persisted resume record.");
    }

    await createIngestSession(file, {
      chunking: { chunkSize },
      resume: { store },
      transport: createS3MultipartTransport({ broker: resumeBroker, fetch: resumeFetch.fetch })
    }).resume(record.id);

    expect(resumedParts).toEqual([2, 3]);
    expect(completedParts[0]?.map((part) => part.partNumber)).toEqual([1, 2, 3]);
    expect(completedParts[0]?.map((part) => part.etag)).toEqual([
      "\"etag-1\"",
      "\"etag-2\"",
      "\"etag-3\""
    ]);
  });

  it("rejects progressed legacy S3 records without fabricating ETags", async () => {
    const file = createLargeFile(objectSize);
    const manifest = await createManifest(file, { chunking: { chunkSize } });
    const current = createResumeRecord({
      manifest,
      file: await createResumeFileIdentity(file),
      chunking: createResumeChunkingIdentity(file.size, { chunkSize }),
      transport: {
        name: "s3-multipart",
        uploadId: "legacy-upload",
        data: { bucket: "inspection-bucket", key: "trusted/legacy.tif" }
      }
    });
    current.progress = {
      ...current.progress,
      uploadedBytes: chunkSize,
      completedChunkRanges: [{ startIndex: 0, endIndexInclusive: 0 }],
      nextChunkIndex: 1
    };
    const legacy = toLegacyResumeRecord(current);
    const store = new MemoryResumeStore();
    await store.put(legacy);
    const fetch = createFakeS3Fetch();

    await expect(
      createIngestSession(file, {
        chunking: { chunkSize },
        resume: { store },
        transport: createS3MultipartTransport({ broker: createFakeBroker(), fetch: fetch.fetch })
      }).resume(legacy.id)
    ).rejects.toMatchObject({ code: "resume.receipt_missing" });

    expect(fetch.requests).toHaveLength(0);
  });

  it("allows zero-progress legacy S3 records to resume safely", async () => {
    const file = createLargeFile(chunkSize);
    const manifest = await createManifest(file, { chunking: { chunkSize } });
    const current = createResumeRecord({
      manifest,
      file: await createResumeFileIdentity(file),
      chunking: createResumeChunkingIdentity(file.size, { chunkSize }),
      transport: {
        name: "s3-multipart",
        uploadId: "legacy-empty-upload",
        data: { bucket: "inspection-bucket", key: "trusted/legacy-empty.tif" }
      }
    });
    const legacy = toLegacyResumeRecord(current);
    const store = new MemoryResumeStore();
    await store.put(legacy);
    const completed: S3CompletedPart[][] = [];

    await createIngestSession(file, {
      chunking: { chunkSize },
      resume: { store },
      transport: createS3MultipartTransport({
        broker: createFakeBroker({
          onCreate() {
            throw new Error("createMultipartUpload should not run while resuming.");
          },
          onComplete(parts) {
            completed.push([...parts]);
          }
        }),
        fetch: createFakeS3Fetch().fetch
      })
    }).resume(legacy.id);

    expect(completed[0]?.map((part) => part.partNumber)).toEqual([1]);
  });

  it("aborts multipart upload through the broker when canceled", async () => {
    const file = createLargeFile(objectSize);
    let session: ReturnType<typeof createIngestSession> | undefined;
    let abortedReceipts: readonly UploadChunkReceipt[] | undefined;
    const fetch = createFakeS3Fetch({
      onUploadPart(partNumber) {
        if (partNumber === 1) {
          session?.cancel("User canceled upload.");
        }
      }
    });
    const broker = createFakeBroker({
      onAbort(receipts) {
        abortedReceipts = receipts;
      }
    });

    session = createIngestSession(file, {
      chunking: { chunkSize },
      transport: createS3MultipartTransport({
        broker,
        fetch: fetch.fetch
      })
    });

    await expect(session.start()).rejects.toMatchObject({
      code: "transport.canceled",
      retryable: false
    });
    expect(abortedReceipts?.map((receipt) => receipt.transport.partNumber)).toEqual([1]);
  });

  it("rejects part uploads that do not expose ETag", async () => {
    const fetch = createFakeS3Fetch({
      missingEtag: true
    });

    await expect(
      createIngestSession(createLargeFile(chunkSize), {
        chunking: { chunkSize },
        transport: createS3MultipartTransport({
          broker: createFakeBroker(),
          fetch: fetch.fetch
        })
      }).start()
    ).rejects.toMatchObject({
      code: "transport.receipt_missing",
      retryable: false
    });
  });
});

function createFakeBroker(options: {
  onAbort?: (receipts: readonly UploadChunkReceipt[]) => void;
  onComplete?: (parts: readonly S3CompletedPart[]) => void;
  onCreate?: () => void;
  onPart?: (context: S3MultipartPartContext) => void;
} = {}): S3MultipartBroker {
  return {
    async createMultipartUpload() {
      options.onCreate?.();
      return {
        uploadId: "s3-upload-1",
        bucket: "inspection-bucket",
        key: "trusted/wafer.tif",
        createdAt: "2026-01-01T00:00:00.000Z"
      };
    },
    async getUploadPartUrl(context) {
      options.onPart?.(context);
      return {
        url: `https://s3.example/upload-part/${context.partNumber}`,
        headers: {
          "x-presigned-header": `part-${context.partNumber}`
        }
      };
    },
    async completeMultipartUpload({ parts }) {
      options.onComplete?.(parts);
    },
    async abortMultipartUpload({ receipts }) {
      options.onAbort?.(receipts);
    }
  };
}

function createFakeS3Fetch(options: FakeS3FetchOptions = {}): {
  fetch: S3MultipartFetch;
  requests: S3Request[];
} {
  const requests: S3Request[] = [];

  return {
    requests,
    fetch: async (input, init): Promise<Response> => {
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      const partNumber = Number(input.slice(input.lastIndexOf("/") + 1));
      const bodySize = bodyByteLength(init?.body);

      requests.push({
        bodySize,
        headers,
        input,
        method
      });

      expect(method).toBe("PUT");
      expect(headers.get("x-presigned-header")).toBe(`part-${partNumber}`);
      options.onUploadPart?.(partNumber);

      if (options.failPartNumbers?.includes(partNumber)) {
        return new Response(null, { status: 503 });
      }

      return new Response(null, {
        status: 200,
        headers: options.missingEtag
          ? {}
          : {
              ETag: `"etag-${partNumber}"`,
              "x-amz-checksum-crc32c": `checksum-${partNumber}`
            }
      });
    }
  };
}

function createLargeFile(size: number): File {
  return new File([new Uint8Array(size)], "wafer.tif", {
    type: "image/tiff"
  });
}

function bodyByteLength(body: BodyInit | null | undefined): number {
  if (!body) {
    return 0;
  }

  if (body instanceof Blob) {
    return body.size;
  }

  if (typeof body === "string") {
    return new TextEncoder().encode(body).byteLength;
  }

  throw new TypeError("Unsupported fake S3 body type.");
}
