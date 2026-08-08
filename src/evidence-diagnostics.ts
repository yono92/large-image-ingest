import type {
  EvidenceBundle,
  EvidenceSignatureVerification,
  InspectionMetadataValidationResult,
  InspectionPolicyReport,
  SignedEvidenceEnvelope
} from "./types.js";

export function createSafeMetadataValidationSummary(result: InspectionMetadataValidationResult) {
  return {
    ok: result.ok,
    profileId: result.profileId,
    profileVersion: result.profileVersion,
    issues: result.issues.map((issue) => ({ ...issue }))
  };
}

export function createSafeInspectionPolicySummary(report: InspectionPolicyReport) {
  return {
    schemaVersion: report.schemaVersion,
    producerVersion: report.producer.version,
    policy: { ...report.policy },
    manifestId: report.manifestId,
    ...(report.completionId ? { completionId: report.completionId } : {}),
    ok: report.ok,
    issues: report.issues.map((issue) => ({ ...issue })),
    evaluatedAt: report.evaluatedAt
  };
}

export function createSafeEvidenceBundleSummary(bundle: EvidenceBundle) {
  return {
    schemaVersion: bundle.schemaVersion,
    id: bundle.id,
    manifestId: bundle.manifestId,
    completionId: bundle.completionId,
    producerVersion: bundle.producer.version,
    createdAt: bundle.createdAt,
    completionStatus: bundle.completion.status,
    policy: bundle.policyReport
      ? { id: bundle.policyReport.policy.id, version: bundle.policyReport.policy.version, ok: bundle.policyReport.ok }
      : undefined,
    redactions: {
      fields: ["bundle.manifest", "bundle.completion", "bundle.policyReport.issues"]
    }
  };
}

export function createSafeSignedEvidenceSummary(envelope: SignedEvidenceEnvelope) {
  return {
    schemaVersion: envelope.schemaVersion,
    bundle: createSafeEvidenceBundleSummary(envelope.bundle),
    digestAlgorithm: envelope.payloadDigest.algorithm,
    signatureAlgorithm: envelope.signature.algorithm,
    keyId: envelope.signature.keyId,
    signedAt: envelope.signature.signedAt,
    redactions: { fields: ["envelope.payloadDigest.value", "envelope.signature.value"] }
  };
}

export function createSafeEvidenceVerificationSummary(result: EvidenceSignatureVerification) {
  return {
    trusted: result.trusted,
    digestValid: result.digestValid,
    signatureValid: result.signatureValid,
    bundleId: result.bundle?.id,
    issues: result.issues.map((issue) => ({ ...issue }))
  };
}
