import {
  assertSafeDerivativeReference,
  createDerivativeReference
} from "./derivatives.js";
import type {
  CreatePreviewDerivativeInput,
  DerivativeManifest
} from "./types.js";

export function createPreviewDerivative(input: CreatePreviewDerivativeInput): DerivativeManifest {
  const derivative = createDerivativeReference({
    ...input,
    kind: input.kind
  });

  assertSafeDerivativeReference(derivative, input.manifest);

  return derivative;
}
