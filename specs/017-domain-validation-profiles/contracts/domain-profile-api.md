# Contract: Domain Profile API

```ts
import {
  loadBundledDomainProfile,
  evaluateDomainValidationProfile
} from "large-image-ingest/profiles";

const profile = await loadBundledDomainProfile("semiconductor-inspection");
const evaluation = await evaluateDomainValidationProfile({
  profile,
  manifest,
  structuralEvidence: {
    source: "sdk_observed",
    format: "bigtiff",
    width: 4096,
    height: 4096,
    bitDepth: 16
  }
});

if (evaluation.result !== "failed" && evaluation.result !== "invalid_configuration") {
  const session = createIngestSession(file, {
    manifest,
    domainProfile: evaluation.sessionBinding,
    transport,
    resume: { store }
  });
}
```

No profile is selected or inferred when `domainProfile` is omitted. A session binding is tied to one manifest ID and cannot be produced from a failed evaluation. New persistent resume records retain only the profile reference. Resume with a missing or different reference produces `resume.profile_mismatch` before transport resume or acknowledged-byte reuse.

Derived profiles are constructed through `deriveDomainValidationProfile()` using explicit additions, provably tighter replacements, metadata mappings, and categorized exceptions. `validateDomainValidationProfile()` validates untrusted definitions and effective-policy digests before evaluation.
