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
      terminateOnAbort: true,
      async verifyUpload({ manifest, uploadUrl }) {
        // tus offset completion proves accepted bytes, not the finalized stored object.
        // This application-owned endpoint returns normalized stored size/checksum facts.
        const response = await fetch("/api/tus/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ manifestId: manifest.id, uploadUrl })
        });
        if (!response.ok) {
          throw new Error("Final tus object verification failed.");
        }
        return response.json();
      }
    }),
    validation: {
      acceptedExtensions: ["tif", "tiff", "png", "jpg", "jpeg"],
      acceptedMimeTypes: ["image/tiff", "image/png", "image/jpeg"]
    }
  });

  await session.start();

  const evidence = session.getCompletionEvidence();
  if (evidence?.status === "completed-unverified") {
    console.warn("tus upload completed without equivalent stored-object proof.");
  }
}
