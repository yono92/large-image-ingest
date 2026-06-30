# Implementation Plan: Initial Prototype

## Architecture

The first prototype is a single package with a small framework-agnostic core:

- `validation.ts`: pre-upload file validation.
- `chunks.ts`: deterministic chunk range planning.
- `fingerprint.ts`: fast metadata-based fingerprinting.
- `manifest.ts`: manifest creation.
- `session.ts`: upload session orchestration.
- `types.ts`: public contracts.

Transport behavior is adapter-based. The core owns the upload state machine, but not network details.

NAS compatibility is intentionally deferred to a later adapter. The core should remain compatible with NAS-backed deployments by passing chunks through a transport interface, but it should not contain SMB, NFS, WebDAV, SFTP, or filesystem-specific logic.

## Key Tradeoffs

- The prototype uses a fast metadata fingerprint instead of hashing entire multi-GB files. Strong checksums should be designed separately so browser memory is not exhausted.
- Chunk uploads are sequential for predictable behavior. Parallel upload should be added only after retry, resume, and ordering semantics are specified.
- The package is ESM-first and TypeScript-first. CommonJS compatibility is deferred until there is a concrete consumer need.
- NAS support is harder than object storage because browsers cannot directly target SMB/NFS and because partially written files need atomic finalize semantics. Design it later as a server-side adapter or gateway.

## Verification

The initial checks are:

```bash
npm install
npm run typecheck
npm test
npm run build
```

These require dependencies to be installed first.
