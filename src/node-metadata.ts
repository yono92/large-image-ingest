import {
  assertSafeDerivativeReference,
  assertValidTilePyramidDescriptor,
  createDerivativeReference
} from "./derivatives.js";
import type {
  CreateMetadataDerivativeInput,
  CreateTilePyramidDerivativeInput,
  DerivativeManifest,
  DerivativeMetadata,
  TilePyramidDescriptor
} from "./types.js";

export function createMetadataDerivative(input: CreateMetadataDerivativeInput): DerivativeManifest {
  const metadata: DerivativeMetadata = {};

  assignOptional(metadata, "format", input.format);
  assignOptional(metadata, "width", input.width);
  assignOptional(metadata, "height", input.height);
  assignOptional(metadata, "colorDepth", input.colorDepth);
  assignOptional(metadata, "channels", input.channels);
  assignOptional(metadata, "tilePyramid", input.tilePyramid);

  if (metadata.tilePyramid) {
    assertValidTilePyramidDescriptor(metadata.tilePyramid, input.status);
  }

  const derivative = createDerivativeReference({
    ...input,
    kind: "metadata",
    metadata
  });

  assertSafeDerivativeReference(derivative, input.manifest);

  return derivative;
}

export function createTilePyramidDerivative(input: CreateTilePyramidDerivativeInput): DerivativeManifest {
  const tilePyramid: TilePyramidDescriptor = {
    levels: input.levels ?? []
  };

  assignOptional(tilePyramid, "tileWidth", input.tileWidth);
  assignOptional(tilePyramid, "tileHeight", input.tileHeight);
  assignOptional(tilePyramid, "storage", input.storage);

  assertValidTilePyramidDescriptor(tilePyramid, input.status);

  const derivative = createDerivativeReference({
    ...input,
    kind: "tile",
    tilePyramid
  });

  assertSafeDerivativeReference(derivative, input.manifest);

  return derivative;
}

function assignOptional<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}
