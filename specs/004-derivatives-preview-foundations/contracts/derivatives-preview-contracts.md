# Contracts: 1.2.0 Derivatives And Preview Foundations

Draft TypeScript contract direction for additive 1.2.0 APIs. Final names may be adjusted during task generation, but behavior should remain aligned with this contract.

## Derivative Reference Types

```ts
export type DerivativeKind = "preview" | "thumbnail" | "tile" | "metadata" | "custom";

export type DerivativeStatus = "planned" | "created" | "failed";

export interface DerivativeStorageReference {
  kind: "object" | "url" | "path" | "inline-reference" | "custom";
  label?: string;
  locationHint?: string;
  metadata?: Record<string, unknown>;
}

export interface DerivativeSourceIdentity {
  manifestId: string;
  schemaVersion: IngestManifestSchemaVersion;
  fingerprint?: OriginalImageManifest["fingerprint"];
  checksum?: FileChecksum;
  sizeBytes?: number;
  mediaType?: string;
}

export interface DerivativeProvenance {
  generator?: string;
  generatorVersion?: string;
  parametersLabel?: string;
  environment?: "browser" | "server" | "external" | "custom";
}

export interface DerivativeFailure {
  code: string;
  message: string;
  retryable?: boolean;
}
```

Contract rules:

- Existing `DerivativeManifest` entries remain readable.
- New fields should be additive where possible.
- Storage references are hints or application-owned locators, not credential containers.
- Public contracts must not require derivative binary payloads.

## Derivative Helpers

```ts
export interface CreateDerivativeReferenceInput {
  manifest: IngestManifest;
  id?: string;
  kind: DerivativeKind;
  status: DerivativeStatus;
  role?: string;
  mediaType?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  checksum?: FileChecksum;
  storage?: DerivativeStorageReference;
  provenance?: DerivativeProvenance;
  failure?: DerivativeFailure;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttachDerivativeOptions {
  replaceExisting?: boolean;
}

export function createDerivativeReference(input: CreateDerivativeReferenceInput): DerivativeManifest;

export function attachDerivative(
  manifest: IngestManifest,
  derivative: DerivativeManifest,
  options?: AttachDerivativeOptions
): IngestManifest;
```

Contract rules:

- `createDerivativeReference` captures the source identity from the provided manifest.
- `attachDerivative` returns a manifest with updated derivatives and must not mutate the source manifest.
- Adding or replacing a derivative must not change `manifest.original`, `manifest.image`, `manifest.chunking`, `manifest.upload`, or `manifest.validation` unless a future task explicitly adds derivative-validation aggregation.
- Duplicate IDs should be rejected unless `replaceExisting` is explicitly enabled.

## Derivative Validation

```ts
export interface DerivativeValidationOptions {
  strictSourceIdentity?: boolean;
  allowUnsafeLocationHints?: boolean;
  requiredDerivativeIds?: readonly string[];
}

export interface DerivativeValidationIssue {
  code:
    | "derivative.id.missing"
    | "derivative.kind.unsupported"
    | "derivative.status.invalid"
    | "derivative.source.missing"
    | "derivative.source.mismatch"
    | "derivative.storage.unsafe"
    | "derivative.payload.embedded"
    | "derivative.failure.unsafe"
    | "derivative.tile.invalid"
    | "derivative.required.missing";
  message: string;
  path?: string;
  severity: IngestIssueSeverity;
  derivativeId?: string;
}

export interface DerivativeValidationResult {
  ok: boolean;
  issues: readonly DerivativeValidationIssue[];
}

export function validateDerivativeReference(
  derivative: DerivativeManifest,
  manifest: IngestManifest,
  options?: DerivativeValidationOptions
): DerivativeValidationResult;

export function validateManifestDerivatives(
  manifest: IngestManifest,
  options?: DerivativeValidationOptions
): DerivativeValidationResult;
```

Contract rules:

- Validation must not mutate the manifest.
- Optional derivative failures should not invalidate original file validation.
- Required missing derivatives should be reported through derivative validation, not by mutating original validation results.
- Validation output must be safe for logs.

## Preview And Thumbnail Descriptors

```ts
export interface CreatePreviewDerivativeInput {
  manifest: IngestManifest;
  id?: string;
  kind: "preview" | "thumbnail";
  status: DerivativeStatus;
  mediaType?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  checksum?: FileChecksum;
  storage?: DerivativeStorageReference;
  provenance?: DerivativeProvenance;
  failure?: DerivativeFailure;
}

export function createPreviewDerivative(input: CreatePreviewDerivativeInput): DerivativeManifest;
```

Contract rules:

- Preview helpers must accept caller-provided descriptors and must not read, decode, rewrite, or embed original file bytes by default.
- Planned previews may omit storage and checksum.
- Created previews should include a storage reference or caller-owned locator.
- Failed previews should carry safe failure information and preserve original manifest validity.

## Tile Pyramid Descriptor

```ts
export interface TilePyramidLevelDescriptor {
  level: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  scale?: number;
  storage?: DerivativeStorageReference;
}

export interface CreateTilePyramidDerivativeInput {
  manifest: IngestManifest;
  id?: string;
  status: DerivativeStatus;
  mediaType?: string;
  tileWidth?: number;
  tileHeight?: number;
  levels?: readonly TilePyramidLevelDescriptor[];
  storage?: DerivativeStorageReference;
  provenance?: DerivativeProvenance;
  failure?: DerivativeFailure;
}

export function createTilePyramidDerivative(input: CreateTilePyramidDerivativeInput): DerivativeManifest;
```

Contract rules:

- Tile pyramid derivatives store level metadata and references only.
- Tile binary payloads must remain outside the manifest.
- Created tile pyramids must include valid tile dimensions and at least one level.

## Metadata Enrichment

```ts
export interface CreateMetadataDerivativeInput {
  manifest: IngestManifest;
  id?: string;
  status: DerivativeStatus;
  format?: string;
  width?: number;
  height?: number;
  colorDepth?: number;
  channels?: number;
  tilePyramid?: CreateTilePyramidDerivativeInput;
  provenance?: DerivativeProvenance;
  failure?: DerivativeFailure;
}

export function createMetadataDerivative(input: CreateMetadataDerivativeInput): DerivativeManifest;
```

Contract rules:

- Metadata enrichment records describe extracted information and provenance.
- Metadata enrichment must not silently rewrite original bytes or strip EXIF.
- Server-only extraction helpers, if added, should be exported from the Node subpath rather than core.
