# Contract: Preservation API

```ts
import {
  evaluatePreservationMapping,
  exportBagIt,
  exportOcflObject,
  validateBagIt,
  validateOcflObject
} from "large-image-ingest/preservation";
```

```ts
const mapping = await evaluatePreservationMapping({
  profile: "bagit-1.0-sha256",
  manifest,
  original: { bytes: originalFile },
  derivatives: [{ derivative: previewReference, bytes: previewBlob }],
  provenance,
  digestPolicy: "require-existing"
});

if (mapping.status === "blocked") throw new Error("Not exportable");

const result = await exportBagIt(mapping, {
  destination: "/new/export/bag"
});
```

The mapping object owns a private execution handle to verified Blob sources. JSON serialization exposes only the public mapping. Export rejects reconstructed/untrusted mappings without the handle.

`exportBagIt` and `exportOcflObject` require a nonexistent destination, never append, never import, never manage an OCFL storage root, and never replace a completed destination. Validators return typed safe issues rather than throwing raw filesystem paths or contents.
