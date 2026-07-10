# Quickstart Validation: React Headless Adapter

## Install For Development

```bash
npm install
```

## Headless Usage

Create one controller for one file, place it in the provider, and bind the returned hook state and actions to application-owned controls.

Expected behavior:

- multiple hook consumers share one session operation
- progress advances from zero to one
- pause, cancel, and resume delegate to the active core session
- unmounting a consumer does not cancel upload
- no CSS or visible UI is emitted by the package

## Validation Scenarios

1. Render progress and controls under one provider and complete a fake upload.
2. Mount and unmount consumers repeatedly and verify subscriber cleanup.
3. Render the provider on the server from an idle controller.
4. Import root and core entrypoints in an environment where React is absent.

## Verification

```bash
npm run typecheck
npm run typecheck:examples
npm test
npm run build
npm pack --dry-run
```
