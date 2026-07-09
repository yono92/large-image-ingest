# Roadmap TODO

This roadmap captures likely minor-release work after 1.1.0. Items here are not committed implementation scope until they have their own Spec Kit artifacts.

## 1.2.0 TODO - Derivatives And Preview Foundations

- [ ] Specify browser-safe derivative manifest entries for previews, thumbnails, and tile metadata without mutating the original.
- [ ] Add preview/thumbnail/tile package planning under the adapter model.
- [ ] Define image metadata enrichment boundaries for formats where dimensions are caller-provided or server-derived.
- [ ] Decide whether preview generation belongs in browser helpers, Node helpers, or both.
- [ ] Add tests proving derivatives are separately referenced and never replace original manifest identity.
- [ ] Update README examples for derivative references once the public contract is specified.

## 1.3.0 TODO - UI Adapters And Advanced Upload Modes

- [ ] Specify React hooks and lightweight UI bindings as optional adapters over the core session contract.
- [ ] Evaluate parallel upload support and its impact on chunk planning, receipt ordering, resume checkpoints, and transport capabilities.
- [ ] Define per-chunk checksum policy for transports that require provider-specific integrity records.
- [ ] Assess whether scoped packages are needed after 1.1 and 1.2 API growth.
- [ ] Add focused tests for UI adapter state mapping without requiring browser UI frameworks in core tests.
- [ ] Update examples for application progress UI, retry controls, pause/resume, and recovery lists.

## Parking Lot

- [ ] Provider-specific AWS S3 package if the generic S3-compatible multipart adapter becomes too broad.
- [ ] Web Worker checksum helper if checksum work causes main-thread pressure in real applications.
- [ ] Dedicated migration guide if subpath exports move to scoped packages.
