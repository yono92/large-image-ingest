# Development Sources

All maintained SDK, example, script, benchmark and test-fixture sources use TypeScript. `.cts` preserves CommonJS module behavior; `.mts` preserves ESM behavior. Relative `.cjs`/`.mjs` import specifiers identify the emitted runtime files and resolve to their TypeScript sources during development.

Use Node.js 20 or later and `npm ci`. Development commands run TypeScript through the development-only `tsx` loader (`node --import tsx`). `npm run typecheck` checks both SDK outputs and all migrated tooling under the SDK's strict compiler settings. Browser UI examples have their own existing typecheck commands.

`npm run build` starts with a clean `dist/`, compiles the ESM/CommonJS SDK, emits Node examples into `dist/examples/`, and compiles the browser checksum benchmark into `dist/benchmarks/`. Generated JavaScript is ignored by Git. npm consumers execute compiled examples with plain Node and do not install `tsx`.

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:onboarding-package
npm run test:conformance
npm run test:reference
npm run test:browser-checksum
```

## Package Manager Consumption

Repository dependency installation/builds use npm. The consumer matrix qualifies npm 10.8.2, pnpm 10.32.1, Yarn 4.12.0 PnP and Bun 1.3.5 installing the same built tarball, with Node.js 20+ executing the examples. This does not qualify Bun runtime execution or every manager version/platform.

Provision the selected manager outside this repository, then build once and run:

```bash
npm run build
npm run test:package-manager -- --manager npm
npm run test:package-manager -- --manager pnpm
npm run test:package-manager -- --manager yarn
npm run test:package-manager -- --manager bun
```

CI provisions pinned managers in temporary tool directories and supplies the same tarball using `--package <tarball>`. Consumer installation disables lifecycle scripts and uses local/offline inputs; no cloud service is contacted. Yarn enables its ESM PnP loader and must have no `node_modules`. Each qualification checks root/core/node/workflow ESM/CommonJS, absent optional peers, both example bins and real-file byte preservation. Tool failure is reported by a sanitized stage, without raw manager output. Temporary artifacts are removed after success/failure.

## Spec Kit Tools

The six upstream Spec Kit 1.0.2 executable helpers have been removed from the working tree and from all branch/tag histories at the maintainer's request. SDK execution, build and tests do not require them. The installed `speckit-*` skills that call these helpers require matching tools to be provisioned separately before use; this repository and its release tags no longer supply them. Generated runtime modules and shell files are ignored by Git.

`.specify/feature.json` is a local working-feature pointer, ignored by the upstream configuration. It is not shared through Git. Formal feature artifacts remain under `specs/`.

## Evidence History

Dated reports freeze the exact source revisions measured at that time. Preserve historical reports when migrating source languages; generate a separately dated report for the new TypeScript candidates with `npm run evidence:adoption`. Physical line counts include TypeScript declarations under the published counting policy. These counts describe the fixture's maintenance surface, not actual adoption or production outcomes.
