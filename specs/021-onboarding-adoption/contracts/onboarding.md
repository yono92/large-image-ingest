# Contracts

## Commands
- `npm run example:minimal`: build checkout then run minimal example.
- `npm run example:verified`: build checkout then run complete workflow.
- Installed consumer: `node node_modules/large-image-ingest/examples/onboarding/minimal-upload.mjs` or `verified-workflow.mjs`; no checkout tooling.
- Optional `--root <directory>` retains artifacts; default unique OS temp directory.
- `npm run adoption:report -- --input <local-json>`: validate and summarize explicit local records; no network or writes.
- `npm run test:onboarding-package`: pack/build and execute shipped examples in an isolated consumer.

## Persistence
Conform to ResumeStore, WorkflowCheckpointStore and WorkflowEvidenceSink. Hash record IDs for paths. Serialize checkpoint CAS, return conflict for stale revisions. Exclusively persist evidence revisions; reject different operation/payload reuse; reconcile identical repeats. Missing records are undefined/not_found; corrupted records are not absence. One process owns each store root.

## Reference server
Internal trusted `resolveStoredPath(manifestId)` resolves only completed generated uploads; no HTTP path exposure.

## Report
Include denominators, outcomes, assistance, known active projects by evidence strength and unknown actual population. Omit IDs, timestamps, paths, URLs, raw records and customer metadata from default output.
