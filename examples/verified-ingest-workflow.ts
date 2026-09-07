import { loadBundledDomainProfile } from "large-image-ingest/profiles";
import {
  createVerifiedIngestWorkflow,
  type CreateVerifiedIngestWorkflowOptions,
  type IngestFileLike
} from "large-image-ingest/workflow";

declare const file: IngestFileLike;
declare const adapters: Pick<CreateVerifiedIngestWorkflowOptions,
  "session" | "verifier" | "checkpointStore" | "evidenceSink" | "preservation">;

const profile = await loadBundledDomainProfile("semiconductor-inspection");
const workflow = createVerifiedIngestWorkflow(file, {
  profile: {
    definition: profile,
    structuralEvidence: { source: "sdk_observed", format: "tiff" }
  },
  session: {
    ...adapters.session,
    chunking: { chunkSize: 64 * 1024 * 1024 }
  },
  verifier: adapters.verifier,
  checkpointStore: adapters.checkpointStore,
  evidenceSink: adapters.evidenceSink,
  ...(adapters.preservation ? { preservation: adapters.preservation } : {})
});

const result = await workflow.start();
if (result.status !== "preserved" && result.status !== "evidence_persisted") {
  console.log(result.status, result.allowedActions);
}
