import { createIngestSession } from "large-image-ingest/core";
import {
  createS3MultipartTransport,
  type S3MultipartBroker
} from "large-image-ingest/transport-s3";

const broker: S3MultipartBroker = {
  async createMultipartUpload({ manifest }) {
    const response = await fetch("/api/s3/multipart", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        manifestId: manifest.id
      })
    });

    return response.json();
  },
  async getUploadPartUrl({ key, partNumber, uploadId }) {
    const response = await fetch("/api/s3/multipart/part-url", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        key,
        partNumber,
        uploadId
      })
    });

    return response.json();
  },
  async completeMultipartUpload({ key, parts, uploadId }) {
    const response = await fetch("/api/s3/multipart/complete", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        key,
        parts,
        uploadId
      })
    });

    if (!response.ok) {
      throw new Error("S3 multipart completion failed.");
    }

    // The broker may return normalized whole-object size and SHA-256 facts.
    // Multipart ETags and part checksums alone remain transfer receipts.
    return response.json();
  },
  async abortMultipartUpload({ key, uploadId }) {
    await fetch("/api/s3/multipart/abort", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        key,
        uploadId
      })
    });
  }
};

export async function uploadWithS3Multipart(file: File): Promise<void> {
  const session = createIngestSession(file, {
    chunking: {
      chunkSize: 64 * 1024 * 1024
    },
    metadata: {
      lotId: "LOT-2026-001",
      waferId: "W12"
    },
    storage: {
      kind: "s3",
      label: "inspection-originals"
    },
    transport: createS3MultipartTransport({
      broker
    })
  });

  await session.start();

  const evidence = session.getCompletionEvidence();
  if (evidence?.status !== "verified") {
    // Transport completion succeeded, but the broker did not prove stored-byte equivalence.
    console.warn("S3 upload completed without whole-object verification.");
  }
}
