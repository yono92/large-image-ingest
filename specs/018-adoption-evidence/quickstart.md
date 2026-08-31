# Quickstart: Comparative Adoption Evidence

```bash
npm run build
npm run evidence:adoption -- --output benchmarks/results/2026-08-adoption-evidence.json
npm run test:adoption-evidence
npm run typecheck
npm test
git diff --check
```

Expected: three eligible happy paths, 42 candidate-scenario results, 150 raw trials (four scenarios × ten trials plus ten deterministic scenarios, for each of three candidates), deterministic implementation counts/classifications, valid aggregate recomputation, current input digest, and zero unsafe report values.

The full release matrix also includes all examples, UI unit/browser, conformance, browser checksum, reference, integration safe-skip, build/package consumption, and package dry-run gates.
