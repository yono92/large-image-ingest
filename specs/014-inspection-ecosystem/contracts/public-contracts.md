# Public Contract: Inspection Ecosystem

```ts
compileInspectionMetadataProfile(value: unknown): InspectionMetadataProfile;
validateInspectionMetadata(metadata: unknown, profile: InspectionMetadataProfile): InspectionMetadataValidationResult;

parseInspectionPolicyPack(value: unknown): InspectionPolicyPack;
evaluateInspectionPolicy(input: EvaluateInspectionPolicyInput): InspectionPolicyReport;

createEvidenceBundle(input: CreateEvidenceBundleInput): EvidenceBundle;
canonicalizeEvidenceBundle(bundle: EvidenceBundle): Uint8Array;
createEvidenceBundleDigest(bundle: EvidenceBundle): Promise<FileChecksum>;
signEvidenceBundle(bundle: EvidenceBundle, signer: EvidenceBundleSigner): Promise<SignedEvidenceEnvelope>;
verifySignedEvidenceEnvelope(envelope: unknown, verifier: EvidenceBundleVerifier): Promise<EvidenceSignatureVerification>;
```

Built-ins:

```ts
SEMICONDUCTOR_WAFER_PROFILE_V1
INDUSTRIAL_INSPECTION_PROFILE_V1
EVIDENCE_GRADE_INSPECTION_POLICY_V1
```

New typed issue namespaces: `profile.*`, `policy.*`, `evidence.bundle_*`, and `evidence.signature_*`.
