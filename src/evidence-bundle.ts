import { calculateChecksum } from "./checksum.js";
import { validateCompletionEvidence } from "./completion-evidence.js";
import type {
  CreateEvidenceBundleInput,
  EvidenceBundle,
  EvidenceBundleDigest,
  EvidenceBundleSigner,
  EvidenceBundleVerifier,
  EvidenceExportIssueCode,
  EvidenceSignatureVerification,
  IngestCompletionEvidence,
  InspectionPolicyReport,
  SignedEvidenceEnvelope
} from "./types.js";
import { LARGE_IMAGE_INGEST_VERSION } from "./version.js";
import { validateManifestStructure } from "./verification.js";

const BUNDLE_SCHEMA_VERSION = "large-image-ingest.evidence-bundle.v1" as const;
const ENVELOPE_SCHEMA_VERSION = "large-image-ingest.signed-evidence.v1" as const;
const textEncoder = new TextEncoder();

export class EvidenceExportError extends Error {
  readonly retryable = false;

  constructor(readonly code: EvidenceExportIssueCode, message: string) {
    super(message);
    this.name = "EvidenceExportError";
  }
}

export function createEvidenceBundle(input: CreateEvidenceBundleInput): EvidenceBundle {
  if (!validateManifestStructure(input.manifest).ok) {
    throw bundleError("evidence.bundle_invalid", "The evidence bundle manifest is invalid.");
  }
  const completion = parseLinkedCompletion(input.manifest.id, input.completion);
  if (input.policyReport) validatePolicyReportLink(input.policyReport, input.manifest.id, completion.id);

  let bundle: EvidenceBundle;
  try {
    bundle = structuredClone({
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      producer: { name: "large-image-ingest", version: LARGE_IMAGE_INGEST_VERSION },
      id: input.id ?? createBundleId(),
      manifestId: input.manifest.id,
      completionId: completion.id,
      createdAt: input.createdAt ?? new Date().toISOString(),
      manifest: input.manifest,
      completion,
      ...(input.policyReport ? { policyReport: input.policyReport } : {})
    });
  } catch {
    throw bundleError("evidence.bundle_invalid", "The evidence bundle contains non-cloneable data.");
  }
  canonicalizeEvidenceBundle(bundle);
  return deepFreeze(bundle);
}

export function parseEvidenceBundle(value: unknown): EvidenceBundle {
  if (!isRecord(value) || value.schemaVersion !== BUNDLE_SCHEMA_VERSION) throw invalidBundle();
  if (
    !hasOnlyKeys(value, [
      "schemaVersion", "producer", "id", "manifestId", "completionId", "createdAt",
      "manifest", "completion", "policyReport"
    ]) ||
    !isProducer(value.producer) || !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.manifestId) || !isNonEmptyString(value.completionId) ||
    !isIsoTimestamp(value.createdAt) || !isRecord(value.manifest) ||
    value.manifest.schemaVersion !== "large-image-ingest.manifest.v1" ||
    value.manifest.id !== value.manifestId
  ) throw invalidBundle();

  if (!validateManifestStructure(value.manifest as unknown as import("./types.js").IngestManifest).ok) {
    throw invalidBundle();
  }

  const completion = parseLinkedCompletion(value.manifestId, value.completion);
  if (completion.id !== value.completionId) throw mismatchBundle();
  if (value.policyReport !== undefined) {
    validatePolicyReportLink(value.policyReport as InspectionPolicyReport, value.manifestId, value.completionId);
  }
  let cloned: EvidenceBundle;
  try {
    cloned = structuredClone(value) as unknown as EvidenceBundle;
  } catch {
    throw invalidBundle();
  }
  canonicalizeEvidenceBundle(cloned);
  return deepFreeze(cloned);
}

export function canonicalizeEvidenceBundle(bundle: EvidenceBundle): Uint8Array {
  let canonical: string;
  try {
    canonical = canonicalJson(bundle, new Set<object>());
  } catch {
    throw bundleError(
      "evidence.canonicalization_failed",
      "The evidence bundle cannot be represented as canonical JSON."
    );
  }
  return textEncoder.encode(canonical);
}

export async function createEvidenceBundleDigest(
  bundle: EvidenceBundle
): Promise<EvidenceBundleDigest> {
  const payload = canonicalizeEvidenceBundle(parseEvidenceBundle(bundle));
  const payloadBuffer = new ArrayBuffer(payload.byteLength);
  new Uint8Array(payloadBuffer).set(payload);
  const blob = new Blob([payloadBuffer], { type: "application/json" }) as Blob & { name: string };
  Object.defineProperty(blob, "name", { value: "evidence-bundle.json" });
  const checksum = await calculateChecksum(blob);
  return { algorithm: "sha256", value: checksum.value };
}

export async function signEvidenceBundle(
  bundle: EvidenceBundle,
  signer: EvidenceBundleSigner
): Promise<SignedEvidenceEnvelope> {
  if (!isNonEmptyString(signer.algorithm) || !isNonEmptyString(signer.keyId)) {
    throw signatureError();
  }
  const parsed = parseEvidenceBundle(bundle);
  const payload = canonicalizeEvidenceBundle(parsed);
  const digest = await createEvidenceBundleDigest(parsed);
  let signature: Uint8Array;
  try {
    const result = await signer.sign(payload.slice());
    if (!(result instanceof Uint8Array) || result.byteLength === 0) throw new Error();
    signature = result.slice();
  } catch {
    throw bundleError("evidence.signature_failed", "Evidence signing failed.");
  }
  return deepFreeze({
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    bundle: parsed,
    payloadDigest: digest,
    signature: {
      algorithm: signer.algorithm,
      keyId: signer.keyId,
      value: encodeBase64Url(signature),
      signedAt: new Date().toISOString()
    }
  });
}

export async function verifySignedEvidenceEnvelope(
  envelope: unknown,
  verifier: EvidenceBundleVerifier
): Promise<EvidenceSignatureVerification> {
  let parsed: SignedEvidenceEnvelope;
  try {
    parsed = parseSignedEvidenceEnvelope(envelope);
  } catch {
    return verificationResult(false, false, false, [verificationIssue("evidence.signature_invalid", "envelope")]);
  }

  const expectedDigest = await createEvidenceBundleDigest(parsed.bundle);
  const digestValid = constantTimeEqualHex(expectedDigest.value, parsed.payloadDigest.value);
  if (!digestValid) {
    return verificationResult(false, false, false, [
      verificationIssue("evidence.signature_invalid", "payloadDigest")
    ], parsed.bundle);
  }

  const payload = canonicalizeEvidenceBundle(parsed.bundle);
  const signature = decodeBase64Url(parsed.signature.value);
  let signatureValid = false;
  try {
    signatureValid = await verifier.verify({
      algorithm: parsed.signature.algorithm,
      keyId: parsed.signature.keyId,
      payload: payload.slice(),
      signature: signature.slice()
    });
  } catch {
    return verificationResult(false, true, false, [
      verificationIssue("evidence.signature_failed", "signature")
    ], parsed.bundle);
  }

  return verificationResult(
    signatureValid,
    true,
    signatureValid,
    signatureValid ? [] : [verificationIssue("evidence.signature_invalid", "signature")],
    parsed.bundle
  );
}

export function parseSignedEvidenceEnvelope(value: unknown): SignedEvidenceEnvelope {
  if (!isRecord(value) || value.schemaVersion !== ENVELOPE_SCHEMA_VERSION) throw signatureError();
  if (
    !hasOnlyKeys(value, ["schemaVersion", "bundle", "payloadDigest", "signature"]) ||
    !isRecord(value.payloadDigest) ||
    !hasOnlyKeys(value.payloadDigest, ["algorithm", "value"]) ||
    value.payloadDigest.algorithm !== "sha256" ||
    typeof value.payloadDigest.value !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.payloadDigest.value) ||
    !isRecord(value.signature) ||
    !hasOnlyKeys(value.signature, ["algorithm", "keyId", "value", "signedAt"]) ||
    !isNonEmptyString(value.signature.algorithm) ||
    !isNonEmptyString(value.signature.keyId) ||
    !isNonEmptyString(value.signature.value) ||
    !isIsoTimestamp(value.signature.signedAt)
  ) throw signatureError();
  decodeBase64Url(value.signature.value);
  const bundle = parseEvidenceBundle(value.bundle);
  return deepFreeze({
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    bundle,
    payloadDigest: { algorithm: "sha256", value: value.payloadDigest.value },
    signature: {
      algorithm: value.signature.algorithm,
      keyId: value.signature.keyId,
      value: value.signature.value,
      signedAt: value.signature.signedAt
    }
  });
}

function canonicalJson(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error();
    return JSON.stringify(value);
  }
  if (typeof value !== "object") throw new Error();
  if (ancestors.has(value)) throw new Error();
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalJson(item, ancestors)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error();
    if (Object.getOwnPropertySymbols(value).length > 0) throw new Error();
    return `{${Object.keys(value).sort().map((key) => {
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined) throw new Error();
      return `${JSON.stringify(key)}:${canonicalJson(child, ancestors)}`;
    }).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function parseLinkedCompletion(manifestId: string, value: unknown): IngestCompletionEvidence {
  const result = validateCompletionEvidence(value);
  if (!result.ok) throw invalidBundle();
  if (result.evidence.manifest.id !== manifestId) throw mismatchBundle();
  return result.evidence;
}

function validatePolicyReportLink(report: InspectionPolicyReport, manifestId: string, completionId: string): void {
  if (
    !isRecord(report) ||
    report.schemaVersion !== "large-image-ingest.inspection-policy-report.v1" ||
    report.manifestId !== manifestId ||
    (report.completionId !== undefined && report.completionId !== completionId) ||
    typeof report.ok !== "boolean" || !Array.isArray(report.issues)
  ) throw mismatchBundle();
}

function verificationResult(
  trusted: boolean,
  digestValid: boolean,
  signatureValid: boolean,
  issues: EvidenceSignatureVerification["issues"],
  bundle?: EvidenceBundle
): EvidenceSignatureVerification {
  return deepFreeze({
    trusted,
    digestValid,
    signatureValid,
    ...(bundle ? { bundle } : {}),
    issues: [...issues]
  });
}

function verificationIssue(code: EvidenceExportIssueCode, path: string) {
  return { code, path, severity: "error" as const };
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw signatureError();
  const padding = "=".repeat((4 - value.length % 4) % 4);
  let binary: string;
  try {
    binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
  } catch {
    throw signatureError();
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (encodeBase64Url(bytes) !== value) throw signatureError();
  return bytes;
}

function constantTimeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function invalidBundle(): EvidenceExportError {
  return bundleError("evidence.bundle_invalid", "The evidence bundle is invalid.");
}

function mismatchBundle(): EvidenceExportError {
  return bundleError("evidence.bundle_mismatch", "Evidence bundle identities do not match.");
}

function signatureError(): EvidenceExportError {
  return bundleError("evidence.signature_invalid", "The evidence signature is invalid.");
}

function bundleError(code: EvidenceExportIssueCode, message: string): EvidenceExportError {
  return new EvidenceExportError(code, message);
}

function createBundleId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `evidence_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isProducer(value: unknown): boolean {
  return isRecord(value) && value.name === "large-image-ingest" && isNonEmptyString(value.version);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
