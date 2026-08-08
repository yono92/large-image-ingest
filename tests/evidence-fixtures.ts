import type { IngestFileLike } from "../src/types";

export const evidenceFixtureTime = "2026-08-07T00:00:00.000Z";

export function createSameMetadataFiles(): {
  original: IngestFileLike;
  replacement: IngestFileLike;
} {
  const options = {
    type: "image/tiff",
    lastModified: Date.UTC(2026, 7, 7)
  };

  const originalBytes = new Uint8Array(512 * 1024);
  const replacementBytes = new Uint8Array(originalBytes.length);
  originalBytes.fill(0x11);
  replacementBytes.fill(0x22);

  return {
    original: new File([originalBytes], "same-metadata.tif", options),
    replacement: new File([replacementBytes], "same-metadata.tif", options)
  };
}

export const sensitiveEvidenceValues = {
  checksum: "a".repeat(64),
  filename: "customer-wafer-secret.tif",
  location: "s3://private-bucket/customer/wafer.tif",
  metadata: "LOT-SECRET-001",
  opaque: "provider-secret-value",
  resumeToken: "https://upload.invalid/private-token",
  uploadId: "private-upload-id"
} as const;
