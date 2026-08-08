import { describe, expect, it } from "vitest";
import {
  createSafeEvidenceBundleSummary,
  createSafeEvidenceVerificationSummary,
  createSafeInspectionPolicySummary,
  createSafeMetadataValidationSummary,
  createSafeSignedEvidenceSummary
} from "../src/evidence-diagnostics";
import { createEvidenceBundle, signEvidenceBundle, verifySignedEvidenceEnvelope } from "../src/evidence-bundle";
import { SEMICONDUCTOR_WAFER_PROFILE_V1, validateInspectionMetadata } from "../src/inspection-profile";
import { EVIDENCE_GRADE_INSPECTION_POLICY_V1, evaluateInspectionPolicy } from "../src/inspection-policy";
import { createPolicyFixture } from "./inspection-fixtures";

describe("inspection evidence diagnostics", () => {
  it("allowlists profile, policy, bundle, signature, and verification facts", async () => {
    const metadata = {
      lotId: "SECRET LOT VALUE",
      waferId: 12,
      inspectionId: "INS-1",
      toolId: "AOI-1"
    };
    const metadataReport = validateInspectionMetadata(metadata, SEMICONDUCTOR_WAFER_PROFILE_V1);
    const { manifest, verified } = await createPolicyFixture();
    const checksum = verified.source.checksum?.value ?? "";
    manifest.metadata.privateUrl = "https://secret.invalid/audit";
    const policyReport = evaluateInspectionPolicy({
      manifest,
      completion: verified,
      policy: EVIDENCE_GRADE_INSPECTION_POLICY_V1
    });
    const bundle = createEvidenceBundle({ manifest, completion: verified, policyReport });
    const envelope = await signEvidenceBundle(bundle, {
      algorithm: "test",
      keyId: "audit-key",
      sign: () => new Uint8Array([7, 7, 7])
    });
    const verification = await verifySignedEvidenceEnvelope(envelope, { verify: () => true });
    const serialized = JSON.stringify({
      metadata: createSafeMetadataValidationSummary(metadataReport),
      policy: createSafeInspectionPolicySummary(policyReport),
      bundle: createSafeEvidenceBundleSummary(bundle),
      envelope: createSafeSignedEvidenceSummary(envelope),
      verification: createSafeEvidenceVerificationSummary(verification)
    });

    expect(serialized).not.toContain("SECRET LOT VALUE");
    expect(serialized).not.toContain("secret.invalid");
    expect(serialized).not.toContain(checksum);
    expect(serialized).not.toContain(envelope.signature.value);
    expect(serialized).toContain("audit-key");
    expect(serialized).toContain("evidence-grade-semiconductor-inspection");
  });
});
