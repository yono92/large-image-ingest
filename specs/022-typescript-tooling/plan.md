# Implementation Plan: TypeScript Tooling Sources

**Branch**: codex/typescript-tooling | **Spec**: [spec.md](spec.md)

## Summary
Preserve CommonJS/ESM semantics with .cts/.mts sources. Use a development-only tsx loader for tools, tests and source servers; compile shipped example modules into dist/examples after the existing SDK build. Keep generated JavaScript ignored and public SDK exports unchanged.

## Technical Context
TypeScript strict NodeNext, Node 20+, native Web/Node APIs, tsx as a devDependency. Compiler configurations: tsconfig.tooling.json (noEmit, all migrated sources, public-source aliases) and tsconfig.runtime-examples.json (emit examples only, built public SDK declarations). tsconfig.runtime-benchmarks.json emits the extracted TypeScript browser probe. No runtime SDK dependency added. Node harness tests register the tsx CommonJS/ESM APIs; DOM tests use normal Vitest transforms; native child processes need explicit TS loader or compiled example path.

## Constitution Check
PASS: preserve original bytes/checksums and recovery authority; adapters remain outside core; strict stable TypeScript contracts; private records and safe output retained; tests and docs updated. Existing constitution 1.0.0 applies unchanged. No exceptions.

## Structure And Phases
1. Rename 44 sources and references and extract the browser HTML module to TypeScript; add dev loader/compiler wiring without dependency on generated scripts for bootstrap.
2. Type persistence/transport/server adapters against public contracts. Type report, harness, CLI and benchmark objects with small local contracts.
3. Wire tests, child processes, package consumers, CI and source inventory checks.
4. Preserve historical evidence; generate a new current TypeScript-source comparison and update claims.
5. Verify clean output, all typechecks/tests/build and compiled consumer examples.

## Constraints
No blanket ts-nocheck/noImplicitAny relaxation. SDK APIs/schema/version unchanged. Shell helpers removed locally and .cjs/.mjs/.sh files purged from all branch/tag histories with explicit force-push authorization; feature.json is machine-local and untracked. Runtime examples use emitted .mjs/.cjs; repositories contain .mts/.cts source only.
