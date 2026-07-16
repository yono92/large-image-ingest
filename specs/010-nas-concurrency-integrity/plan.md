# Implementation Plan: NAS Concurrency Integrity

**Branch**: `agent/nas-concurrency-integrity` | **Date**: 2026-07-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-nas-concurrency-integrity/spec.md`

## Summary

Harden the Node NAS gateway so every mutation of one session is coordinated through the existing shared lock contract, while preserving the public `"finalize"` lock scope and NAS session v0.1 schema. Stage and cancel operations wait briefly for the session lock, finalization retains its existing fail-fast contention behavior, and expired-session cleanup skips live locks. Persist metadata through a collision-resistant same-directory candidate followed by atomic promotion, and remove abandoned candidates only while holding the session lock. Add real-filesystem, cross-gateway concurrency and fault-injection tests, then release the compatible correction as 1.3.1.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20+

**Primary Dependencies**: Native Node filesystem, crypto, path, and stream APIs; no new runtime dependency

**Storage**: NAS or local filesystem staging directories, JSON session metadata, chunk files, lock directories, and finalized targets

**Testing**: Vitest with real temporary directories, two gateway instances, controlled locks and clocks, and mocked filesystem failure injection where required

**Target Platform**: Node.js 20+ servers on filesystems that provide atomic same-directory rename

**Project Type**: Published TypeScript library with a Node-only NAS gateway subpath

**Performance Goals**: Preserve all 16 concurrently submitted chunk records in 100 repeated runs; serialize only same-session mutations while allowing different sessions to proceed independently

**Constraints**: No public signature, exported type, error-code union, or NAS session schema change; no committed metadata deletion before promotion; no whole-file buffering beyond existing chunk behavior; no new credentials, logging, or dependencies

**Scale/Scope**: One source module, focused NAS tests, version metadata, three release documents, and Spec Kit artifacts for a 1.3.1 patch

## Constitution Check

*GATE: Passed before research and re-checked after design.*

- Original preservation: PASS. Coordination changes only staging metadata and chunk ownership; source artifacts and finalized bytes remain subject to existing checksum verification.
- Recoverability: PASS. The last committed metadata remains readable after failed candidate writes, and stale candidates are removed only under exclusive session coordination.
- Adapter boundaries: PASS. All behavior remains in the Node NAS gateway; core, browser, React, tus, and S3 modules are unchanged.
- TypeScript contracts: PASS. `NasGateway`, lock-provider signatures, the `"finalize"` scope literal, error-code union, and `large-image-ingest.nas-session.v0.1` remain unchanged.
- Validation and security: PASS. Existing session, path, chunk, checksum, expiry, and target validation remains authoritative; no sensitive values are newly logged.
- Documentation and tests: PASS. The design requires cross-gateway races, same-index consistency, lifecycle races, candidate cleanup, type/build/package gates, and 1.3.1 release documentation.

## Project Structure

### Documentation (this feature)

```text
specs/010-nas-concurrency-integrity/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- nas-concurrency-contracts.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/
`-- nas.ts

tests/
|-- nas.test.ts
`-- package-exports.test.ts

docs/
|-- roadmap.md
`-- server-operational-guide.md

package.json
package-lock.json
CHANGELOG.md
```

**Structure Decision**: Keep the compatible correction inside the existing Node NAS module and its focused test file. Do not introduce a new package, runtime dependency, schema, or public coordination abstraction.

## Complexity Tracking

No constitution violations require justification.
