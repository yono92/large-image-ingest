import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  evaluatePreservationMapping,
  exportBagIt,
  validateBagIt
} from "large-image-ingest/preservation";
import { createManifest } from "large-image-ingest";

const original = new Blob(["unchanged inspection original"], { type: "image/tiff" });
Object.defineProperties(original, {
  name: { value: "inspection.tif" },
  lastModified: { value: 0 }
});

const manifest = await createManifest(original as Blob & { name: string; lastModified: number });
const mapping = await evaluatePreservationMapping({
  profile: "bagit-1.0-sha256",
  manifest,
  original: { bytes: original as Blob & { name: string; lastModified: number } },
  digestPolicy: "require-existing"
});

if (mapping.status !== "blocked") {
  const parent = await mkdtemp(join(tmpdir(), "large-image-ingest-preservation-"));
  const destination = join(parent, "bag");
  await exportBagIt(mapping, { destination });
  const validation = await validateBagIt(destination);
  console.log({ ok: validation.ok, verifiedContentFileCount: validation.verifiedContentFileCount });
}
