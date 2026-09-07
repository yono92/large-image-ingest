export const evidenceIdentityMutationPaths = [
  "id",
  "workflowId",
  "subject.manifest.id",
  "subject.sourceIdentity.value",
  "policy.profile.effectivePolicyDigest.value",
  "provenance.id",
  "terminal.state",
  "integrity.value"
] as const;

export const forbiddenWorkflowValues = {
  credential: "credential-secret-value",
  presignedUrl: "https://storage.example.invalid/upload?signature=secret",
  objectKey: "customer/private/original.tif",
  rawProviderError: "provider-secret-error-body",
  rawReceipt: "provider-secret-receipt",
  customerMetadata: "customer-secret-metadata"
} as const;
