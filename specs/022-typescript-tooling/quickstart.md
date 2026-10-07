# Validation Guide

1. Install development dependencies, remove generated dist, then run npm run typecheck and npm test.
2. Run npm run build; ESM/CommonJS package-consumption checks must pass.
3. Run npm run test:onboarding-package: node-only compiled minimal/full examples verify stored bytes, recovery and evidence reload.
4. Run browser UI, conformance, browser-checksum and local HTTP reference checks.
5. Generate new adoption evidence from TypeScript candidates; verify all classifications and hashes without changing historical evidence.
6. Inspect source inventory: no handwritten .js/.mjs/.cjs outside ignored dist/dependencies. Check no shell files are tracked; SDK checks do not require Spec Kit helpers.
