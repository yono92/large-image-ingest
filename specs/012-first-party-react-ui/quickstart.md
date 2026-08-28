# Quickstart: First-Party Inspection Upload UI

This document is the planned operator and release-validation path for the first-party React UI. Commands and exports described here become executable as the implementation phases land.

## 1. Run The Official Reference Experience

```bash
npm install
npm run example:inspection-ui:fixture
npm run example:inspection-ui
```

Open the local URL printed by the example runner. The reference app must use only published package entrypoints plus the provider-neutral local reference transport; it must not import files from `src/` or depend on Uppy.

## 2. Validate The Default Panel

With no host theme overrides:

1. Select one inspection image through the native file picker.
2. Confirm the source name, size, validation state, identity/checksum preparation, acknowledged upload progress, and available actions are visible.
3. Pause and resume while transfer is active.
4. Confirm transfer completion is displayed separately from stored-object verification.
5. Confirm successful verification is the terminal success state.

Expected result: the exact selected `File` reaches the configured controller, no source preview is generated, and the panel remains usable without application CSS.

## 3. Validate Interruption Recovery

1. Start a sufficiently large local upload and wait for acknowledged progress.
2. Pause or reload the page before completion.
3. Re-select the exact same local source.
4. Review the safe recovery summary and choose resume.
5. Confirm progress continues from the controller/store-authoritative offset.
6. Repeat with a different file or incompatible chunking configuration.

Expected result: compatible state can resume; incompatible state is explained and cannot be resumed. The UI never renders a complete resume record, provider URL, token, or full manifest.

## 4. Validate Failure And Control States

Exercise each path independently:

- reject an invalid MIME type, extension, size, dimensions, or required metadata rule;
- request pause and confirm the UI shows intent before the settled paused state;
- cancel an active transfer and confirm it cannot be mistaken for failure or completion;
- inject a retryable transport failure and retry;
- inject a non-retryable failure and replace the source;
- make stored-object verification fail, then retry verification without re-uploading a verified source unnecessarily.

Expected result: every action is enabled only in valid phases, typed categories drive recovery guidance, and raw internal error strings or sensitive provider details are not exposed.

## 5. Validate Composition And Branding

Build a second view with `InspectionUploadProvider`, `useInspectionUploadUi`, and selected primitives instead of `InspectionUploadPanel`.

Then:

1. Reorder the validation, progress, control, and verification sections.
2. Replace visible labels through the labels contract.
3. Override documented `--lii-*` CSS tokens.
4. Supply bounded header/help/footer slots.
5. Supply a small caller-owned derivative preview descriptor.

Expected result: behavior and accessibility remain intact without copying internal reducer/controller logic. The preview must be clearly presented as a derivative and must not be generated from the original by the package.

## 6. Accessibility And Responsive Check

Verify the default and composed experiences at desktop width, 320 CSS pixels, and 200% browser zoom.

- Complete the full journey with keyboard only.
- Confirm visible focus, accessible names, field instructions, and validation associations.
- Confirm determinate progress exposes current/max values and indeterminate preparation is announced accurately.
- Confirm new failures and state changes use appropriate live-region behavior without repeated announcements.
- Confirm reduced-motion preference removes non-essential motion.
- Run the automated accessibility scan for every major phase, including recovery and verification failure.

Expected result: no critical automated violations, no clipped action path, and no pointer-only operation.

## 7. Package Boundary Check

Create a small consumer fixture that imports:

```ts
import { InspectionUploadPanel } from "large-image-ingest/react-ui";
import "large-image-ingest/react-ui/styles.css";
```

Also build a headless fixture that imports only `large-image-ingest/core` or `large-image-ingest/react`.

Expected result: the styled fixture receives the component and CSS, while headless consumers receive no UI CSS, Uppy code, or new required runtime dependency. Server rendering the UI entrypoint must not access browser globals during import or render.

## 8. Release Verification

```bash
npm run typecheck
npm run typecheck:examples
npm run typecheck:uppy-example
npm run typecheck:inspection-ui-example
npm test
npm run test:ui
npm run build
npm run test:reference
npm run smoke:exports
npm pack --dry-run
npm audit --audit-level=moderate
```

Before release, inspect the tarball, the optional UI JavaScript/CSS size, README examples, `docs/react-ui.md`, Uppy integration positioning, roadmap, changelog, and version wording. Generated fixtures, local upload data, screenshots, traces, and credentials must not be present in the package.

## Acceptance Summary

The feature is ready only when all of the following are true:

- the first-party panel supports selection through verified completion and recovery;
- the composable primitives support a materially different branded layout;
- the exact original is preserved and previews remain caller-owned derivatives;
- controller/store/verifier authority is never replaced by optimistic UI state;
- accessibility and responsive obligations pass in both default and composed modes;
- the Uppy example still works but is clearly an optional integration recipe;
- headless consumers remain unaffected by UI code and styles;
- documentation and package contents describe the implemented behavior exactly.

## Release Evidence — 2026-08-28

The Phase E release gates were reproduced from the repository root after the final controller, reference-app, browser, and package-boundary fixes:

- All four TypeScript checks passed: package ESM/CommonJS, shared examples, Uppy example, and the official inspection UI example.
- `npm test` passed 33 files and 174 tests.
- `npm run test:ui` passed 5 unit/DOM/CSS files with 15 tests and 3 Chromium journeys. The browser journeys cover the 320 CSS-pixel layout, CSS 200% zoom, reduced motion, keyboard activation, default and composed themes, safe validation failure, real-browser axe scans with zero serious or critical violations, stored-original verification, and pause/reload/exact-source-reselection/resume.
- The focused compatible recovery gate completed 10 interrupted-session trials with zero duplicate acknowledged bytes. Its mismatched-source branch rejected compatibility before creating or resuming remote work.
- `npm run test:reference` passed with a 64 MiB source: checksum plus manifest 437.86 ms (146.16 MiB/s), transfer plus resume 204.57 ms (312.86 MiB/s), peak heap/RSS 8.94/155.66 MiB, zero duplicate acknowledged bytes, and verified stored integrity.
- `npm run build` and `npm run smoke:exports` passed. The optional entry barrels measured 1,219 bytes ESM and 4,568 bytes CommonJS; `styles/react-ui.css` measured 5,796 bytes.
- `npm pack --dry-run --json` produced the `large-image-ingest@1.4.0` tarball with 207 entries, 142,344 compressed bytes and 830,403 unpacked bytes. Required React UI artifacts, styles, documentation, official reference files, and the optional Uppy recipe were present; generated fixtures, local data, Vite output, Playwright output, environment files, and credential-pattern files were absent.
- `npm audit --audit-level=moderate` reported zero vulnerabilities, and `git diff --check` passed.
