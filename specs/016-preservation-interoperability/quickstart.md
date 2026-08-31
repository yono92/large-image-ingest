# Quickstart: Preservation Interoperability

```bash
npm run typecheck
npx vitest run tests/preservation-mapping.test.ts tests/preservation-bagit.test.ts tests/preservation-ocfl.test.ts tests/preservation-security.test.ts
npm run typecheck:examples
npm run build
git diff --check
```

Expected: both standards export and independently validate the original, two derivatives, manifest, provenance, and relationship sidecar; all mutation and unsafe-path fixtures fail safely; identical OCFL bytes share one content path; incomplete writes never replace a destination.

The full release matrix is the same as feature 015 and includes all unit/UI, conformance, reference, browser, integration-safe skip, package dry-run, and diff gates.
