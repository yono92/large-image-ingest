# Research

- Decision: .cts for CommonJS, .mts for ESM. Rationale: preserve CommonJS exports and import.meta semantics with minimal changes. Alternative: rewriting every module to ESM introduces unnecessary lifecycle/bootstrap changes.
- Decision: development-only tsx. Rationale: Node 20 cannot execute typed source natively, and prebuild tools must run without dist. Alternative: compile every tool first adds bootstrap/root-path complexity.
- Decision: emit executable examples under dist/examples with tsc. Rationale: installed consumers run node without a loader, while Git holds only TypeScript sources.
- Decision: register CommonJS and ESM hooks only in Node Vitest setup. Rationale: nested createRequire calls otherwise bypass Vitest transforms.
- Decision: explicitly type adapters using SDK interfaces, validate unknown input at boundaries, and use local harness/report contracts. Do not hide errors behind blanket compiler suppression.
- Decision: remove all shell helpers locally and purge .cjs/.mjs/.sh files across branch/tag histories after explicit user authorization. SDK commands are independent of Spec Kit executables; installed skills requiring them need separate matching-version provisioning. Historical tags can no longer restore these tools.
- Decision: freeze historical adoption report unchanged and produce a separately dated source comparison. Physical line counts include type declarations and must be recomputed after migration.

Research review: build researcher confirmed nested require, child-process loaders and uppy relative dist lookup; contract researcher confirmed adapter contextual types, exact optional values, result union narrowing and stale node alias.

Implementation observation: Node 22.14 can route a TypeScript CommonJS entry through its ESM translator. Use explicit createRequire(__filename) for dynamic CommonJS dependencies and compare process.argv[1] with __filename for CLI guards. This preserves native package JSON/dependency loading without relying on translator caches. DOM tests skip tsx registration to avoid cross-realm esbuild globals.
