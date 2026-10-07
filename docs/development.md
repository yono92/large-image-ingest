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

## Spec Kit Tools

The six upstream Spec Kit 1.0.2 executable helpers have been removed from the working tree and from all branch/tag histories at the maintainer's request. SDK execution, build and tests do not require them. The installed `speckit-*` skills that call these helpers require matching tools to be provisioned separately before use; this repository and its release tags no longer supply them. Generated runtime modules and shell files are ignored by Git.

`.specify/feature.json` is a local working-feature pointer, ignored by the upstream configuration. It is not shared through Git. Formal feature artifacts remain under `specs/`.

## Evidence History

Dated reports freeze the exact source revisions measured at that time. Preserve historical reports when migrating source languages; generate a separately dated report for the new TypeScript candidates with `npm run evidence:adoption`. Physical line counts include TypeScript declarations under the published counting policy. These counts describe the fixture's maintenance surface, not actual adoption or production outcomes.
