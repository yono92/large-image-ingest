import { createManifest } from "large-image-ingest";
import {
  evaluateDomainValidationProfile,
  loadBundledDomainProfile
} from "large-image-ingest/profiles";

const file = new Blob(["inspection-source"], { type: "image/tiff" });
Object.defineProperties(file, {
  name: { value: "inspection.tif" },
  lastModified: { value: 0 }
});

const manifest = await createManifest(file as Blob & { name: string; lastModified: number }, {
  metadata: {
    lotId: "LOT-2026-001",
    waferId: "W12",
    inspectionTimestamp: "2026-08-31T10:00:00+09:00"
  },
  image: { width: 4096, height: 4096, colorDepth: 16 }
});
const profile = await loadBundledDomainProfile("semiconductor-inspection");
const evaluation = await evaluateDomainValidationProfile({
  profile,
  manifest,
  structuralEvidence: {
    source: "sdk_observed",
    format: "tiff",
    width: 4096,
    height: 4096,
    bitDepth: 16
  }
});

console.log({
  profile: evaluation.profile.name,
  result: evaluation.result,
  failedRuleCodes: evaluation.failedRuleCodes
});
