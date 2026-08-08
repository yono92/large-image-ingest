import {
  signEvidenceBundle,
  verifySignedEvidenceEnvelope,
  type EvidenceBundle,
  type SignedEvidenceEnvelope
} from "large-image-ingest/core";

export function signWithWebCrypto(
  bundle: EvidenceBundle,
  privateKey: CryptoKey,
  keyId: string
): Promise<SignedEvidenceEnvelope> {
  return signEvidenceBundle(bundle, {
    algorithm: "ECDSA-P256-SHA256",
    keyId,
    async sign(payload) {
      const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        privateKey,
        toArrayBuffer(payload)
      );
      return new Uint8Array(signature);
    }
  });
}

export function verifyWithWebCrypto(
  envelope: unknown,
  resolvePublicKey: (keyId: string) => Promise<CryptoKey | undefined>
) {
  return verifySignedEvidenceEnvelope(envelope, {
    async verify({ algorithm, keyId, payload, signature }) {
      if (algorithm !== "ECDSA-P256-SHA256") return false;
      const publicKey = await resolvePublicKey(keyId);
      if (!publicKey) return false;
      return crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        toArrayBuffer(signature),
        toArrayBuffer(payload)
      );
    }
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
