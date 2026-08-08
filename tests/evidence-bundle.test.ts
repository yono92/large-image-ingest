import { describe, expect, it } from "vitest";
import {
  canonicalizeEvidenceBundle,
  createEvidenceBundle,
  createEvidenceBundleDigest,
  parseEvidenceBundle,
  parseSignedEvidenceEnvelope,
  signEvidenceBundle,
  verifySignedEvidenceEnvelope
} from "../src/evidence-bundle";
import { EVIDENCE_GRADE_INSPECTION_POLICY_V1, evaluateInspectionPolicy } from "../src/inspection-policy";
import { createPolicyFixture } from "./inspection-fixtures";

describe("canonical evidence bundles", () => {
  it("creates detached linked bundles with stable canonical bytes and digests", async () => {
    const { manifest, verified } = await createPolicyFixture();
    const report = evaluateInspectionPolicy({
      manifest,
      completion: verified,
      policy: EVIDENCE_GRADE_INSPECTION_POLICY_V1,
      evaluatedAt: "2026-08-07T00:00:00.000Z"
    });
    const bundle = createEvidenceBundle({
      manifest,
      completion: verified,
      policyReport: report,
      id: "bundle-1",
      createdAt: "2026-08-07T00:00:00.000Z"
    });
    const reordered = structuredClone(bundle);
    reordered.manifest.metadata = {
      toolId: manifest.metadata.toolId,
      inspectionId: manifest.metadata.inspectionId,
      waferId: manifest.metadata.waferId,
      lotId: manifest.metadata.lotId
    };

    expect(canonicalizeEvidenceBundle(reordered)).toEqual(canonicalizeEvidenceBundle(bundle));
    expect(await createEvidenceBundleDigest(reordered)).toEqual(await createEvidenceBundleDigest(bundle));
    const unicode = structuredClone(bundle);
    unicode.manifest.metadata.unicodeLabel = "웨이퍼-검사-🔬";
    expect(new TextDecoder().decode(canonicalizeEvidenceBundle(unicode)))
      .toContain("웨이퍼-검사-🔬");
    expect(parseEvidenceBundle(bundle)).toEqual(bundle);
    expect(Object.isFrozen(bundle)).toBe(true);
    manifest.metadata.lotId = "MUTATED";
    expect(bundle.manifest.metadata.lotId).toBe("LOT-001");
  });

  it("rejects identity mismatch, undefined, non-finite values, symbols, and cycles", async () => {
    const { manifest, verified } = await createPolicyFixture();
    const mismatch = structuredClone(verified);
    mismatch.manifest.id = "another-manifest";
    expect(() => createEvidenceBundle({ manifest, completion: mismatch }))
      .toThrow(expect.objectContaining({ code: "evidence.bundle_mismatch" }));
    const invalidManifest = structuredClone(manifest) as unknown as Record<string, unknown>;
    delete invalidManifest.chunking;
    expect(() => createEvidenceBundle({ manifest: invalidManifest as never, completion: verified }))
      .toThrow(expect.objectContaining({ code: "evidence.bundle_invalid" }));

    const bundle = createEvidenceBundle({ manifest, completion: verified });
    for (const invalid of [undefined, Number.NaN, Number.POSITIVE_INFINITY, 1n]) {
      const changed = structuredClone(bundle) as unknown as Record<string, unknown>;
      (changed.manifest as { metadata: Record<string, unknown> }).metadata.invalid = invalid;
      expect(() => canonicalizeEvidenceBundle(changed as never))
        .toThrow(expect.objectContaining({ code: "evidence.canonicalization_failed" }));
    }
    const cyclic = structuredClone(bundle) as unknown as Record<string, unknown>;
    (cyclic.manifest as { metadata: Record<string, unknown> }).metadata.cycle = cyclic;
    expect(() => canonicalizeEvidenceBundle(cyclic as never))
      .toThrow(expect.objectContaining({ code: "evidence.canonicalization_failed" }));
  });

  it("signs and verifies canonical bytes through application-owned callbacks", async () => {
    const { manifest, verified } = await createPolicyFixture();
    const bundle = createEvidenceBundle({ manifest, completion: verified });
    let signedPayload: Uint8Array | undefined;
    const envelope = await signEvidenceBundle(bundle, {
      algorithm: "test-signature-v1",
      keyId: "audit-key-1",
      sign(payload) {
        signedPayload = payload.slice();
        payload.fill(0);
        return new Uint8Array([1, 2, 3, 4]);
      }
    });
    expect(signedPayload).toEqual(canonicalizeEvidenceBundle(bundle));
    expect(parseSignedEvidenceEnvelope(envelope)).toEqual(envelope);

    const verifiedResult = await verifySignedEvidenceEnvelope(envelope, {
      verify(input) {
        input.payload.fill(0);
        input.signature.fill(0);
        return input.algorithm === "test-signature-v1" && input.keyId === "audit-key-1";
      }
    });
    expect(verifiedResult).toMatchObject({ trusted: true, digestValid: true, signatureValid: true });
  });

  it("rejects digest/signature tampering and normalizes callback failures without leaks", async () => {
    const { manifest, verified } = await createPolicyFixture();
    const envelope = await signEvidenceBundle(createEvidenceBundle({ manifest, completion: verified }), {
      algorithm: "test",
      keyId: "key",
      sign: () => new Uint8Array([9, 8, 7])
    });
    const badDigest = structuredClone(envelope);
    badDigest.payloadDigest.value = "0".repeat(64);
    let verifierCalls = 0;
    const digestResult = await verifySignedEvidenceEnvelope(badDigest, {
      verify() { verifierCalls += 1; return true; }
    });
    expect(digestResult).toMatchObject({ trusted: false, digestValid: false });
    expect(verifierCalls).toBe(0);

    const malformed = structuredClone(envelope);
    malformed.signature.value = "not+base64";
    await expect(verifySignedEvidenceEnvelope(malformed, { verify: () => true }))
      .resolves.toMatchObject({ trusted: false, digestValid: false });

    const badSignature = structuredClone(envelope);
    badSignature.signature.value = "AQ";
    const signatureResult = await verifySignedEvidenceEnvelope(badSignature, {
      verify({ signature }) {
        return signature.length === 3 && signature[0] === 9 && signature[1] === 8 && signature[2] === 7;
      }
    });
    expect(signatureResult).toMatchObject({
      trusted: false,
      digestValid: true,
      signatureValid: false
    });

    const failure = await verifySignedEvidenceEnvelope(envelope, {
      verify() { throw new Error("private key https://secret.invalid"); }
    });
    expect(failure).toMatchObject({ trusted: false, digestValid: true, signatureValid: false });
    expect(JSON.stringify(failure)).not.toContain("secret.invalid");

    const signError = await signEvidenceBundle(envelope.bundle, {
      algorithm: "test",
      keyId: "key",
      sign() { throw new Error("HSM secret"); }
    }).catch((error: unknown) => error);
    expect(signError).toMatchObject({ code: "evidence.signature_failed" });
    expect(JSON.stringify(signError)).not.toContain("HSM secret");
  });
});
