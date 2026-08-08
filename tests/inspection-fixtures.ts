import { createCompletionEvidence } from "../src/completion-evidence";
import { createManifest } from "../src/manifest";
import type { IngestCompletionEvidence, IngestManifest, UploadChunkReceipt } from "../src/types";

export async function createPolicyFixture(): Promise<{
  manifest: IngestManifest;
  verified: IngestCompletionEvidence;
}> {
  const file = new File([new Uint8Array(512 * 1024)], "wafer.tif", { type: "image/tiff" });
  const manifest = await createManifest(file, {
    chunking: { chunkSize: 256 * 1024 },
    metadata: {
      lotId: "LOT-001",
      waferId: "W12",
      inspectionId: "INS-42",
      toolId: "AOI-7"
    }
  });
  const checksum = manifest.original.checksum;
  if (!checksum) throw new Error("Expected checksum.");
  const verified = await createCompletionEvidence({
    manifest,
    transportName: "fake",
    receipts: createInspectionReceipts(),
    completionResult: {
      storedObject: {
        sizeBytes: manifest.original.sizeBytes,
        checksum: { algorithm: "sha256", value: checksum.value }
      }
    }
  });
  return { manifest, verified };
}

export function createInspectionReceipts(): UploadChunkReceipt[] {
  return [0, 1].map((chunkIndex) => ({
    chunkIndex,
    sizeBytes: 256 * 1024,
    completedAt: "2026-08-07T00:00:00.000Z",
    transport: { name: "fake", partNumber: chunkIndex + 1 }
  }));
}
