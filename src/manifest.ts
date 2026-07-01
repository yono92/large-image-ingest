import { planChunks } from "./chunks.js";
import { createFastFingerprint } from "./fingerprint.js";
import { validateFile } from "./validation.js";
import type {
  CreateIngestSessionOptions,
  IngestFileLike,
  IngestManifest
} from "./types.js";

export async function createManifest(
  file: IngestFileLike,
  options: Pick<CreateIngestSessionOptions, "chunking" | "metadata" | "retries" | "storage" | "validation"> = {}
): Promise<IngestManifest> {
  const validation = validateFile(file, options.validation);
  const chunkPlan = planChunks(file.size, options.chunking);
  const fingerprintValue = await createFastFingerprint(file);

  const original = {
    kind: "original" as const,
    name: file.name,
    sizeBytes: file.size,
    mediaType: file.type || "application/octet-stream",
    fingerprint: {
      algorithm: fingerprintValue.startsWith("fast-") ? "metadata-fallback" as const : "metadata-sha256" as const,
      scope: "file-metadata" as const,
      value: fingerprintValue
    },
    preservation: {
      required: true as const,
      allowedMutations: [] as []
    }
  };

  if (file.lastModified !== undefined) {
    Object.assign(original, { lastModifiedAt: new Date(file.lastModified).toISOString() });
  }

  const extension = getExtension(file.name);
  if (extension) {
    Object.assign(original, { extension });
  }

  const manifest: IngestManifest = {
    schemaVersion: "large-image-ingest.manifest.v0.1",
    id: createId(),
    createdAt: new Date().toISOString(),
    library: {
      name: "large-image-ingest",
      version: "0.0.0"
    },
    original,
    image: {
      status: "not_inspected",
      width: null,
      height: null,
      colorDepth: null
    },
    chunking: {
      strategy: "fixed-size",
      chunkSizeBytes: chunkPlan.chunkSize,
      totalBytes: chunkPlan.totalBytes,
      totalChunks: chunkPlan.totalChunks,
      chunkRangesIncluded: false
    },
    upload: {
      status: "pending",
      resumable: true,
      retryLimit: options.retries ?? 2
    },
    metadata: options.metadata ?? {},
    derivatives: [],
    validation
  };

  if (options.storage) {
    manifest.storage = options.storage;
  }

  return manifest;
}

function createId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `manifest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function getExtension(name: string): string | undefined {
  const dotIndex = name.lastIndexOf(".");

  if (dotIndex < 0 || dotIndex === name.length - 1) {
    return undefined;
  }

  return name.slice(dotIndex + 1).toLowerCase();
}
