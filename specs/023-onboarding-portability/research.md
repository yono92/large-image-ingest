# Research

## File-backed input
Decision: native Node fs.openAsBlob after stat validation, with before/after source identity checks. [Node 20 docs](https://nodejs.org/docs/latest-v20.x/api/fs.html#fsopenasblobpath-options) describe file-backed reads and modification checks. Rationale: existing SDK consumes Blob.slice; no new core adapter or whole-file read. Reject readFile/new Blob over the entire source. Native API is experimental on Node 20; documentation notes that boundary.

## Portable examples
Decision: two bin entries and shebangs in compiled example modules. Yarn PnP has no node_modules; [Yarn run](https://yarnpkg.com/cli/run) resolves dependency binaries. No new export subpaths or resolving unexported package.json. Preserve Node runtime even when Bun installs the package.

## Consumer verification
Decision: manager-selected actual local tarball installation, lifecycle scripts disabled and private stage capture; Yarn PnP ESM loader enabled and launcher-provided environment retained. [Yarn configuration](https://yarnpkg.com/configuration/yarnrc), [pnpm add](https://pnpm.io/cli/add), [Bun add](https://bun.sh/docs/pm/cli/add). Research was delegated per speckit-plan; pin reproducible release baselines rather than claim latest/all versions. Reject manual extraction as installation evidence.

Observed Yarn 4.12.0 PnP failure: its patched FileHandle.sync throws "Method not implemented" even for real local output files. Callback-based Node fsync on the same descriptor succeeds. Use promisified fsync in the reference server and onboarding stores, retaining actual disk synchronization; do not skip the durability boundary. Actual PnP example execution is the regression gate.

## Errors
Decision: fixed example-only cause codes/messages, input/storage-stage wrapping and small known SDK/OS-code mapping. Unknown failures receive fixed generic guidance. No raw exception/details logging. No new SDK error API.
