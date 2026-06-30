import { planChunks } from "./chunks";
import { createFastFingerprint } from "./fingerprint";
import { validateFile } from "./validation";
import type {
  CreateIngestSessionOptions,
  IngestFileLike,
  IngestManifest
} from "./types";

export async function createManifest(
  file: IngestFileLike,
  options: Pick<CreateIngestSessionOptions, "chunking" | "metadata" | "validation"> = {}
): Promise<IngestManifest> {
  const validation = validateFile(file, options.validation);
  const chunkPlan = planChunks(file.size, options.chunking);

  const original = {
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    fingerprint: await createFastFingerprint(file)
  };

  if (file.lastModified !== undefined) {
    Object.assign(original, { lastModified: file.lastModified });
  }

  return {
    id: createId(),
    version: "0.1",
    createdAt: new Date().toISOString(),
    original,
    chunking: {
      chunkSize: chunkPlan.chunkSize,
      totalChunks: chunkPlan.totalChunks
    },
    metadata: options.metadata ?? {},
    issues: validation.issues
  };
}

function createId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `manifest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}
