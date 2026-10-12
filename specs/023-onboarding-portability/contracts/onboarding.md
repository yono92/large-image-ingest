# Example And Qualification Contracts

## Commands
- large-image-ingest-minimal [--root <directory>] [--file <path>] [--help]
- large-image-ingest-verified [--root <directory>] [--help]
- Duplicate options, unknown options and missing values: nonzero usage error. Help: zero, no transfer. File is unsupported in verified command.
- Direct compiled-script paths remain supported with the same options.
- Minimal runMinimalUpload options gain file? (example module only). No-file calls preserve defaults; any source is local and read-only. No dimensions or domain data invented.

## Failures
Codes: usage.invalid, input.not_found, input.access_denied, input.not_regular, input.empty, input.changed, input.failed, storage.access_denied, storage.full, server.port_in_use, validation.failed, verification.failed, example.failed. Fixed code/message guidance on stderr, nonzero status, no raw cause/path/filename/checksum. Existing successful safe JSON and opt-in local artifact-root display remain.

## Manager Runner
scripts/verify-onboarding-package.cts [--manager npm|pnpm|yarn|bun]; default npm. Every selected manager must exist and actually install the tarball. Installation scripts disabled. Yarn PnP must have its loader and no node_modules. ESM/CommonJS smoke covers root/core/node/workflow; React/geotiff absent. Both bins execute through manager resolution with Node runtime. Minimal also runs a temp real source with a spaced path. Stage failures are sanitized; no missing-tool skips.

CI runs four pinned manager jobs against the same built tarball. --package <tarball> permits CI reuse without rebuilding/repacking; omission packs local built outputs. This is consumption qualification, not alternative checkout build tooling or Bun runtime qualification.
