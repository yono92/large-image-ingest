# Quickstart Validation: Extreme-File Execution

```bash
npm test -- --run tests/checksum-worker.test.ts tests/checksum.test.ts
npm test -- --run tests/session-parallel.test.ts tests/session-resume.test.ts
npm run typecheck
npm run typecheck:examples
npm test
npm run build
npm run test:reference
npm pack --dry-run
```

Expected: worker parity and abort tests pass; active upload calls remain within bounds; mixed parallel successes persist before failure; resume skips them; existing official transports stay sequential; package gates pass.
