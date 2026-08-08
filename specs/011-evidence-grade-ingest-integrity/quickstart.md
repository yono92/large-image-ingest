# Quickstart Validation: Evidence-Grade Ingest Integrity

## Prerequisites

```bash
npm ci
```

All default scenarios use in-memory files and fake transports. No provider account, network service, mounted NAS, or credential is required.

## Scenario 1: Reject A Same-Metadata Different-Content Resume

Run the focused resume suite:

```bash
npm test -- --run tests/session-resume.test.ts tests/resume.test.ts
```

Expected outcome:

- the original and replacement fixtures have the same name, size, MIME type, and modification time;
- resume calculates byte-content identity before any transport call;
- the replacement fixture fails with `resume.content_mismatch`;
- the matching fixture skips acknowledged chunks and completes.

## Scenario 2: Produce Verified And Unverified Completion Evidence

```bash
npm test -- --run tests/completion-evidence.test.ts tests/session.test.ts
```

Expected outcome:

- matching stored size and checksum produce `verified` evidence;
- no stored-object proof produces `completed-unverified` evidence;
- conflicting stored size or checksum fails completion and emits no successful evidence;
- an existing `void` custom transport remains compatible.

## Scenario 3: Validate Public JSON Schemas

```bash
npm test -- --run tests/schema-contracts.test.ts
```

Expected outcome:

- current manifest, resume v0.3, and completion v1 fixtures pass their packaged schemas;
- malformed and unsupported fixtures fail deterministically;
- supported legacy resume fixtures retain documented behavior;
- schema files are present in the npm package contents.

## Scenario 4: Verify Safe Completion Diagnostics

```bash
npm test -- --run tests/diagnostics.test.ts
```

Expected outcome:

- safe summaries retain evidence ID, manifest ID, status, schema, producer version, transport name, counts, algorithms, timestamps, and typed codes;
- filenames, customer metadata, checksum values, upload IDs, storage locations, resume handles, and opaque provider values are absent.

## Scenario 5: Run Release Gates

```bash
npm run typecheck
npm run typecheck:examples
npm test
npm run build
npm run test:reference
npm pack --dry-run
```

Expected outcome:

- the package version and producer constant match;
- all ESM/CommonJS entrypoints consume successfully;
- the credential-free interruption/resume/verification reference path still passes;
- packaged JSON Schemas and documentation appear in the tarball.
