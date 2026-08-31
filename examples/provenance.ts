import { createIngestSession, createManifest } from "large-image-ingest/core";
import {
  createIngestProvenanceRecorder,
  createSafeProvenanceSummary,
  persistIngestProvenance,
  type ProvenanceSink
} from "large-image-ingest/provenance";
import type { IngestFileLike, UploadTransport } from "large-image-ingest/core";

declare const file: IngestFileLike;
declare const transport: UploadTransport;
declare const auditSink: ProvenanceSink;

const manifest = await createManifest(file);
const recorder = createIngestProvenanceRecorder({
  manifest,
  policy: { id: "inspection-default", version: "1.0.0" },
  transport: {
    category: "application-transport",
    ...(transport.capabilities ? { capabilities: transport.capabilities } : {})
  }
});

const session = createIngestSession(file, {
  manifest,
  transport,
  onEvent(event) {
    recorder.observeIngestEvent(event);
  }
});

await session.start();
recorder.recordVerification({
  status: "verified",
  verifierCategory: "stored-original",
  expectedEvidenceCategories: ["byte-count", "whole-file-sha256"],
  observedEvidenceCategories: ["byte-count", "whole-file-sha256"]
});

const artifact = await recorder.seal();
const summary = await createSafeProvenanceSummary(artifact);
await persistIngestProvenance(artifact, auditSink);
void summary;
