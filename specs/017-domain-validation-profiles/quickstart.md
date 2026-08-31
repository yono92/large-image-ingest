# Quickstart: Domain Validation Profiles

```bash
npm run typecheck
npx vitest run tests/domain-profiles.test.ts tests/domain-profile-derivation.test.ts tests/domain-profile-session.test.ts tests/domain-profile-security.test.ts
npm run typecheck:examples
npm run build
git diff --check
```

Expected: all three baseline matrices, deterministic digests/outcomes, derivation and invalid-definition fixtures, no-read evidence, session preflight, resume mismatch, safe outputs, ESM/CJS exports, and backward-compatibility tests pass.

The release gate also includes the full unit/UI, transport conformance, browser checksum, reference, integration safe-skip, package dry-run, and diff matrix.
