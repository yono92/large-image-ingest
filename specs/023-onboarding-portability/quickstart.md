# Validation Guide

1. Run npm run typecheck, npm test and npm run build.
2. Run node dist/examples/onboarding/minimal-upload.mjs --file '<local image>' --root '<new output directory>'. Expect completed/storedVerified; independently compare retained target/source and verify source unchanged.
3. Run both examples with --help and invalid/missing/empty sources; expect appropriate safe codes and exit statuses.
4. Provision pinned managers outside the repository. Run npm run test:onboarding-package with -- --manager npm, pnpm, yarn and bun. Expect both formats and all three executable journeys to pass; Yarn consumer must use PnP.
5. Run existing reference/browser checks and inspect npm pack --dry-run for private fixtures, manager files and Spec Kit helpers.
