import { describe, expect, it } from "vitest";
import {
  cloneCompletionEvidence,
  createCompletionEvidence,
  parseCompletionEvidence,
  validateCompletionEvidence
} from "../src/completion-evidence";
import { createManifest } from "../src/manifest";
import type { UploadChunkReceipt } from "../src/types";
import { evidenceFixtureTime, sensitiveEvidenceValues } from "./evidence-fixtures";
import { LARGE_IMAGE_INGEST_VERSION } from "../src/version";

const chunkSize = 256 * 1024;

describe("completion evidence", () => {
  it("creates a deterministic receipt-set digest independent of input order", async () => {
    const manifest = await createFixtureManifest();
    const receipts = createReceipts();
    const first = await createCompletionEvidence({
      manifest,
      transportName: "fake",
      receipts,
      id: "completion-1",
      now: new Date(evidenceFixtureTime)
    });
    const second = await createCompletionEvidence({
      manifest,
      transportName: "fake",
      receipts: [...receipts].reverse(),
      id: "completion-1",
      now: new Date(evidenceFixtureTime)
    });

    expect(first.upload.receiptDigest).toEqual(second.upload.receiptDigest);
    expect(first).toMatchObject({
      schemaVersion: "large-image-ingest.completion.v1",
      producer: { name: "large-image-ingest", version: LARGE_IMAGE_INGEST_VERSION },
      status: "completed-unverified",
      upload: { acknowledgedChunks: 2, receiptDigest: { algorithm: "sha256" } }
    });
    expect(first.upload.receiptDigest.value).toMatch(/^[a-f0-9]{64}$/);
  });

  it("classifies equivalent stored bytes as verified", async () => {
    const manifest = await createFixtureManifest();
    const sourceChecksum = manifest.original.checksum;
    if (!sourceChecksum) throw new Error("Expected source checksum.");

    const evidence = await createCompletionEvidence({
      manifest,
      transportName: "fake",
      receipts: createReceipts(),
      completionResult: {
        completedAt: evidenceFixtureTime,
        storedObject: {
          sizeBytes: manifest.original.sizeBytes,
          checksum: { algorithm: "sha256", value: sourceChecksum.value }
        }
      },
      now: new Date(evidenceFixtureTime)
    });

    expect(evidence).toMatchObject({
      status: "verified",
      completedAt: evidenceFixtureTime,
      verification: {
        storedSizeBytes: manifest.original.sizeBytes,
        storedChecksum: { algorithm: "sha256", value: sourceChecksum.value }
      }
    });
  });

  it("keeps absent, checksum-disabled, and different-algorithm proof unverified", async () => {
    const manifest = await createFixtureManifest();
    const withoutProof = await createCompletionEvidence({
      manifest,
      transportName: "custom",
      receipts: createReceipts()
    });
    const differentAlgorithm = await createCompletionEvidence({
      manifest,
      transportName: "custom",
      receipts: createReceipts(),
      completionResult: {
        storedObject: {
          sizeBytes: manifest.original.sizeBytes,
          checksum: { algorithm: "crc32c", value: "abcd" }
        }
      }
    });
    const noChecksumManifest = await createFixtureManifest(false);
    const checksumDisabled = await createCompletionEvidence({
      manifest: noChecksumManifest,
      transportName: "custom",
      receipts: createReceipts()
    });

    expect(withoutProof.status).toBe("completed-unverified");
    expect(differentAlgorithm.status).toBe("completed-unverified");
    expect(checksumDisabled).toMatchObject({ status: "completed-unverified", source: { sizeBytes: noChecksumManifest.original.sizeBytes } });
    expect(checksumDisabled.source.checksum).toBeUndefined();
  });

  it("rejects stored-size and same-algorithm checksum conflicts without echoing values", async () => {
    const manifest = await createFixtureManifest();
    const sourceChecksum = manifest.original.checksum;
    if (!sourceChecksum) throw new Error("Expected source checksum.");

    for (const storedObject of [
      { sizeBytes: manifest.original.sizeBytes + 1, checksum: { algorithm: "sha256" as const, value: sourceChecksum.value } },
      { sizeBytes: manifest.original.sizeBytes, checksum: { algorithm: "sha256" as const, value: "f".repeat(64) } }
    ]) {
      const error = await createCompletionEvidence({
        manifest,
        transportName: "fake",
        receipts: createReceipts(),
        completionResult: { storedObject }
      }).catch((caught: unknown) => caught);

      expect(error).toMatchObject({ code: "completion.integrity_mismatch", retryable: false });
      expect(JSON.stringify(error)).not.toContain(sourceChecksum.value);
      expect(JSON.stringify(error)).not.toContain(storedObject.checksum.value);
    }
  });

  it("validates, parses, clones, and freezes detached evidence", async () => {
    const evidence = await createCompletionEvidence({
      manifest: await createFixtureManifest(),
      transportName: "fake",
      receipts: createReceipts(),
      now: new Date(evidenceFixtureTime)
    });
    const parsed = parseCompletionEvidence(evidence);
    const cloned = cloneCompletionEvidence(evidence);

    expect(validateCompletionEvidence(evidence)).toMatchObject({ ok: true });
    expect(parsed).toEqual(evidence);
    expect(parsed).not.toBe(evidence);
    expect(cloned).toEqual(evidence);
    expect(cloned).not.toBe(evidence);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.upload)).toBe(true);

    const malformed = structuredClone(evidence) as unknown as Record<string, unknown>;
    malformed.status = "probably-verified";
    expect(validateCompletionEvidence(malformed)).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "completion.evidence_invalid", path: "status" })]
    });
    expect(() => parseCompletionEvidence({ ...malformed, checksum: sensitiveEvidenceValues.checksum }))
      .toThrow(expect.objectContaining({ code: "completion.evidence_invalid" }));

    const additive = { ...structuredClone(evidence), futureExtension: { enabled: true } };
    expect(parseCompletionEvidence(additive)).toMatchObject({ id: evidence.id });
    expect(() => parseCompletionEvidence({ ...additive, schemaVersion: "large-image-ingest.completion.v99" }))
      .toThrow(expect.objectContaining({ code: "completion.schema_unsupported" }));
  });

  it("does not mutate the original source while constructing evidence", async () => {
    const file = new File([new Uint8Array(512 * 1024).fill(0x5a)], "source.tif", { type: "image/tiff" });
    const before = new Uint8Array(await file.arrayBuffer());
    const manifest = await createManifest(file, { chunking: { chunkSize } });
    await createCompletionEvidence({ manifest, transportName: "fake", receipts: createReceipts() });
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(before);
  });
});

async function createFixtureManifest(checksum: boolean = true) {
  return createManifest(
    new File([new Uint8Array(512 * 1024)], "wafer.tif", { type: "image/tiff" }),
    { chunking: { chunkSize }, checksum: checksum ? undefined : false }
  );
}

function createReceipts(): UploadChunkReceipt[] {
  return [0, 1].map((chunkIndex) => ({
    chunkIndex,
    sizeBytes: chunkSize,
    completedAt: evidenceFixtureTime,
    checksum: { algorithm: "sha256", value: String(chunkIndex).repeat(64) },
    transport: {
      name: "fake",
      partNumber: chunkIndex + 1,
      etag: `etag-${chunkIndex}`,
      location: `${sensitiveEvidenceValues.location}/${chunkIndex}`,
      opaque: { secret: sensitiveEvidenceValues.opaque }
    }
  }));
}
