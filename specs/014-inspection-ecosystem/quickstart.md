# Quickstart: Inspection Ecosystem

```ts
const report = evaluateInspectionPolicy({
  manifest,
  completion: session.getCompletionEvidence(),
  policy: EVIDENCE_GRADE_INSPECTION_POLICY_V1
});

if (!report.ok) throw new Error("Inspection evidence policy failed.");

const bundle = createEvidenceBundle({ manifest, completion, policyReport: report });
const envelope = await signEvidenceBundle(bundle, {
  algorithm: "Ed25519",
  keyId: "audit-key-2026-01",
  sign: (bytes) => applicationKeyService.sign(bytes)
});
```

The SDK never receives private key material. Verification recomputes canonical bytes and SHA-256 before invoking the application's trust callback.
