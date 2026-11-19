// Part of derivatives.ts, split out to keep modules under 500 lines; public exports stay on derivatives.ts.
import type {
  DerivativeStorageReference,
  IngestManifest,
  TilePyramidDescriptor,
  TilePyramidLevelDescriptor
} from "./types.js";

export function cloneStorage(storage: DerivativeStorageReference | undefined): DerivativeStorageReference | undefined {
  if (!storage) {
    return undefined;
  }

  const cloned: DerivativeStorageReference = {
    kind: storage.kind
  };

  assignOptional(cloned, "label", storage.label);
  assignOptional(cloned, "locationHint", storage.locationHint);
  assignOptional(cloned, "metadata", storage.metadata ? cloneUnknownRecord(storage.metadata) : undefined);

  return cloned;
}

export function cloneTilePyramid(tilePyramid: TilePyramidDescriptor | undefined): TilePyramidDescriptor | undefined {
  if (!tilePyramid) {
    return undefined;
  }

  const cloned: TilePyramidDescriptor = {
    levels: tilePyramid.levels.map((level) => {
      const clonedLevel: TilePyramidLevelDescriptor = {
        level: level.level,
        width: level.width,
        height: level.height,
        columns: level.columns,
        rows: level.rows
      };

      assignOptional(clonedLevel, "scale", level.scale);
      assignOptional(clonedLevel, "storage", cloneStorage(level.storage));

      return clonedLevel;
    })
  };

  assignOptional(cloned, "tileWidth", tilePyramid.tileWidth);
  assignOptional(cloned, "tileHeight", tilePyramid.tileHeight);
  assignOptional(cloned, "storage", cloneStorage(tilePyramid.storage));

  return cloned;
}

export function cloneOriginalManifest(manifest: IngestManifest): IngestManifest["original"] {
  const original: IngestManifest["original"] = {
    kind: "original",
    name: manifest.original.name,
    sizeBytes: manifest.original.sizeBytes,
    mediaType: manifest.original.mediaType,
    fingerprint: { ...manifest.original.fingerprint },
    preservation: {
      required: true,
      allowedMutations: []
    }
  };

  assignOptional(original, "checksum", manifest.original.checksum ? { ...manifest.original.checksum } : undefined);
  assignOptional(original, "extension", manifest.original.extension);
  assignOptional(original, "lastModifiedAt", manifest.original.lastModifiedAt);

  return original;
}

export function cloneUploadManifest(manifest: IngestManifest): IngestManifest["upload"] {
  const upload: IngestManifest["upload"] = {
    status: manifest.upload.status,
    resumable: true,
    retryLimit: manifest.upload.retryLimit
  };

  assignOptional(upload, "transport", manifest.upload.transport ? { ...manifest.upload.transport } : undefined);

  return upload;
}

export function cloneUnknownRecord<T>(value: T): T {
  return structuredClone(value) as T;
}

export function assignOptional<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}
