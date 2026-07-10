import { LargeImageIngestError } from "./errors.js";
import type {
  AttachDerivativeOptions,
  CreateDerivativeReferenceInput,
  DerivativeManifest,
  DerivativeSourceIdentity,
  DerivativeStorageReference,
  DerivativeValidationIssue,
  DerivativeValidationIssueCode,
  DerivativeValidationOptions,
  DerivativeValidationResult,
  IngestIssueSeverity,
  IngestManifest,
  TilePyramidDescriptor,
  TilePyramidLevelDescriptor
} from "./types.js";

const DERIVATIVE_KINDS = new Set(["preview", "thumbnail", "tile", "metadata", "custom"]);
const DERIVATIVE_STATUSES = new Set(["planned", "created", "failed"]);
const EMBEDDED_PAYLOAD_KEYS = new Set(["base64", "blob", "body", "buffer", "bytes", "data", "file", "payload"]);
const UNSAFE_VALUE_PATTERNS = [
  /x-amz-/i,
  /awsaccesskeyid/i,
  /signature=/i,
  /sig=/i,
  /token=/i,
  /access_token=/i,
  /secret/i,
  /credential=/i,
  /password=/i,
  /authorization/i,
  /\.\.[\\/]/,
  /^[a-z]:\\/i
];

export function createDerivativeReference(input: CreateDerivativeReferenceInput): DerivativeManifest {
  const derivative: DerivativeManifest = {
    id: input.id ?? createId("derivative"),
    kind: input.kind,
    status: input.status,
    source: "original",
    sourceIdentity: createSourceIdentity(input.manifest)
  };

  assignOptional(derivative, "role", input.role);
  assignOptional(derivative, "mediaType", input.mediaType);
  assignOptional(derivative, "width", input.width);
  assignOptional(derivative, "height", input.height);
  assignOptional(derivative, "sizeBytes", input.sizeBytes);
  assignOptional(derivative, "checksum", input.checksum);
  assignOptional(derivative, "storage", cloneStorage(input.storage));
  assignOptional(derivative, "provenance", input.provenance ? { ...input.provenance } : undefined);
  assignOptional(derivative, "failure", input.failure ? { ...input.failure } : undefined);
  assignOptional(derivative, "tilePyramid", cloneTilePyramid(input.tilePyramid));
  assignOptional(derivative, "metadata", input.metadata ? cloneUnknownRecord(input.metadata) : undefined);
  assignOptional(derivative, "createdAt", input.createdAt);
  assignOptional(derivative, "updatedAt", input.updatedAt);

  return derivative;
}

export function attachDerivative(
  manifest: IngestManifest,
  derivative: DerivativeManifest,
  options: AttachDerivativeOptions = {}
): IngestManifest {
  const existingIndex = manifest.derivatives.findIndex((current) => current.id === derivative.id);
  const nextDerivative = cloneDerivative(derivative);

  if (existingIndex >= 0 && options.replaceExisting !== true) {
    throw new LargeImageIngestError("derivative.id.duplicate", "Duplicate derivative id.", {
      derivativeId: derivative.id
    });
  }

  const derivatives = manifest.derivatives.map(cloneDerivative);

  if (existingIndex >= 0) {
    derivatives[existingIndex] = nextDerivative;
  } else {
    derivatives.push(nextDerivative);
  }

  const nextManifest: IngestManifest = {
    schemaVersion: manifest.schemaVersion,
    id: manifest.id,
    createdAt: manifest.createdAt,
    library: { ...manifest.library },
    original: cloneOriginalManifest(manifest),
    image: { ...manifest.image },
    chunking: { ...manifest.chunking },
    upload: cloneUploadManifest(manifest),
    metadata: cloneUnknownRecord(manifest.metadata),
    validation: {
      ok: manifest.validation.ok,
      issues: manifest.validation.issues.map((issue) => {
        const clonedIssue = { ...issue };
        if (issue.details) {
          clonedIssue.details = cloneUnknownRecord(issue.details);
        }
        return clonedIssue;
      })
    },
    derivatives
  };

  if (manifest.storage) {
    nextManifest.storage = { ...manifest.storage };
  }

  return nextManifest;
}

export function validateDerivativeReference(
  derivative: DerivativeManifest,
  manifest: IngestManifest,
  options: DerivativeValidationOptions = {}
): DerivativeValidationResult {
  const issues: DerivativeValidationIssue[] = [];

  if (!derivative.id) {
    addIssue(issues, "derivative.id.missing", "Derivative id is required.", "id", "error");
  }

  if (!DERIVATIVE_KINDS.has(derivative.kind)) {
    addIssue(issues, "derivative.kind.unsupported", "Derivative kind is unsupported.", "kind", "error", derivative.id);
  }

  if (!DERIVATIVE_STATUSES.has(derivative.status)) {
    addIssue(issues, "derivative.status.invalid", "Derivative status is invalid.", "status", "error", derivative.id);
  }

  if (derivative.source !== "original") {
    addIssue(issues, "derivative.source.missing", "Derivative source relationship is missing.", "source", "error", derivative.id);
  }

  if (options.strictSourceIdentity === true && derivative.sourceIdentity === undefined) {
    addIssue(issues, "derivative.source.missing", "Derivative source identity is missing.", "sourceIdentity", "error", derivative.id);
  }

  if (derivative.sourceIdentity && !sourceIdentityMatches(derivative.sourceIdentity, manifest)) {
    addIssue(
      issues,
      "derivative.source.mismatch",
      "Derivative source identity does not match the manifest original.",
      "sourceIdentity",
      "error",
      derivative.id
    );
  }

  if (options.allowUnsafeLocationHints !== true && derivative.storage && storageReferenceIsUnsafe(derivative.storage)) {
    addIssue(issues, "derivative.storage.unsafe", "Derivative storage reference contains unsafe data.", "storage", "error", derivative.id);
  }

  if (containsEmbeddedPayload(derivative.storage?.metadata) || containsEmbeddedPayload(derivative.metadata)) {
    addIssue(issues, "derivative.payload.embedded", "Embedded derivative payload data is not allowed.", "storage.metadata", "error", derivative.id);
  }

  if (derivative.failure && failureIsUnsafe(derivative.failure)) {
    addIssue(issues, "derivative.failure.unsafe", "Derivative failure contains unsafe details.", "failure", "error", derivative.id);
  }

  if (derivative.tilePyramid && !tilePyramidIsValid(derivative.tilePyramid, derivative.status)) {
    addIssue(issues, "derivative.tile.invalid", "Derivative tile pyramid metadata is invalid.", "tilePyramid", "error", derivative.id);
  }

  return toResult(issues);
}

export function validateManifestDerivatives(
  manifest: IngestManifest,
  options: DerivativeValidationOptions = {}
): DerivativeValidationResult {
  const issues: DerivativeValidationIssue[] = [];
  const seenIds = new Set<string>();

  for (const [index, derivative] of manifest.derivatives.entries()) {
    if (derivative.id && seenIds.has(derivative.id)) {
      addIssue(
        issues,
        "derivative.id.duplicate",
        "Derivative id is duplicated.",
        `derivatives.${index}.id`,
        "error",
        derivative.id
      );
      continue;
    }

    if (derivative.id) {
      seenIds.add(derivative.id);
    }

    for (const issue of validateDerivativeReference(derivative, manifest, options).issues) {
      issues.push({
        ...issue,
        path: issue.path ? `derivatives.${index}.${issue.path}` : `derivatives.${index}`
      });
    }
  }

  for (const requiredId of options.requiredDerivativeIds ?? []) {
    if (!seenIds.has(requiredId)) {
      addIssue(issues, "derivative.required.missing", "Required derivative is missing.", "derivatives", "error", requiredId);
    }
  }

  return toResult(issues);
}

export function assertSafeDerivativeReference(derivative: DerivativeManifest, manifest: IngestManifest): void {
  const result = validateDerivativeReference(derivative, manifest);
  const blockingIssue = result.issues.find((issue) =>
    issue.code === "derivative.payload.embedded" ||
    issue.code === "derivative.storage.unsafe" ||
    issue.code === "derivative.failure.unsafe" ||
    issue.code === "derivative.tile.invalid"
  );

  if (blockingIssue) {
    throw new LargeImageIngestError(blockingIssue.code, blockingIssue.message, {
      derivativeId: blockingIssue.derivativeId,
      path: blockingIssue.path
    });
  }
}

export function assertValidTilePyramidDescriptor(tilePyramid: TilePyramidDescriptor, status: "planned" | "created" | "failed"): void {
  if (!tilePyramidIsValid(tilePyramid, status)) {
    throw new LargeImageIngestError("derivative.tile.invalid", "Invalid tile pyramid descriptor.");
  }
}

function createSourceIdentity(manifest: IngestManifest): DerivativeSourceIdentity {
  const identity: DerivativeSourceIdentity = {
    manifestId: manifest.id,
    schemaVersion: manifest.schemaVersion,
    fingerprint: { ...manifest.original.fingerprint },
    sizeBytes: manifest.original.sizeBytes,
    mediaType: manifest.original.mediaType
  };

  if (manifest.original.checksum) {
    identity.checksum = { ...manifest.original.checksum };
  }

  return identity;
}

function sourceIdentityMatches(identity: DerivativeSourceIdentity, manifest: IngestManifest): boolean {
  if (identity.manifestId !== manifest.id) {
    return false;
  }

  if (identity.schemaVersion !== manifest.schemaVersion) {
    return false;
  }

  if (identity.sizeBytes !== undefined && identity.sizeBytes !== manifest.original.sizeBytes) {
    return false;
  }

  if (identity.mediaType !== undefined && identity.mediaType !== manifest.original.mediaType) {
    return false;
  }

  if (identity.fingerprint && identity.fingerprint.value !== manifest.original.fingerprint.value) {
    return false;
  }

  if (identity.checksum && manifest.original.checksum && identity.checksum.value !== manifest.original.checksum.value) {
    return false;
  }

  return true;
}

function storageReferenceIsUnsafe(storage: DerivativeStorageReference): boolean {
  if (containsUnsafeValue(storage.locationHint) || containsUnsafeValue(storage.label)) {
    return true;
  }

  return containsUnsafeValue(storage.metadata);
}

function failureIsUnsafe(failure: { code: string; message: string }): boolean {
  return containsUnsafeValue(failure.code) || containsUnsafeValue(failure.message);
}

function containsUnsafeValue(value: unknown): boolean {
  if (typeof value === "string") {
    return UNSAFE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
  }

  if (Array.isArray(value)) {
    return value.some(containsUnsafeValue);
  }

  if (isRecord(value)) {
    return Object.entries(value).some(([key, currentValue]) => containsUnsafeValue(key) || containsUnsafeValue(currentValue));
  }

  return false;
}

function containsEmbeddedPayload(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsEmbeddedPayload);
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).some(([key, currentValue]) => {
    if (EMBEDDED_PAYLOAD_KEYS.has(key.toLowerCase())) {
      return true;
    }

    return containsEmbeddedPayload(currentValue);
  });
}

function tilePyramidIsValid(tilePyramid: TilePyramidDescriptor, status: "planned" | "created" | "failed"): boolean {
  if (tilePyramid.tileWidth !== undefined && !isPositiveSafeInteger(tilePyramid.tileWidth)) {
    return false;
  }

  if (tilePyramid.tileHeight !== undefined && !isPositiveSafeInteger(tilePyramid.tileHeight)) {
    return false;
  }

  if (status === "created" && tilePyramid.levels.length === 0) {
    return false;
  }

  return tilePyramid.levels.every(tileLevelIsValid);
}

function tileLevelIsValid(level: TilePyramidLevelDescriptor): boolean {
  if (!Number.isSafeInteger(level.level) || level.level < 0) {
    return false;
  }

  if (!isPositiveSafeInteger(level.width) || !isPositiveSafeInteger(level.height)) {
    return false;
  }

  if (!isPositiveSafeInteger(level.columns) || !isPositiveSafeInteger(level.rows)) {
    return false;
  }

  if (level.scale !== undefined && (!Number.isFinite(level.scale) || level.scale <= 0)) {
    return false;
  }

  return true;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function addIssue(
  issues: DerivativeValidationIssue[],
  code: DerivativeValidationIssueCode,
  message: string,
  path: string,
  severity: IngestIssueSeverity,
  derivativeId?: string
): void {
  const issue: DerivativeValidationIssue = {
    code,
    message,
    path,
    severity
  };

  if (derivativeId) {
    issue.derivativeId = derivativeId;
  }

  issues.push(issue);
}

function toResult(issues: DerivativeValidationIssue[]): DerivativeValidationResult {
  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}

function cloneDerivative(derivative: DerivativeManifest): DerivativeManifest {
  const cloned: DerivativeManifest = {
    id: derivative.id,
    kind: derivative.kind,
    status: derivative.status,
    source: derivative.source
  };

  assignOptional(cloned, "role", derivative.role);
  assignOptional(cloned, "mediaType", derivative.mediaType);
  assignOptional(cloned, "width", derivative.width);
  assignOptional(cloned, "height", derivative.height);
  assignOptional(cloned, "sizeBytes", derivative.sizeBytes);
  assignOptional(cloned, "checksum", derivative.checksum ? { ...derivative.checksum } : undefined);
  assignOptional(cloned, "sourceIdentity", derivative.sourceIdentity ? cloneSourceIdentity(derivative.sourceIdentity) : undefined);
  assignOptional(cloned, "storage", cloneStorage(derivative.storage));
  assignOptional(cloned, "provenance", derivative.provenance ? { ...derivative.provenance } : undefined);
  assignOptional(cloned, "failure", derivative.failure ? { ...derivative.failure } : undefined);
  assignOptional(cloned, "tilePyramid", cloneTilePyramid(derivative.tilePyramid));
  assignOptional(cloned, "metadata", derivative.metadata ? cloneUnknownRecord(derivative.metadata) : undefined);

  return cloned;
}

function cloneSourceIdentity(identity: DerivativeSourceIdentity): DerivativeSourceIdentity {
  const cloned: DerivativeSourceIdentity = {
    manifestId: identity.manifestId,
    schemaVersion: identity.schemaVersion
  };

  assignOptional(cloned, "fingerprint", identity.fingerprint ? { ...identity.fingerprint } : undefined);
  assignOptional(cloned, "checksum", identity.checksum ? { ...identity.checksum } : undefined);
  assignOptional(cloned, "sizeBytes", identity.sizeBytes);
  assignOptional(cloned, "mediaType", identity.mediaType);

  return cloned;
}

function cloneStorage(storage: DerivativeStorageReference | undefined): DerivativeStorageReference | undefined {
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

function cloneTilePyramid(tilePyramid: TilePyramidDescriptor | undefined): TilePyramidDescriptor | undefined {
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

function cloneOriginalManifest(manifest: IngestManifest): IngestManifest["original"] {
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

function cloneUploadManifest(manifest: IngestManifest): IngestManifest["upload"] {
  const upload: IngestManifest["upload"] = {
    status: manifest.upload.status,
    resumable: true,
    retryLimit: manifest.upload.retryLimit
  };

  assignOptional(upload, "transport", manifest.upload.transport ? { ...manifest.upload.transport } : undefined);

  return upload;
}

function cloneUnknownRecord<T>(value: T): T {
  return structuredClone(value) as T;
}

function assignOptional<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}
