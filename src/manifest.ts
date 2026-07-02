import { calculateChecksum } from "./checksum.js";
import { planChunks } from "./chunks.js";
import { createFastFingerprint } from "./fingerprint.js";
import { validateFile } from "./validation.js";
import type {
  ChecksumOptions,
  CreateIngestSessionOptions,
  FileChecksum,
  ImageInspectionManifest,
  IngestFileLike,
  IngestIssue,
  IngestManifest,
  ManifestIdentityOverride,
  ValidationResult
} from "./types.js";

type CreateManifestOptions = Pick<
  CreateIngestSessionOptions,
  "checksum" | "chunking" | "image" | "metadata" | "retries" | "storage" | "validation"
> & {
  manifestIdentity?: ManifestIdentityOverride;
};

export async function createManifest(
  file: IngestFileLike,
  options: CreateManifestOptions = {}
): Promise<IngestManifest> {
  const metadata = options.metadata ?? {};
  const validation = validateFile(file, options.validation, metadata, options.image);
  const chunkPlan = planChunks(file.size, options.chunking);
  const fingerprintValue = await createFastFingerprint(file);
  const checksum = await calculateManifestChecksum(file, options.checksum, validation);

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

  if (checksum) {
    Object.assign(original, { checksum });
  }

  const extension = getExtension(file.name);
  if (extension) {
    Object.assign(original, { extension });
  }

  const manifest: IngestManifest = {
    schemaVersion: "large-image-ingest.manifest.v1",
    id: options.manifestIdentity?.id ?? createId(),
    createdAt: options.manifestIdentity?.createdAt ?? new Date().toISOString(),
    library: {
      name: "large-image-ingest",
      version: "1.0.0"
    },
    original,
    image: createImageManifest(options.image),
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
    metadata,
    derivatives: [],
    validation
  };

  if (options.storage) {
    manifest.storage = options.storage;
  }

  return manifest;
}

async function calculateManifestChecksum(
  file: IngestFileLike,
  checksumOptions: ChecksumOptions | false | undefined,
  validation: ValidationResult
): Promise<FileChecksum | undefined> {
  if (checksumOptions === false) {
    return undefined;
  }

  const checksum = await calculateChecksum(file, checksumOptions);
  const expected = checksumOptions?.expected;
  if (expected && checksum.value.toLowerCase() !== expected.toLowerCase()) {
    appendValidationIssue(validation, {
      code: "checksum.mismatch",
      message: "File checksum does not match the expected checksum.",
      path: "original.checksum.value",
      severity: "error",
      details: { expected, actual: checksum.value, algorithm: checksum.algorithm }
    });
  }

  return checksum;
}

function appendValidationIssue(validation: ValidationResult, issue: IngestIssue): void {
  validation.issues.push(issue);
  validation.ok = validation.issues.every((currentIssue) => currentIssue.severity !== "error");
}

function createImageManifest(image: CreateIngestSessionOptions["image"]): ImageInspectionManifest {
  if (!image) {
    return {
      status: "not_inspected",
      width: null,
      height: null,
      colorDepth: null
    };
  }

  const manifest: ImageInspectionManifest = {
    status: "provided",
    width: image.width ?? null,
    height: image.height ?? null,
    colorDepth: image.colorDepth ?? null
  };

  if (image.format) {
    manifest.format = image.format;
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
