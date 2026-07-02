import { createIngestSession } from "large-image-ingest/core";
import { createTusTransport } from "large-image-ingest/transport-tus";

export async function uploadWithTus(file: File): Promise<void> {
  const session = createIngestSession(file, {
    chunking: {
      chunkSize: 64 * 1024 * 1024
    },
    metadata: {
      lotId: "LOT-2026-001",
      waferId: "W12"
    },
    storage: {
      kind: "tus",
      label: "inspection-tus-gateway"
    },
    transport: createTusTransport({
      endpoint: "/files",
      detectExtensions: true,
      metadata: {
        filename: file.name
      },
      terminateOnAbort: true
    }),
    validation: {
      acceptedExtensions: ["tif", "tiff", "png", "jpg", "jpeg"],
      acceptedMimeTypes: ["image/tiff", "image/png", "image/jpeg"]
    }
  });

  await session.start();
}
