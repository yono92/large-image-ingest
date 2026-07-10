import { describe, expect, it } from "vitest";
import {
  attachDerivative,
  createDerivativeReference,
  validateDerivativeReference,
  validateManifestDerivatives
} from "../src/derivatives";
import { createManifest } from "../src/manifest";
import type { DerivativeManifest } from "../src/types";

async function createInspectionManifest(name = "wafer-aoi-001.tif") {
  return createManifest(new File(["inspection-data"], name, { type: "image/tiff" }), {
    checksum: false,
    image: {
      format: "tiff",
      width: 4096,
      height: 4096,
      colorDepth: 16
    }
  });
}

describe("derivative references", () => {
  it("attaches derivatives without mutating original manifest identity", async () => {
    const manifest = await createInspectionManifest();
    const original = structuredClone(manifest.original);

    const preview = createDerivativeReference({
      manifest,
      id: "preview-512",
      kind: "preview",
      status: "created",
      mediaType: "image/jpeg",
      width: 512,
      height: 512,
      storage: {
        kind: "object",
        label: "preview-store",
        locationHint: "previews/wafer-aoi-001-512.jpg"
      }
    });

    const attached = attachDerivative(manifest, preview);

    expect(attached).not.toBe(manifest);
    expect(manifest.derivatives).toEqual([]);
    expect(attached.derivatives).toHaveLength(1);
    expect(attached.derivatives[0]).toMatchObject({
      id: "preview-512",
      kind: "preview",
      status: "created",
      source: "original",
      sourceIdentity: {
        manifestId: manifest.id,
        sizeBytes: manifest.original.sizeBytes,
        mediaType: manifest.original.mediaType
      }
    });
    expect(attached.original).toEqual(original);
    expect(attached.original.fingerprint).toEqual(manifest.original.fingerprint);
    expect(attached.original.preservation).toEqual({
      required: true,
      allowedMutations: []
    });
  });

  it("rejects duplicate derivative IDs unless replacement is explicit", async () => {
    const manifest = await createInspectionManifest();
    const first = createDerivativeReference({
      manifest,
      id: "preview-512",
      kind: "preview",
      status: "planned"
    });
    const replacement = createDerivativeReference({
      manifest,
      id: "preview-512",
      kind: "preview",
      status: "failed",
      failure: {
        code: "preview.failed",
        message: "Preview generation failed."
      }
    });

    const attached = attachDerivative(manifest, first);

    expect(() => attachDerivative(attached, replacement)).toThrow(/duplicate derivative id/i);

    const replaced = attachDerivative(attached, replacement, { replaceExisting: true });
    expect(replaced.derivatives).toHaveLength(1);
    expect(replaced.derivatives[0]?.status).toBe("failed");
    expect(attached.derivatives[0]?.status).toBe("planned");
  });

  it("reports derivative validation issues without mutating the manifest", async () => {
    const manifest = await createInspectionManifest();
    const otherManifest = await createInspectionManifest("other-wafer.tif");
    const original = structuredClone(manifest);
    const valid = createDerivativeReference({
      manifest,
      id: "preview-512",
      kind: "preview",
      status: "created",
      storage: {
        kind: "url",
        locationHint: "https://cdn.example.test/previews/preview-512.jpg"
      }
    });

    const cases: Array<[DerivativeManifest, string]> = [
      [{ ...valid, source: undefined as never }, "derivative.source.missing"],
      [{ ...valid, kind: "poster" as never }, "derivative.kind.unsupported"],
      [{ ...valid, status: "ready" as never }, "derivative.status.invalid"],
      [
        {
          ...valid,
          sourceIdentity: {
            ...valid.sourceIdentity!,
            manifestId: otherManifest.id
          }
        },
        "derivative.source.mismatch"
      ],
      [
        {
          ...valid,
          storage: {
            kind: "url",
            locationHint: "https://cdn.example.test/preview.jpg?X-Amz-Signature=secret"
          }
        },
        "derivative.storage.unsafe"
      ],
      [
        {
          ...valid,
          storage: {
            kind: "custom",
            metadata: {
              bytes: "embedded-image-payload"
            }
          }
        },
        "derivative.payload.embedded"
      ]
    ];

    for (const [derivative, code] of cases) {
      expect(validateDerivativeReference(derivative, manifest).issues.map((issue) => issue.code)).toContain(code);
    }

    expect(validateManifestDerivatives(manifest, { requiredDerivativeIds: ["preview-512"] })).toEqual({
      ok: false,
      issues: [
        {
          code: "derivative.required.missing",
          message: "Required derivative is missing.",
          path: "derivatives",
          severity: "error",
          derivativeId: "preview-512"
        }
      ]
    });
    expect(manifest).toEqual(original);
  });
});
