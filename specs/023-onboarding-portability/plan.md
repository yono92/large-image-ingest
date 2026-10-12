# Implementation Plan: Real-File Onboarding And Package Portability

**Branch**: codex/typescript-tooling | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

## Summary
Extend only example/tooling surfaces. The minimal example accepts --file and uses Node's file-backed Blob, while the generated fixture remains the default. Shared CLI parsing and allowlisted errors serve both examples. Two packaged bins make example resolution independent of node_modules. Replace manual tar extraction with actual manager installation; add a four-manager CI matrix.

## Technical Context
- TypeScript strict NodeNext, Node 20+, native fs.openAsBlob/stat and existing SDK contracts; no runtime dependency added.
- Local reference HTTP/storage remain unchanged; supplied input is read-only and checked before server creation. Filesystem metadata guard surrounds execution and native Blob reads detect changes.
- Vitest integration/unit tests and isolated consumers; temporary sources/logs outside repository, no cloud targets.
- Qualification pins: npm 10.8.2, pnpm 10.32.1, Yarn 4.12.0 with PnP/ESM loader, Bun 1.3.5 installer with Node example runtime. Modern Yarn node-modules mode may be additionally checked without claiming every manager version.
- Test runner selects one manager via --manager; missing tools fail. Local tools are provisioned separately, CI installs pins, and repository lockfile remains npm.

## Constitution Check
PASS before/after design: original byte preservation and bounded slicing; existing upload/recovery authority; no new provider/framework coupling; SDK APIs/schema unchanged; fixed sanitized errors; explicit source rejection and independent stored checksum; specs/docs/focused tests and required package checks included. No exception needed.

## Project Structure
- examples/onboarding/source.mts: validate stat and open read-only file-backed input, source stability guard.
- examples/onboarding/cli.mts: parse options/help, stable example-only errors and sanitized output.
- examples/onboarding/minimal-upload.mts and verified-workflow.mts: bins/shebangs, shared CLI; only minimal accepts file.
- examples/reference-local/local-server.mts and examples/onboarding/file-stores.mts: descriptor-based fsync preserves disk synchronization under Yarn PnP, whose patched FileHandle.sync is unimplemented.
- package.json: two bin entries and manager test command; package-lock.json root bin metadata synchronized.
- scripts/verify-onboarding-package.cts: one local packed artifact installed by selected manager in isolated consumer, safe stage diagnostics, ESM/CommonJS/optional peer/bin/example assertions.
- .github/workflows/ci.yml: pinned manager consumer matrix using built tarball; existing SDK checks retained.
- tests/onboarding-examples.test.ts and tests/onboarding-cli.test.ts: real source/stability/bounded reads and safe CLI contracts.
- README.md, examples/onboarding/README.md, docs/development.md, CHANGELOG.md, docs/roadmap.md: usage, qualification scope and release changes.

## Phases
1. Shared source/CLI contracts and focused failing tests.
2. Minimal real-file input, shared errors/help and portable bins; qualify existing workflow with unchanged fixture.
3. Actual manager consumer runner and pinned CI; verify modules/optional peers/examples/source CLI on packed artifact.
4. Update docs and release notes; package checks, four managers, existing browser/reference gates; record outcomes in tasks.

## Complexity Tracking
None. File-backed Blob preserves existing SDK slicing interfaces; bins avoid new exports and shell-specific path resolution.
