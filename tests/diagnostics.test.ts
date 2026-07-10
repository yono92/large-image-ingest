import { describe, expect, it } from "vitest";
import { createManifest } from "../src/manifest";
import {
  createSafeEventSummary,
  createSafeVerificationSummary,
  redactResumeRecord,
  redactUploadSessionSnapshot
} from "../src/diagnostics";
import type {
  IngestEvent,
  ResumeRecord,
  UploadSessionSnapshot,
  VerificationResult
} from "../src/types";

describe("diagnostics helpers", () => {
  it("summarizes manifest-bearing and progress events without carrying full manifests", async () => {
    const manifest = await createManifest(createFile(), {
      metadata: {
        lotId: "LOT-SECRET",
        waferId: "W12"
      }
    });
    const validated = createSafeEventSummary({ type: "validated", manifest });
    const started = createSafeEventSummary({
      type: "started",
      manifest,
      uploadId: "upload-1"
    });
    const completed = createSafeEventSummary({
      type: "completed",
      manifest,
      uploadId: "upload-1"
    });
    const progress = createSafeEventSummary({
      type: "chunk:completed",
      manifestId: manifest.id,
      chunk: { index: 2, start: 20, end: 30, size: 10 },
      uploadedBytes: 30,
      totalBytes: 100
    });

    expect(validated).toMatchObject({
      type: "validated",
      manifestId: manifest.id,
      redactions: { fields: ["manifest"] }
    });
    expect(started).toMatchObject({
      type: "started",
      manifestId: manifest.id,
      uploadId: "upload-1"
    });
    expect(completed).toMatchObject({
      type: "completed",
      manifestId: manifest.id,
      uploadId: "upload-1"
    });
    expect(progress).toMatchObject({
      type: "chunk:completed",
      manifestId: manifest.id,
      chunkIndex: 2,
      progress: {
        uploadedBytes: 30,
        totalBytes: 100
      }
    });
    expect(JSON.stringify([validated, started, completed, progress])).not.toContain("LOT-SECRET");
    expect(JSON.stringify([validated, started, completed, progress])).not.toContain("waferId");
  });

  it("summarizes retry, conflict, and failed events with safe typed error details", () => {
    const retry = createSafeEventSummary({
      type: "retry",
      manifestId: "manifest-1",
      chunk: { index: 0, start: 0, end: 10, size: 10 },
      attempt: 2,
      error: { code: "transport.failed", message: "Temporary failure.", retryable: true }
    });
    const conflict = createSafeEventSummary({
      type: "resume:conflict",
      recordId: "record-1",
      code: "resume.transport_mismatch",
      error: { message: "resume token https://secret.example/upload/1" }
    });
    const failed = createSafeEventSummary({
      type: "failed",
      manifestId: "manifest-1",
      error: { code: "transport.failed", message: "https://secret.example/upload/1", retryable: false }
    });

    expect(retry).toMatchObject({
      type: "retry",
      manifestId: "manifest-1",
      chunkIndex: 0,
      error: {
        code: "transport.failed",
        message: "Temporary failure.",
        retryable: true
      }
    });
    expect(conflict).toMatchObject({
      type: "resume:conflict",
      recordId: "record-1",
      error: {
        code: "resume.transport_mismatch"
      }
    });
    expect(failed).toMatchObject({
      type: "failed",
      manifestId: "manifest-1",
      error: {
        code: "transport.failed",
        retryable: false
      }
    });
    expect(JSON.stringify([retry, conflict, failed])).not.toContain("https://secret.example");
  });

  it("summarizes completion cleanup failures without sensitive store details", () => {
    const summary = createSafeEventSummary({
      type: "resume:cleanup-failed",
      recordId: "record-1",
      code: "resume.store_failed",
      operation: "delete",
      error: new Error("Could not delete https://secret.example/resume/token")
    });

    expect(summary).toMatchObject({
      type: "resume:cleanup-failed",
      recordId: "record-1",
      cleanupOperation: "delete",
      error: {
        code: "resume.store_failed",
        message: "Error details redacted."
      }
    });
    expect(JSON.stringify(summary)).not.toContain("secret.example");
  });

  it("redacts snapshots without mutating the caller-owned full snapshot", () => {
    const snapshot = createSnapshot();

    const result = redactUploadSessionSnapshot(snapshot);

    expect(result.snapshot.transportSession?.resumeToken).toBeUndefined();
    expect(result.snapshot.transportSession?.secretsRef).toBeUndefined();
    expect(result.snapshot.transportSession?.remote).toBeUndefined();
    expect(result.snapshot.completedChunks[0]?.transport.etag).toBeUndefined();
    expect(result.snapshot.completedChunks[0]?.transport.location).toBeUndefined();
    expect(result.snapshot.completedChunks[0]?.transport.opaque).toBeUndefined();
    expect(result.redactions?.fields).toEqual([
      "snapshot.transportSession.resumeToken",
      "snapshot.transportSession.secretsRef",
      "snapshot.transportSession.remote",
      "snapshot.completedChunks.transport.etag",
      "snapshot.completedChunks.transport.location",
      "snapshot.completedChunks.transport.opaque"
    ]);

    expect(snapshot.transportSession?.resumeToken).toBe("https://secret.example/upload/1");
    expect(snapshot.completedChunks[0]?.transport.location).toBe("https://secret.example/part/1");
  });

  it("redacts resume records to recovery-safe operational state", async () => {
    const manifest = await createManifest(createFile(), {
      metadata: {
        lotId: "LOT-SECRET"
      }
    });
    const record: ResumeRecord = {
      schemaVersion: "large-image-ingest.resume.v0.2",
      id: "record-1",
      manifest,
      file: {
        name: "wafer.tif",
        sizeBytes: 128,
        mediaType: "image/tiff",
        lastModified: Date.UTC(2026, 0, 1),
        fingerprint: manifest.original.fingerprint
      },
      chunking: {
        strategy: "fixed-size",
        chunkSizeBytes: 64,
        totalBytes: 128,
        totalChunks: 2
      },
      transport: {
        name: "tus",
        uploadId: "remote-upload-secret",
        resumeToken: "https://secret.example/upload/1",
        data: {
          opaque: "secret"
        }
      },
      receipts: [{
        chunkIndex: 0,
        sizeBytes: 64,
        completedAt: "2026-01-01T00:00:30.000Z",
        transport: {
          name: "tus",
          etag: "secret-etag",
          location: "https://secret.example/part/1",
          opaque: { providerSecret: "secret" }
        }
      }],
      progress: {
        status: "active",
        uploadedBytes: 64,
        completedChunkRanges: [{ startIndex: 0, endIndexInclusive: 0 }],
        nextChunkIndex: 1
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z"
    };

    const redacted = redactResumeRecord(record);

    expect(redacted).toMatchObject({
      schemaVersion: record.schemaVersion,
      id: "record-1",
      manifestId: manifest.id,
      transport: {
        name: "tus"
      },
      progress: {
        status: "active",
        uploadedBytes: 64
      }
    });
    expect(redacted.transport.uploadId).toBeUndefined();
    expect(redacted.redactions?.fields).toEqual([
      "resume.manifest",
      "resume.transport.uploadId",
      "resume.transport.resumeToken",
      "resume.transport.data",
      "resume.receipts"
    ]);
    expect(JSON.stringify(redacted)).not.toContain("LOT-SECRET");
    expect(JSON.stringify(redacted)).not.toContain("https://secret.example");
    expect(JSON.stringify(redacted)).not.toContain("secret-etag");
  });

  it("summarizes verification results without copying issue details", () => {
    const report: VerificationResult = {
      ok: false,
      issues: [
        {
          code: "verification.checksum_mismatch",
          path: "original.checksum.value",
          severity: "error",
          message: "Checksum mismatch.",
          details: {
            metadata: "LOT-SECRET",
            manifest: { id: "manifest-1" }
          }
        }
      ]
    };

    const summary = createSafeVerificationSummary(report);

    expect(summary).toEqual({
      ok: false,
      issues: [
        {
          code: "verification.checksum_mismatch",
          path: "original.checksum.value",
          severity: "error"
        }
      ]
    });
    expect(JSON.stringify(summary)).not.toContain("LOT-SECRET");
    expect(JSON.stringify(summary)).not.toContain("manifest-1");
  });
});

function createFile(): File {
  return new File([new Uint8Array(128)], "wafer.tif", {
    type: "image/tiff",
    lastModified: Date.UTC(2026, 0, 1)
  });
}

function createSnapshot(): UploadSessionSnapshot {
  return {
    manifestId: "manifest-1",
    status: "uploading",
    transportSession: {
      uploadId: "upload-1",
      transportName: "tus",
      createdAt: "2026-01-01T00:00:00.000Z",
      resumeToken: "https://secret.example/upload/1",
      secretsRef: "secret-ref",
      remote: {
        opaque: "secret"
      }
    },
    chunkPlan: {
      chunkSize: 10,
      totalBytes: 20,
      totalChunks: 2,
      chunks: [
        { index: 0, start: 0, end: 10, size: 10 },
        { index: 1, start: 10, end: 20, size: 10 }
      ]
    },
    completedChunks: [
      {
        chunkIndex: 0,
        sizeBytes: 10,
        completedAt: "2026-01-01T00:00:01.000Z",
        transport: {
          name: "tus",
          etag: "secret-etag",
          location: "https://secret.example/part/1",
          opaque: {
            authorization: "secret"
          }
        }
      }
    ],
    uploadedBytes: 10,
    totalBytes: 20,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:01.000Z"
  };
}
